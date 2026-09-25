/// Geofence event types emitted by [GeofenceService].
///
/// Kept platform-agnostic so the voiceover flow can be unit-tested
/// without a device — the geofence service maps from the platform
/// plugin's event type to these.
library;

import '../location/location_models.dart';

/// The kind of geofence transition the OS reported.
enum GeofenceTransition { enter, exit, dwell }

/// A geofence breach event. Carries enough context for the voiceover
/// flow to act without re-fetching the spot from the registry.
class GeofenceEvent {
  const GeofenceEvent({
    required this.spotId,
    required this.spotName,
    required this.transition,
    required this.position,
    this.spotCategory,
    this.timestamp,
  });

  /// Stable id of the tourist spot the geofence was registered around.
  final String spotId;

  /// Display name of the spot (denormalised so the voiceover prompt
  /// builder doesn't need a registry lookup on the hot path).
  final String spotName;

  final GeofenceTransition transition;

  /// User's position when the breach occurred.
  final LatLng position;

  /// Optional spot category (landmark, museum, park, …) — feeds the
  /// prompt builder.
  final String? spotCategory;

  /// When the OS fired the event. Null in tests.
  final DateTime? timestamp;

  bool get isEntry => transition == GeofenceTransition.enter;

  @override
  String toString() => 'GeofenceEvent($transition, $spotId, $spotName, '
      'at $position)';

  @override
  bool operator ==(Object other) =>
      other is GeofenceEvent &&
      other.spotId == spotId &&
      other.transition == transition &&
      other.position == position;

  @override
  int get hashCode => Object.hash(spotId, transition, position);
}

/// A registered geofence region. The service converts these to the
/// platform plugin's region type at the edge.
class GeofenceRegion {
  const GeofenceRegion({
    required this.id,
    required this.center,
    required this.radiusMeters,
    this.spotName,
    this.spotCategory,
  });

  final String id;
  final LatLng center;
  final double radiusMeters;
  final String? spotName;
  final String? spotCategory;

  /// Returns true if [position] is inside this region. Used by the
  /// in-memory evaluator (tests + fallback when the platform geofence
  /// API isn't available, e.g. on desktop).
  bool contains(LatLng position) =>
      center.distanceTo(position) <= radiusMeters;

  @override
  String toString() => 'GeofenceRegion($id, r=$radiusMeters m, $center)';
}