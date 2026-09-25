/// Auth + API-key vault data models.
///
/// Hand-written as plain immutable Dart classes (rather than freezed)
/// so the Sprint 1 test suite compiles without a `build_runner`
/// codegen step. freezed remains in pubspec for later sprints that
/// need copyWith/equality unions.
library;

/// Authenticated session returned by login/signup/refresh.
class AuthSession {
  const AuthSession({
    required this.userId,
    required this.email,
    required this.accessToken,
    required this.refreshToken,
    this.displayName,
  });

  final String userId;
  final String email;
  final String accessToken;
  final String refreshToken;
  final String? displayName;

  Map<String, dynamic> toJson() => {
        'userId': userId,
        'email': email,
        'accessToken': accessToken,
        'refreshToken': refreshToken,
        if (displayName != null) 'displayName': displayName,
      };

  factory AuthSession.fromJson(Map<String, dynamic> json) => AuthSession(
        userId: json['userId'] as String,
        email: json['email'] as String,
        accessToken: json['accessToken'] as String,
        refreshToken: json['refreshToken'] as String,
        displayName: json['displayName'] as String?,
      );

  @override
  bool operator ==(Object other) =>
      other is AuthSession &&
      other.userId == userId &&
      other.email == email &&
      other.accessToken == accessToken &&
      other.refreshToken == refreshToken &&
      other.displayName == displayName;

  @override
  int get hashCode => Object.hash(userId, email, accessToken, refreshToken, displayName);
}

/// Request body for email/password login.
class LoginRequest {
  const LoginRequest({required this.email, required this.password});

  final String email;
  final String password;

  Map<String, dynamic> toJson() => {'email': email, 'password': password};
}

/// Request body for signup.
class SignupRequest {
  const SignupRequest({
    required this.email,
    required this.password,
    required this.displayName,
  });

  final String email;
  final String password;
  final String displayName;

  Map<String, dynamic> toJson() => {
        'email': email,
        'password': password,
        'displayName': displayName,
      };
}

/// Validation status for the user's API key (vault).
enum ApiKeyValidationStatus { unknown, validating, valid, invalid }

/// Snapshot of the API-key vault state for the settings UI.
class ApiKeyVaultState {
  const ApiKeyVaultState({
    this.hasKey = false,
    this.validationStatus = ApiKeyValidationStatus.unknown,
    this.provider,
    this.lastValidatedAt,
    this.errorMessage,
  });

  final bool hasKey;
  final ApiKeyValidationStatus validationStatus;
  final String? provider;
  final String? lastValidatedAt;
  final String? errorMessage;

  ApiKeyVaultState copyWith({
    bool? hasKey,
    ApiKeyValidationStatus? validationStatus,
    String? provider,
    String? lastValidatedAt,
    String? errorMessage,
  }) =>
      ApiKeyVaultState(
        hasKey: hasKey ?? this.hasKey,
        validationStatus: validationStatus ?? this.validationStatus,
        provider: provider ?? this.provider,
        lastValidatedAt: lastValidatedAt ?? this.lastValidatedAt,
        errorMessage: errorMessage,
      );
}
