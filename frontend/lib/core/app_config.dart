/// App-wide configuration. Backend base URL is configurable via
/// `--dart-define=API_BASE_URL=...` at build time, defaulting to the
/// local dev server.
///
/// **NFR-SEC-2 (transport security):** The default base URL uses
/// `http://` for local development only. Production builds MUST override
/// `API_BASE_URL` (and `WS_BASE_URL`) with an `https://` / `wss://`
/// endpoint. [AppConfig.assertProductionHttps] enforces this at startup
/// in release mode — call it from `main()` before booting the app.
class AppConfig {
  const AppConfig._();

  /// Backend REST API base URL. Override with
  /// `flutter run --dart-define=API_BASE_URL=https://api.example.com`.
  ///
  /// Defaults to `http://localhost:4000` (dev backend port). Dev-only —
  /// prod must use `https://` (see [assertProductionHttps]).
  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://localhost:4000',
  );

  /// WebSocket base URL (derived from [apiBaseUrl] if not overridden).
  /// Defaults to `ws://localhost:4000` (dev). Prod must use `wss://`.
  static const String wsBaseUrl = String.fromEnvironment(
    'WS_BASE_URL',
    defaultValue: 'ws://localhost:4000',
  );

  /// Default AI provider display name.
  static const String defaultProvider = 'openai';

  /// Default OpenAI-compatible API base URL used for key validation
  /// (GET /models) and direct inference calls from the client.
  static const String defaultAiProviderBaseUrl = String.fromEnvironment(
    'AI_PROVIDER_BASE_URL',
    defaultValue: 'https://api.openai.com/v1',
  );

  /// OAuth (Google) configuration for flutter_appauth.
  static const String googleClientId = String.fromEnvironment(
    'GOOGLE_OAUTH_CLIENT_ID',
    defaultValue: '',
  );

  static const String googleRedirectUri = String.fromEnvironment(
    'GOOGLE_OAUTH_REDIRECT_URI',
    defaultValue: 'com.aitourist.guide:/oauth2redirect',
  );

  static const String googleIssuer = 'https://accounts.google.com';

  /// Sanity check that the configured base URL is non-empty.
  static bool get isValid => apiBaseUrl.isNotEmpty && wsBaseUrl.isNotEmpty;

  /// Whether the current build is a release/production build.
  static bool get isRelease =>
      const bool.fromEnvironment('dart.vm.product', defaultValue: false);

  /// NFR-SEC-2: in production (release mode) the API base URL MUST use
  /// TLS (`https://`) and the WebSocket URL MUST use `wss://`. Plain
  /// `http://` / `ws://` are dev-only. Returns true when the configured
  /// URLs satisfy the requirement; throws in release mode if not.
  ///
  /// Call this from `main()` in release builds to fail fast on a
  /// misconfigured deploy. In debug/profile builds it just reports.
  static bool assertProductionHttps() {
    final apiSecure = apiBaseUrl.startsWith('https://');
    final wsSecure = wsBaseUrl.startsWith('wss://');
    if (isRelease && !(apiSecure && wsSecure)) {
      throw StateError(
        'NFR-SEC-2 violation: production builds must use https:// and '
        'wss://. Got apiBaseUrl=$apiBaseUrl, wsBaseUrl=$wsBaseUrl. '
        'Override via --dart-define=API_BASE_URL=... and '
        '--dart-define=WS_BASE_URL=...',
      );
    }
    return apiSecure && wsSecure;
  }
}