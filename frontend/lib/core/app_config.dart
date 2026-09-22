/// App-wide configuration. Backend base URL is configurable via
/// `--dart-define=API_BASE_URL=...` at build time, defaulting to the
/// local dev server.
class AppConfig {
  const AppConfig._();

  /// Backend REST API base URL. Override with
  /// `flutter run --dart-define=API_BASE_URL=https://api.example.com`.
  static const String apiBaseUrl = String.fromEnvironment(
    'API_BASE_URL',
    defaultValue: 'http://localhost:3000',
  );

  /// WebSocket base URL (derived from [apiBaseUrl] if not overridden).
  static const String wsBaseUrl = String.fromEnvironment(
    'WS_BASE_URL',
    defaultValue: 'ws://localhost:3000',
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
}