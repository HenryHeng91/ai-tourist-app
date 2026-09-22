import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

import 'package:ai_tourist_app/geofence/geofence_event.dart';
import 'package:ai_tourist_app/geofence/geofence_service.dart';
import 'package:ai_tourist_app/location/location_models.dart';
import 'package:ai_tourist_app/map/map_controller.dart';
import 'package:ai_tourist_app/map/map_models.dart';
import 'package:ai_tourist_app/map/spot_registry_client.dart';

void main() {
  group('MapNotifier', () {
    late MockSpotRegistryClient client;
    late MockGeofenceService geofence;
    late MapNotifier notifier;

    setUp(() {
      client = MockSpotRegistryClient();
      geofence = MockGeofenceService();
      notifier = MapNotifier(client, geofence);
      registerFallbackValue(<GeofenceRegion>[]);
      registerFallbackValue(const LatLng(latitude: 0, longitude: 0));
      // updateUserPosition now feeds the geofence evaluator; stub it so
      // mocktail doesn't throw MissingStubError.
      when(() => geofence.onPosition(any(),
              timestamp: any(named: 'timestamp')))
          .thenAnswer((_) async {});
    });

    test('updateUserPosition sets the position', () {
      const pos = LatLng(latitude: 1, longitude: 2);
      notifier.updateUserPosition(pos);
      expect(notifier.state.userPosition, pos);
      expect(notifier.state.error, isNull);
    });

    test('updateUserPosition feeds the position to the geofence service',
        () async {
      const pos = LatLng(latitude: 48.8584, longitude: 2.2945);
      notifier.updateUserPosition(pos);
      // Drain the microtask queue so the unawaited onPosition call lands.
      await Future<void>.delayed(Duration.zero);
      verify(() => geofence.onPosition(pos)).called(1);
    });

    test('refreshSpots returns empty when no user position', () async {
      final spots = await notifier.refreshSpots();
      expect(spots, isEmpty);
      expect(notifier.state.error, contains('No user position'));
    });

    test('refreshSpots fetches + sets state + registers geofences', () async {
      const pos = LatLng(latitude: 48.8584, longitude: 2.2945);
      notifier.updateUserPosition(pos);

      final spots = [
        const TouristSpot(
          id: 's1',
          name: 'Eiffel Tower',
          location: LatLng(latitude: 48.8584, longitude: 2.2945),
          geofenceRadiusMeters: 200,
          category: 'landmark',
        ),
        const TouristSpot(
          id: 's2',
          name: 'Louvre',
          location: LatLng(latitude: 48.8606, longitude: 2.3376),
          geofenceRadiusMeters: 150,
          category: 'museum',
        ),
      ];
      when(() => client.nearby(
            lat: any(named: 'lat'),
            lng: any(named: 'lng'),
            radiusKm: any(named: 'radiusKm'),
            limit: any(named: 'limit'),
          )).thenAnswer((_) async => spots);
      when(() => geofence.registerAll(any())).thenAnswer((_) async {});

      final result = await notifier.refreshSpots();
      expect(result.length, 2);
      expect(notifier.state.spots.length, 2);
      expect(notifier.state.isLoadingSpots, isFalse);
      verify(() => geofence.registerAll(any())).called(1);
    });

    test('refreshSpots surfaces errors in state.error', () async {
      const pos = LatLng(latitude: 48.8584, longitude: 2.2945);
      notifier.updateUserPosition(pos);

      when(() => client.nearby(
            lat: any(named: 'lat'),
            lng: any(named: 'lng'),
            radiusKm: any(named: 'radiusKm'),
            limit: any(named: 'limit'),
          )).thenThrow(Exception('network down'));

      final result = await notifier.refreshSpots();
      expect(result, isEmpty);
      expect(notifier.state.error, contains('network down'));
      expect(notifier.state.isLoadingSpots, isFalse);
    });
  });

  group('TouristSpot', () {
    test('parses flat lat/lng from the backend', () {
      // Backend serializes spots with flat top-level lat/lng (see
      // spots.service.ts → toSummary), NOT a GeoJSON `geom` field.
      final json = {
        'id': 's1',
        'name': 'Eiffel Tower',
        'lat': 48.8584,
        'lng': 2.2945,
        'geofenceRadiusM': 250,
        'category': 'landmark',
      };
      final spot = TouristSpot.fromJson(json);
      expect(spot.id, 's1');
      expect(spot.name, 'Eiffel Tower');
      expect(spot.location.latitude, 48.8584);
      expect(spot.location.longitude, 2.2945);
      expect(spot.geofenceRadiusMeters, 250);
      expect(spot.category, 'landmark');
    });

    test('defaults geofenceRadiusM to 200 when missing', () {
      final json = {
        'id': 's1',
        'name': 'Spot',
        'lat': 0.0,
        'lng': 0.0,
      };
      final spot = TouristSpot.fromJson(json);
      expect(spot.geofenceRadiusMeters, 200);
    });

    test('round-trips through toJson/fromJson', () {
      const spot = TouristSpot(
        id: 's1',
        name: 'Spot',
        location: LatLng(latitude: 1, longitude: 2),
        geofenceRadiusMeters: 100,
        category: 'park',
      );
      final restored = TouristSpot.fromJson(spot.toJson());
      expect(restored.id, spot.id);
      expect(restored.name, spot.name);
      expect(restored.location, spot.location);
      expect(restored.geofenceRadiusMeters, spot.geofenceRadiusMeters);
      expect(restored.category, spot.category);
    });

    test('equality is by id + name', () {
      const a = TouristSpot(
        id: 's1',
        name: 'Spot',
        location: LatLng(latitude: 1, longitude: 2),
        geofenceRadiusMeters: 100,
      );
      const b = TouristSpot(
        id: 's1',
        name: 'Spot',
        location: LatLng(latitude: 9, longitude: 9), // different loc
        geofenceRadiusMeters: 999, // different radius
      );
      expect(a, b);
    });
  });

  group('MapState', () {
    test('default is empty', () {
      const state = MapState();
      expect(state.userPosition, isNull);
      expect(state.spots, isEmpty);
      expect(state.isLoadingSpots, isFalse);
    });

    test('copyWith preserves unspecified fields', () {
      const state = MapState(
        userPosition: LatLng(latitude: 1, longitude: 1),
      );
      final updated = state.copyWith(isLoadingSpots: true);
      expect(updated.isLoadingSpots, isTrue);
      expect(updated.userPosition, const LatLng(latitude: 1, longitude: 1));
    });
  });
}

class MockSpotRegistryClient extends Mock implements SpotRegistryClient {}

class MockGeofenceService extends Mock implements GeofenceService {}