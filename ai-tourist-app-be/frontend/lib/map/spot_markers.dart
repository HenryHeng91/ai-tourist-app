import 'package:flutter/material.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart'
    show
        BitmapDescriptor,

        InfoWindow,
        LatLng as GmsLatLng,
        Marker,
        MarkerId;

import '../location/location_models.dart' show LatLng;
import 'map_models.dart';

/// Builds Google Maps [Marker]s for the user + nearby spots.
///
/// Kept as pure functions (no state) so the map screen can call them
/// on every state change without allocating a class. Marker IDs are
/// stable strings so the map SDK can diff efficiently.
class SpotMarkers {
  SpotMarkers._();

  /// User's location marker — teal circle with a white border.
  static Marker userMarker(LatLng position) {
    return Marker(
      markerId: const MarkerId('user'),
      position: GmsLatLng(position.latitude, position.longitude),
      infoWindow: const InfoWindow(title: 'You are here'),
      icon: BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueAzure),
    );
  }

  /// A marker for a tourist spot — orange (default hue) with the spot
  /// name as the info window title.
  static Marker spotMarker(TouristSpot spot, {VoidCallback? onTap}) {
    return Marker(
      markerId: MarkerId('spot:${spot.id}'),
      position: GmsLatLng(spot.location.latitude, spot.location.longitude),
      infoWindow: InfoWindow(
        title: spot.name,
        snippet: spot.category ?? 'Tourist spot',
        onTap: onTap,
      ),
      icon: BitmapDescriptor.defaultMarkerWithHue(BitmapDescriptor.hueOrange),
    );
  }

  /// Builds the full marker set from the map state.
  static Set<Marker> build({
    LatLng? userPosition,
    required List<TouristSpot> spots,
    void Function(TouristSpot spot)? onSpotTap,
  }) {
    final markers = <Marker>{};
    if (userPosition != null && userPosition.isValid) {
      markers.add(userMarker(userPosition));
    }
    for (final spot in spots) {
      markers.add(
        spotMarker(spot, onTap: onSpotTap != null ? () => onSpotTap(spot) : null),
      );
    }
    return markers;
  }
}