/// Location module data models.
///
/// Hand-written immutable classes (no freezed) — matches the Sprint 1
/// convention so the test suite compiles without `build_runner`.
library;

import 'dart:math' as math;

/// Lightweight lat/lng pair. We keep our own value type rather than
/// leaking `geolocator`'s `Position` or `google_maps_flutter`'s
/// `LatLng` into the rest of the app — the [GpsService] and
/// [MapController] adapt to/from their platform types at the edges.
class LatLng {
  const LatLng({required this.latitude, required this.longitude});

  final double latitude;
  final double longitude;

  /// Validates that the coordinates are within the WGS-84 envelope.
  bool get isValid =>
      latitude >= -90 &&
      latitude <= 90 &&
      longitude >= -180 &&
      longitude <= 180;

  /// Great-circle distance to [other] in metres (haversine). Used by
  /// the geofence evaluator and the "nearest spot" helper.
  double distanceTo(LatLng other) {
    const r = 6371000.0; // earth radius in metres
    final dLat = math.pi / 180 * (other.latitude - latitude);
    final dLng = math.pi / 180 * (other.longitude - longitude);
    final lat1Rad = math.pi / 180 * latitude;
    final lat2Rad = math.pi / 180 * other.latitude;
    final a = math.sin(dLat / 2) * math.sin(dLat / 2) +
        math.cos(lat1Rad) *
            math.cos(lat2Rad) *
            math.sin(dLng / 2) *
            math.sin(dLng / 2);
    final c = 2 * math.atan2(math.sqrt(a), math.sqrt(1 - a));
    return r * c;
  }

  @override
  bool operator ==(Object other) =>
      other is LatLng &&
      other.latitude == latitude &&
      other.longitude == longitude;

  @override
  int get hashCode => Object.hash(latitude, longitude);

  @override
  String toString() => 'LatLng($latitude, $longitude)';
}

/// Coarse permission status surfaced to the UI. Mirrors the platform
/// states but stays platform-agnostic so widget tests don't need
/// `geolocator` plugins.
enum LocationPermissionStatus {
  /// Haven't asked yet.
  notDetermined,
  /// User denied foreground (and therefore background).
  denied,
  /// Foreground granted, background not yet requested.
  granted,
  /// Foreground + background granted — full background tracking allowed.
  grantedAlways,
  /// OS-level restriction (parental controls, etc.).
  restricted,
  /// Service disabled (location off at OS level).
  serviceDisabled,
}

/// Domain GPS position fix. Kept platform-agnostic so the rest of the
/// app (providers, map, geofence) never imports `package:geolocator` —
/// [GpsService] adapts from the platform `Position` to this type at the
/// edge.
class PositionFix {
  const PositionFix({
    required this.latitude,
    required this.longitude,
    this.accuracy,
    this.timestamp,
  });

  final double latitude;
  final double longitude;

  /// Estimated accuracy in metres (CEP-68 on most platforms).
  final double? accuracy;
  final DateTime? timestamp;

  /// Convenience projection to the lat/lng value type used by the map
  /// and geofence math.
  LatLng toLatLng() => LatLng(latitude: latitude, longitude: longitude);

  @override
  bool operator ==(Object other) =>
      other is PositionFix &&
      other.latitude == latitude &&
      other.longitude == longitude;

  @override
  int get hashCode => Object.hash(latitude, longitude);

  @override
  String toString() => 'PositionFix($latitude, $longitude, acc=$accuracy)';
}

/// Snapshot of the location module state for the UI.
class LocationState {
  const LocationState({
    this.permission = LocationPermissionStatus.notDetermined,
    this.position,
    this.accuracyMeters,
    this.isTrackingInBackground = false,
    this.error,
  });

  final LocationPermissionStatus permission;
  final LatLng? position;
  final double? accuracyMeters;
  final bool isTrackingInBackground;
  final String? error;

  bool get hasFix => position != null && position!.isValid;

  LocationState copyWith({
    LocationPermissionStatus? permission,
    LatLng? position,
    double? accuracyMeters,
    bool? isTrackingInBackground,
    String? error,
  }) =>
      LocationState(
        permission: permission ?? this.permission,
        position: position ?? this.position,
        accuracyMeters: accuracyMeters ?? this.accuracyMeters,
        isTrackingInBackground:
            isTrackingInBackground ?? this.isTrackingInBackground,
        error: error,
      );

  @override
  String toString() => 'LocationState(permission: $permission, '
      'position: $position, accuracy: $accuracyMeters, '
      'bg: $isTrackingInBackground, error: $error)';
}
