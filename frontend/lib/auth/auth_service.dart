import 'package:dio/dio.dart';


import '../core/app_http_client.dart';
import '../core/secure_storage_service.dart';
import 'auth_models.dart';

/// Persists and restores [AuthSession] in [SecureStorageService].
class AuthSessionStore {
  AuthSessionStore(this.storage);

  final SecureStorageService storage;

  Future<void> save(AuthSession session) async {
    await Future.wait([
      storage.write(SecureStorageKeys.accessToken, session.accessToken),
      storage.write(SecureStorageKeys.refreshToken, session.refreshToken),
      storage.write(SecureStorageKeys.userId, session.userId),
      storage.write(SecureStorageKeys.userEmail, session.email),
      if (session.displayName != null)
        storage.write(
          SecureStorageKeys.displayName,
          session.displayName!,
        ),
    ]);
  }

  Future<AuthSession?> read() async {
    final token = await storage.read(SecureStorageKeys.accessToken);
    final refresh = await storage.read(SecureStorageKeys.refreshToken);
    final userId = await storage.read(SecureStorageKeys.userId);
    final email = await storage.read(SecureStorageKeys.userEmail);
    if (token == null || refresh == null || userId == null || email == null) {
      return null;
    }
    final name = await storage.read(SecureStorageKeys.displayName);
    return AuthSession(
      userId: userId,
      email: email,
      accessToken: token,
      refreshToken: refresh,
      displayName: name,
    );
  }

  Future<void> clear() async {
    await Future.wait([
      storage.delete(SecureStorageKeys.accessToken),
      storage.delete(SecureStorageKeys.refreshToken),
      storage.delete(SecureStorageKeys.userId),
      storage.delete(SecureStorageKeys.userEmail),
      storage.delete(SecureStorageKeys.displayName),
    ]);
  }
}

/// Calls the backend auth REST endpoints. Does NOT own session storage —
/// that's [AuthSessionStore]'s job. The notifier wires them together.
class AuthService {
  AuthService({Dio? dio, required this.storage})
      : _dio = dio ?? AppHttpClient.createBase(),
        _sessionStore = AuthSessionStore(storage);

  final Dio _dio;
  final SecureStorageService storage;
  final AuthSessionStore _sessionStore;

  Future<AuthSession> login(LoginRequest req) async {
    final response = await _dio.post(
      '/auth/login',
      data: req.toJson(),
    );
    final session = AuthSession.fromJson(
      response.data as Map<String, dynamic>,
    );
    await _sessionStore.save(session);
    return session;
  }

  Future<AuthSession> signup(SignupRequest req) async {
    final response = await _dio.post(
      '/auth/register',
      data: req.toJson(),
    );
    final session = AuthSession.fromJson(
      response.data as Map<String, dynamic>,
    );
    await _sessionStore.save(session);
    return session;
  }

  /// Refresh the access token using the stored refresh token.
  /// Returns the new access token, or null if refresh failed.
  Future<String?> refresh() async {
    final refresh = await storage.read(SecureStorageKeys.refreshToken);
    if (refresh == null || refresh.isEmpty) return null;

    try {
      final response = await _dio.post(
        '/auth/refresh',
        data: {'refreshToken': refresh},
      );
      // Backend returns { 'accessToken': ..., 'refreshToken': ... } — same
      // field names as login/signup (see AuthSession.fromJson). Reading
      // 'token' here was inconsistent with fromJson and broke after the
      // backend aligned on accessToken/refreshToken.
      final newToken = response.data['accessToken'] as String?;
      if (newToken != null) {
        await storage.write(SecureStorageKeys.accessToken, newToken);
        // Persist a rotated refresh token if the backend returns one.
        final newRefresh = response.data['refreshToken'] as String?;
        if (newRefresh != null && newRefresh.isNotEmpty) {
          await storage.write(SecureStorageKeys.refreshToken, newRefresh);
        }
      }
      return newToken;
    } on DioException {
      return null;
    }
  }

  Future<void> logout() async {
    try {
      await _dio.post('/auth/logout');
    } finally {
      await _sessionStore.clear();
    }
  }

  /// Social login via flutter_appauth. The caller (UI layer) obtains
  /// the [idToken] from the OAuth flow; this exchanges it with the
  /// backend's `/auth/social/{provider}` endpoint.
  Future<AuthSession> loginWithSocial({
    required String provider,
    required String idToken,
  }) async {
    final response = await _dio.post(
      '/auth/social/$provider',
      data: {'idToken': idToken},
    );
    final session = AuthSession.fromJson(
      response.data as Map<String, dynamic>,
    );
    await _sessionStore.save(session);
    return session;
  }
}

/// Google OAuth helper using flutter_appauth. Kept thin so it can be
/// mocked in tests; the actual token exchange goes through [AuthService].
class GoogleAuthClient {
  GoogleAuthClient();

  /// Returns the Google `id_token` after a successful OAuth flow, or
  /// null if the user cancelled. The concrete implementation uses
  /// `flutter_appauth` — see `google_auth_client_io.dart` for the
  /// platform wiring (added in a follow-up task with native config).
  Future<String?> signIn() async {
    // TODO(frontend): wire flutter_appauth with AppConfig.googleClientId
    // and AppConfig.googleRedirectUri once native iOS/Android config is
    // generated. Returns the id_token for exchange via AuthService.
    throw UnimplementedError(
      'Google sign-in requires native platform config (flutter_appauth). '
      'See design.md §3.1 auth module. Wire in task 1.3.4 once iOS/Android '
      'OAuth redirect URIs are provisioned.',
    );
  }
}