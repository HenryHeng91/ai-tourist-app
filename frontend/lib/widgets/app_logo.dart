import 'package:flutter/material.dart';

/// Simple app logo widget — a teal rounded square with a compass icon.
/// Kept dependency-free so it renders in widget tests without assets.
class AppLogo extends StatelessWidget {
  const AppLogo({super.key, this.size = 48});

  final double size;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Container(
      width: size,
      height: size,
      decoration: BoxDecoration(
        color: scheme.primary,
        borderRadius: BorderRadius.circular(size * 0.28),
      ),
      child: Icon(
        Icons.explore_outlined,
        size: size * 0.6,
        color: scheme.onPrimary,
      ),
    );
  }
}