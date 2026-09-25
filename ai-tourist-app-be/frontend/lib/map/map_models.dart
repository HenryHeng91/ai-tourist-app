/// Map + tourist-spot data models.
library;

import '../location/location_models.dart';

/// A tourist spot as returned by `GET /spots?lat&lng&radiusKm`.
///
/// Mirrors the backend `tourist_spots` row (design.md §4) but only the
/// fields the client needs — the full `metadata` blob is fetched
/// lazily via `GET /spots/:id` when the user taps a marker.
class TouristSpot {
  const TouristSpot({
    required this.id,
    required this.name,
    required this.location,
    required this.geofenceRadiusMeters,
    this.category,
    this.description,
  });

  final String id;
  final String name;
  final LatLng location;
  final double geofenceRadiusMeters;
  final String? category;
  final String? description;

  factory TouristSpot.fromJson(Map<String, dynamic> json) {
    // Backend serializes spots with flat `lat`/`lng` fields (see
    // spots.service.ts → toSummary/toFull which extract ST_Y/ST_X into
    // top-level lat/lng). There is no GeoJSON `geom` field on the wire.
    return TouristSpot(
      id: json['id'] as String,
      name: json['name'] as String,
      location: LatLng(
        latitude: (json['lat'] as num).toDouble(),
        longitude: (json['lng'] as num).toDouble(),
      ),
      geofenceRadiusMeters:
          (json['geofenceRadiusM'] as num?)?.toDouble() ?? 200.0,
      category: json['category'] as String?,
      description: json['description'] as String?,
    );
  }

  Map<String, dynamic> toJson() => {
        'id': id,
        'name': name,
        'lat': location.latitude,
        'lng': location.longitude,
        'geofenceRadiusM': geofenceRadiusMeters,
        if (category != null) 'category': category,
        if (description != null) 'description': description,
      };

  @override
  String toString() => 'TouristSpot($id, $name, $location, '
      'r=${geofenceRadiusMeters}m)';

  @override
  bool operator ==(Object other) =>
      other is TouristSpot && other.id == id && other.name == name;

  @override
  int get hashCode => Object.hash(id, name);
}

/// Snapshot of the map screen state for the UI.
class MapState {
  const MapState({
    this.userPosition,
    this.spots = const [],
    this.isLoadingSpots = false,
    this.error,
  });

  final LatLng? userPosition;
  final List<TouristSpot> spots;
  final bool isLoadingSpots;
  final String? error;

  MapState copyWith({
    LatLng? userPosition,
    List<TouristSpot>? spots,
    bool? isLoadingSpots,
    String? error,
  }) =>
      MapState(
        userPosition: userPosition ?? this.userPosition,
        spots: spots ?? this.spots,
        isLoadingSpots: isLoadingSpots ?? this.isLoadingSpots,
        error: error,
      );
}