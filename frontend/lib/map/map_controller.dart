import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../auth/auth_providers.dart';
import '../geofence/geofence_event.dart';
import '../geofence/geofence_service.dart';
import '../location/location_models.dart';
import '../location/location_provider.dart';
import 'map_models.dart';
import 'spot_registry_client.dart';

/// Provider for [SpotRegistryClient] wired with the authenticated Dio.
final spotRegistryClientProvider = Provider<SpotRegistryClient>(
  (ref) => SpotRegistryClient(dio: ref.watch(authenticatedDioProvider)),
  name: 'spotRegistryClientProvider',
);

/// Notifier that drives the map screen: holds the user's position, the
/// list of nearby spots, and re-registers geofences when the spot list
/// changes.
class MapNotifier extends StateNotifier<MapState> {
  MapNotifier(this._client, this._geofence)
      : super(const MapState());

  final SpotRegistryClient _client;
  final GeofenceService _geofence;

  /// Updates the user's position from the location stream. Cheap —
  /// doesn't refetch spots unless the user has moved > [refetchThresholdMeters].
  void updateUserPosition(LatLng position) {
    state = state.copyWith(userPosition: position, error: null);
  }

  /// Fetches spots near the user's current position and registers
  /// geofences around them. Returns the fetched list (empty on error).
  Future<List<TouristSpot>> refreshSpots({
    double radiusKm = 5.0,
    int limit = 50,
  }) async {
    final pos = state.userPosition;
    if (pos == null) {
      state = state.copyWith(error: 'No user position yet.');
      return const [];
    }
    state = state.copyWith(isLoadingSpots: true, error: null);
    try {
      final spots = await _client.nearby(
        lat: pos.latitude,
        lng: pos.longitude,
        radiusKm: radiusKm,
        limit: limit,
      );
      state = state.copyWith(spots: spots, isLoadingSpots: false);
      // Re-register geofences around the freshly fetched spots.
      await _geofence.registerAll(
        spots.map((s) => GeofenceRegion(
              id: s.id,
              center: s.location,
              radiusMeters: s.geofenceRadiusMeters,
              spotName: s.name,
              spotCategory: s.category,
            )),
      );
      return spots;
    } catch (e) {
      state = state.copyWith(
        isLoadingSpots: false,
        error: 'Could not load nearby spots: $e',
      );
      return const [];
    }
  }
}

final mapNotifierProvider = StateNotifierProvider<MapNotifier, MapState>(
  (ref) => MapNotifier(
    ref.watch(spotRegistryClientProvider),
    ref.watch(geofenceServiceProvider),
  ),
  name: 'mapNotifierProvider',
);