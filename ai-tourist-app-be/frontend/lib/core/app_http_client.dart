import 'package:dio/dio.dart';

import 'app_config.dart';
import 'secure_storage_service.dart';

/// Dio instance factory. The interceptor chain is set up by
/// [AuthInterceptor.attach]; callers typically use [AppHttpClient.create]
/// which wires everything together.
class AppHttpClient {
  AppHttpClient._(this.dio);

  final Dio dio;

  /// Creates a configured [Dio] with base URL, JSON content type,
  /// and sensible timeouts. Does NOT attach auth — caller does that.
  static Dio createBase() {
    final dio = Dio(
      BaseOptions(
        baseUrl: AppConfig.apiBaseUrl,
        connectTimeout: const Duration(seconds: 10),
        receiveTimeout: const Duration(seconds: 30),
        sendTimeout: const Duration(seconds: 10),
        headers: {'Content-Type': 'application/json'},
      ),
    );
    return dio;
  }

  /// Convenience: base Dio without auth (e.g. for login/signup calls).
  static AppHttpClient unauthenticated() {
    return AppHttpClient._(createBase());
  }
}

/// Dio interceptor that attaches the JWT bearer token from
/// [SecureStorageService] to every request, and performs a single
/// refresh attempt on 401.
///
/// The interceptor holds a reference to the [Dio] instance it is
/// attached to so the 401 retry reuses the same base URL, timeouts,
/// and content-type config — instead of spinning up a bare `Dio()`
/// that would lose all of that. A per-request guard
/// (`RequestOptions.extra['authRetried']`) prevents infinite refresh
/// loops when the retried request is itself a 401.
class AuthInterceptor extends Interceptor {
  AuthInterceptor({
    required this.dio,
    required this.storage,
    required this.onTokenRefreshed,
    required this.onAuthFailed,
  });

  /// The Dio instance this interceptor is attached to. Used to retry
  /// the original request after a successful token refresh so the retry
  /// inherits base URL / timeouts / headers from the configured client.
  final Dio dio;
  final SecureStorageService storage;
  final Future<String?> Function() onTokenRefreshed;
  final Future<void> Function() onAuthFailed;

  @override
  Future<void> onRequest(
    RequestOptions options,
    RequestInterceptorHandler handler,
  ) async {
    final token = await storage.read(SecureStorageKeys.accessToken);
    if (token != null && token.isNotEmpty) {
      options.headers['Authorization'] = 'Bearer $token';
    }
    handler.next(options);
  }

  @override
  Future<void> onError(
    DioException err,
    ErrorInterceptorHandler handler,
  ) async {
    final is401 = err.response?.statusCode == 401;
    // Guard against infinite refresh loops: only retry once per request.
    final alreadyRetried = err.requestOptions.extra['authRetried'] == true;
    if (!is401 || alreadyRetried) {
      handler.next(err);
      return;
    }

    final refreshed = await onTokenRefreshed();
    if (refreshed == null || refreshed.isEmpty) {
      await onAuthFailed();
      handler.next(err);
      return;
    }

    // Retry the original request with the new token via the SAME Dio
    // instance (preserves baseUrl, timeouts, content-type). Mark the
    // clone so a subsequent 401 doesn't trigger another refresh.
    final clone = err.requestOptions
      ..headers['Authorization'] = 'Bearer $refreshed'
      ..extra = {...err.requestOptions.extra, 'authRetried': true};
    try {
      final response = await dio.fetch(clone);
      handler.resolve(response);
    } on DioException catch (e) {
      if (e.response?.statusCode == 401) {
        await onAuthFailed();
      }
      handler.next(e);
    }
  }

  /// Attach this interceptor to its configured [Dio] instance.
  void attach() => dio.interceptors.add(this);
}