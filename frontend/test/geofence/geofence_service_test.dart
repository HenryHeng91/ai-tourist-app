import 'package:flutter_test/flutter_test.dart';

import 'package:ai_tourist_app/geofence/geofence_event.dart';
import 'package:ai_tourist_app/geofence/geofence_service.dart';
import 'package:ai_tourist_app/location/location_models.dart';

void main() {
  group('GeofenceRegion', () {
    test('contains returns true for a point inside the radius', () {
      const region = GeofenceRegion(
        id: 'r1',
        center: LatLng(latitude: 0, longitude: 0),
        radiusMeters: 200,
      );
      // ~111 m north of centre — inside.
      const inside = LatLng(latitude: 0.001, longitude: 0);
      expect(region.contains(inside), isTrue);
    });

    test('contains returns false for a point outside the radius', () {
      const region = GeofenceRegion(
        id: 'r1',
        center: LatLng(latitude: 0, longitude: 0),
        radiusMeters: 100,
      );
      // ~1.1 km north — outside.
      const outside = LatLng(latitude: 0.01, longitude: 0);
      expect(region.contains(outside), isFalse);
    });

    test('contains is inclusive on the boundary', () {
      // Place the point exactly radius away along a latitude.
      // 1° lat ≈ 111195 m, so 100 m ≈ 0.000898° lat.
      const center = LatLng(latitude: 0, longitude: 0);
      const point = LatLng(latitude: 0.000898, longitude: 0);
      const region = GeofenceRegion(
        id: 'r1',
        center: center,
        radiusMeters: 100,
      );
      expect(region.contains(point), isTrue);
    });
  });

  group('GeofenceEvent', () {
    test('isEntry is true only for enter transitions', () {
      const pos = LatLng(latitude: 0, longitude: 0);
      final enter = GeofenceEvent(
        spotId: 's',
        spotName: 'Spot',
        transition: GeofenceTransition.enter,
        position: pos,
      );
      final exit = GeofenceEvent(
        spotId: 's',
        spotName: 'Spot',
        transition: GeofenceTransition.exit,
        position: pos,
      );
      expect(enter.isEntry, isTrue);
      expect(exit.isEntry, isFalse);
    });

    test('equality is by id + transition + position', () {
      const pos = LatLng(latitude: 1, longitude: 2);
      final a = GeofenceEvent(
        spotId: 's',
        spotName: 'A',
        transition: GeofenceTransition.enter,
        position: pos,
      );
      final b = GeofenceEvent(
        spotId: 's',
        spotName: 'B', // different name — should NOT affect equality
        transition: GeofenceTransition.enter,
        position: pos,
      );
      expect(a, b);
      expect(a.hashCode, b.hashCode);
    });
  });

  group('InMemoryGeofenceBackend', () {
    late InMemoryGeofenceBackend backend;

    setUp(() {
      backend = InMemoryGeofenceBackend();
    });

    test('register adds a region', () async {
      const region = GeofenceRegion(
        id: 'r1',
        center: LatLng(latitude: 0, longitude: 0),
        radiusMeters: 200,
      );
      await backend.register(region);
      expect(backend.regions.length, 1);
      expect(backend.regions.first.id, 'r1');
    });

    test('register is idempotent on id', () async {
      const region = GeofenceRegion(
        id: 'r1',
        center: LatLng(latitude: 0, longitude: 0),
        radiusMeters: 200,
      );
      await backend.register(region);
      await backend.register(region);
      expect(backend.regions.length, 1);
    });

    test('registerAll adds many regions', () async {
      final regions = List.generate(
        3,
        (i) => const GeofenceRegion(
          id: 'r',
          center: LatLng(latitude: 0, longitude: 0),
          radiusMeters: 100,
        ).copyWithId('r$i'),
      );
      await backend.registerAll(regions);
      expect(backend.regions.length, 3);
    });

    test('onPosition emits enter when moving inside a region', () async {
      const region = GeofenceRegion(
        id: 'r1',
        center: LatLng(latitude: 0, longitude: 0),
        radiusMeters: 200,
        spotName: 'Spot 1',
      );
      await backend.register(region);
      const inside = LatLng(latitude: 0.001, longitude: 0);
      final events = await backend.onPosition(inside);
      expect(events.length, 1);
      expect(events.first.transition, GeofenceTransition.enter);
      expect(events.first.spotId, 'r1');
      expect(events.first.spotName, 'Spot 1');
    });

    test('onPosition emits exit when moving outside a region', () async {
      const region = GeofenceRegion(
        id: 'r1',
        center: LatLng(latitude: 0, longitude: 0),
        radiusMeters: 100,
        spotName: 'Spot 1',
      );
      await backend.register(region);
      // First move inside (enter).
      await backend.onPosition(const LatLng(latitude: 0.0001, longitude: 0));
      // Then move outside (exit).
      final events = await backend.onPosition(
        const LatLng(latitude: 0.01, longitude: 0),
      );
      expect(events.length, 1);
      expect(events.first.transition, GeofenceTransition.exit);
    });

    test('onPosition emits nothing when staying inside', () async {
      const region = GeofenceRegion(
        id: 'r1',
        center: LatLng(latitude: 0, longitude: 0),
        radiusMeters: 500,
      );
      await backend.register(region);
      await backend.onPosition(const LatLng(latitude: 0.001, longitude: 0));
      final events = await backend.onPosition(
        const LatLng(latitude: 0.002, longitude: 0),
      );
      expect(events, isEmpty);
    });

    test('clear removes all regions', () async {
      await backend.register(const GeofenceRegion(
        id: 'r1',
        center: LatLng(latitude: 0, longitude: 0),
        radiusMeters: 100,
      ));
      await backend.clear();
      expect(backend.regions, isEmpty);
    });

    test('unregister removes a single region', () async {
      await backend.register(const GeofenceRegion(
        id: 'r1',
        center: LatLng(latitude: 0, longitude: 0),
        radiusMeters: 100,
      ));
      await backend.unregister('r1');
      expect(backend.regions, isEmpty);
    });
  });

  group('GeofenceService (with InMemoryBackend)', () {
    test('events stream emits enter transitions', () async {
      final service = GeofenceService();
      await service.register(const GeofenceRegion(
        id: 'r1',
        center: LatLng(latitude: 0, longitude: 0),
        radiusMeters: 200,
        spotName: 'Spot 1',
      ));
      final events = <GeofenceEvent>[];
      final sub = service.events.listen(events.add);
      await service.onPosition(const LatLng(latitude: 0.001, longitude: 0));
      await Future<void>.delayed(Duration.zero);
      expect(events.length, 1);
      expect(events.first.isEntry, isTrue);
      await sub.cancel();
      service.dispose();
    });
  });
}

extension on GeofenceRegion {
  GeofenceRegion copyWithId(String id) => GeofenceRegion(
        id: id,
        center: center,
        radiusMeters: radiusMeters,
        spotName: spotName,
        spotCategory: spotCategory,
      );
}