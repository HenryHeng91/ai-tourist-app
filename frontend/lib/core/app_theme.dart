import 'package:flutter/material.dart';

/// Material 3 theme for the AI Travel Guide app.
/// Warm travel-inspired palette: deep teal primary, sand accent.
class AppTheme {
  const AppTheme._();

  static const Color _primary = Color(0xFF0F6B5C);
  static const Color _primaryDark = Color(0xFF073B33);
  static const Color _accent = Color(0xFFE8A33D);
  static const Color _bgLight = Color(0xFFF7F5F0);
  static const Color _bgDark = Color(0xFF0E1414);

  static ThemeData light() {
    final scheme = ColorScheme.fromSeed(
      seedColor: _primary,
      brightness: Brightness.light,
    ).copyWith(secondary: _accent, surface: _bgLight);

    return ThemeData(
      useMaterial3: true,
      colorScheme: scheme,
      scaffoldBackgroundColor: _bgLight,
      appBarTheme: const AppBarTheme(
        centerTitle: false,
        elevation: 0,
        backgroundColor: _bgLight,
        foregroundColor: _primaryDark,
      ),
      inputDecorationTheme: _inputDecoration(scheme),
      filledButtonTheme: _filledButtonTheme(scheme),
      cardTheme: CardThemeData(
        elevation: 0,
        shape: RoundedRectangleBorder(
          borderRadius: BorderRadius.circular(16),
          side: BorderSide(color: scheme.outlineVariant),
        ),
      ),
    );
  }

  static ThemeData dark() {
    final scheme = ColorScheme.fromSeed(
      seedColor: _primary,
      brightness: Brightness.dark,
    ).copyWith(secondary: _accent, surface: _bgDark);

    return ThemeData(
      useMaterial3: true,
      colorScheme: scheme,
      scaffoldBackgroundColor: _bgDark,
      appBarTheme: AppBarTheme(
        centerTitle: false,
        elevation: 0,
        backgroundColor: _bgDark,
        foregroundColor: scheme.onSurface,
      ),
      inputDecorationTheme: _inputDecoration(scheme),
      filledButtonTheme: _filledButtonTheme(scheme),
    );
  }

  static InputDecorationTheme _inputDecoration(ColorScheme scheme) =>
      InputDecorationTheme(
        filled: true,
        fillColor: scheme.surfaceContainerHighest.withOpacity(0.4),
        border: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: scheme.outline),
        ),
        enabledBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: scheme.outlineVariant),
        ),
        focusedBorder: OutlineInputBorder(
          borderRadius: BorderRadius.circular(12),
          borderSide: BorderSide(color: scheme.primary, width: 1.5),
        ),
        contentPadding: const EdgeInsets.symmetric(
          horizontal: 16,
          vertical: 14,
        ),
      );

  static FilledButtonThemeData _filledButtonTheme(ColorScheme scheme) =>
      FilledButtonThemeData(
        style: FilledButton.styleFrom(
          minimumSize: const Size.fromHeight(52),
          shape: RoundedRectangleBorder(
            borderRadius: BorderRadius.circular(12),
          ),
          textStyle: const TextStyle(
            fontSize: 16,
            fontWeight: FontWeight.w600,
          ),
        ),
      );
}