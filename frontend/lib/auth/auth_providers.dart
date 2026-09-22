import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../core/app_http_client.dart';
import '../core/secure_storage_service.dart';
import 'auth_models.dart';
import 'auth_service.dart';

/// Single shared [SecureStorageService] for the app.
final secureStorageProvider = Provider<SecureStorageService>(
  (ref) => SecureStorageService(),
  name: 'secureStorageProvider',
);

/// Lazily-built [AuthService]. Uses an unauthenticated Dio for its
/// own login/signup calls; the auth interceptor is attached to a
/// separate "authenticated" Dio used by other services.
final authServiceProvider = Provider<AuthService>(
  (ref) => AuthService(storage: ref.watch(secureStorageProvider)),
  name: 'authServiceProvider',
);

/// Auth state surfaced to the UI.
enum AuthStatus { unknown, authenticated, unauthenticated }

class AuthState {
  const AuthState({
    this.status = AuthStatus.unknown,
    this.session,
    this.isLoading = false,
    this.error,
  });

  final AuthStatus status;
  final AuthSession? session;
  final bool isLoading;
  final String? error;

  AuthState copyWith({
    AuthStatus? status,
    AuthSession? session,
    bool? isLoading,
    String? error,
  }) =>
      AuthState(
        status: status ?? this.status,
        session: session ?? this.session,
        isLoading: isLoading ?? this.isLoading,
        error: error,
      );
}

/// Notifier that drives login/signup/logout and exposes [AuthState].
class AuthNotifier extends StateNotifier<AuthState> {
  AuthNotifier(this._auth, this._storage) : super(const AuthState());

  final AuthService _auth;
  final SecureStorageService _storage;

  /// Restore session on app start.
  Future<void> bootstrap() async {
    final session = await AuthSessionStore(_storage).read();
    state = session == null
        ? const AuthState(status: AuthStatus.unauthenticated)
        : AuthState(status: AuthStatus.authenticated, session: session);
  }

  Future<void> login(LoginRequest req) async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      final session = await _auth.login(req);
      state = AuthState(
        status: AuthStatus.authenticated,
        session: session,
      );
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
        error: _humanize(e),
      );
    }
  }

  Future<void> signup(SignupRequest req) async {
    state = state.copyWith(isLoading: true, error: null);
    try {
      final session = await _auth.signup(req);
      state = AuthState(
        status: AuthStatus.authenticated,
        session: session,
      );
    } catch (e) {
      state = state.copyWith(
        isLoading: false,
        error: _humanize(e),
      );
    }
  }

  Future<void> logout() async {
    try {
      await _auth.logout();
    } finally {
      state = const AuthState(status: AuthStatus.unauthenticated);
    }
  }

  String _humanize(Object error) {
    if (error is Exception) {
      return error.toString().replaceFirst('Exception: ', '');
    }
    return error.toString();
  }
}

final authNotifierProvider =
    StateNotifierProvider<AuthNotifier, AuthState>(
  (ref) => AuthNotifier(
    ref.watch(authServiceProvider),
    ref.watch(secureStorageProvider),
  ),
  name: 'authNotifierProvider',
);

/// Builds a Dio instance with the [AuthInterceptor] attached, for use
/// by services that need authenticated requests (key vault, group, etc.).
final authenticatedDioProvider = Provider<Dio>(
  (ref) {
    final dio = AppHttpClient.createBase();
    final storage = ref.watch(secureStorageProvider);
    final auth = ref.watch(authServiceProvider);

    AuthInterceptor(
      storage: storage,
      onTokenRefreshed: auth.refresh,
      onAuthFailed: () async {
        ref.read(authNotifierProvider.notifier).logout();
      },
    ).attach(dio);

    return dio;
  },
  name: 'authenticatedDioProvider',
);