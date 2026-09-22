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
class AuthInterceptor extends Interceptor {
  AuthInterceptor({
    required this.storage,
    required this.onTokenRefreshed,
    required this.onAuthFailed,
  });

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
    if (err.response?.statusCode != 401) {
      handler.next(err);
      return;
    }

    final refreshed = await onTokenRefreshed();
    if (refreshed == null || refreshed.isEmpty) {
      await onAuthFailed();
      handler.next(err);
      return;
    }

    // Retry the original request with the new token.
    final clone = err.requestOptions
      ..headers['Authorization'] = 'Bearer $refreshed';
    try {
      final dio = Dio();
      final response = await dio.fetch(clone);
      handler.resolve(response);
    } on DioException catch (e) {
      if (e.response?.statusCode == 401) {
        await onAuthFailed();
      }
      handler.next(e);
    }
  }

  /// Attach this interceptor to a [Dio] instance.
  void attach(Dio dio) => dio.interceptors.add(this);
}