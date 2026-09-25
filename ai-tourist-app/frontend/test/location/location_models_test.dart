import 'package:flutter_test/flutter_test.dart';

import 'package:ai_tourist_app/location/location_models.dart';

void main() {
  group('LatLng', () {
    test('isValid for in-range coords', () {
      expect(const LatLng(latitude: 0, longitude: 0).isValid, isTrue);
      expect(const LatLng(latitude: 90, longitude: 180).isValid, isTrue);
      expect(const LatLng(latitude: -90, longitude: -180).isValid, isTrue);
    });

    test('isValid is false for out-of-range coords', () {
      expect(const LatLng(latitude: 91, longitude: 0).isValid, isFalse);
      expect(const LatLng(latitude: 0, longitude: 181).isValid, isFalse);
      expect(const LatLng(latitude: -91, longitude: 0).isValid, isFalse);
    });

    test('distanceTo is zero for the same point', () {
      const p = LatLng(latitude: 48.8584, longitude: 2.2945);
      expect(p.distanceTo(p), lessThan(1e-6));
    });

    test('distanceTo is symmetric', () {
      const a = LatLng(latitude: 48.8584, longitude: 2.2945); // Eiffel
      const b = LatLng(latitude: 48.8606, longitude: 2.3376); // Louvre
      expect(a.distanceTo(b), closeTo(b.distanceTo(a), 1e-3));
    });

    test('distanceTo Eiffel→Louvre ≈ 3.0 km', () {
      const eiffel = LatLng(latitude: 48.8584, longitude: 2.2945);
      const louvre = LatLng(latitude: 48.8606, longitude: 2.3376);
      final d = eiffel.distanceTo(louvre);
      // Real-world distance is ~3.0 km. Allow ±200 m tolerance.
      expect(d, greaterThan(2800));
      expect(d, lessThan(3200));
    });

    test('distanceTo for a 1° latitude step ≈ 111 km', () {
      const a = LatLng(latitude: 0, longitude: 0);
      const b = LatLng(latitude: 1, longitude: 0);
      final d = a.distanceTo(b);
      expect(d, closeTo(111195, 100)); // ~111.195 km
    });

    test('equality is by value', () {
      const a = LatLng(latitude: 1, longitude: 2);
      const b = LatLng(latitude: 1, longitude: 2);
      const c = LatLng(latitude: 1, longitude: 3);
      expect(a, b);
      expect(a.hashCode, b.hashCode);
      expect(a, isNot(c));
    });
  });

  group('LocationState', () {
    test('default is empty + not determined', () {
      const state = LocationState();
      expect(state.permission, LocationPermissionStatus.notDetermined);
      expect(state.position, isNull);
      expect(state.hasFix, isFalse);
      expect(state.isTrackingInBackground, isFalse);
    });

    test('hasFix true when position is valid', () {
      const state = LocationState(
        position: LatLng(latitude: 1, longitude: 1),
      );
      expect(state.hasFix, isTrue);
    });

    test('hasFix false when position is invalid', () {
      const state = LocationState(
        position: LatLng(latitude: 999, longitude: 1),
      );
      expect(state.hasFix, isFalse);
    });

    test('copyWith preserves unspecified fields', () {
      const state = LocationState(
        position: LatLng(latitude: 1, longitude: 1),
        accuracyMeters: 5,
      );
      final updated = state.copyWith(
        permission: LocationPermissionStatus.granted,
      );
      expect(updated.permission, LocationPermissionStatus.granted);
      expect(updated.position, const LatLng(latitude: 1, longitude: 1));
      expect(updated.accuracyMeters, 5);
    });
  });

  group('LocationPermissionStatus', () {
    test('has all 6 values', () {
      expect(LocationPermissionStatus.values.length, 6);
    });
  });

  group('PositionFix', () {
    test('toLatLng projects latitude/longitude', () {
      const fix = PositionFix(
        latitude: 48.8584,
        longitude: 2.2945,
        accuracy: 5.0,
      );
      expect(fix.toLatLng(), const LatLng(latitude: 48.8584, longitude: 2.2945));
    });

    test('equality is by lat/lng (ignores accuracy/timestamp)', () {
      final a = PositionFix(
        latitude: 1,
        longitude: 2,
        accuracy: 5,
        timestamp: DateTime(2020),
      );
      final b = PositionFix(
        latitude: 1,
        longitude: 2,
        accuracy: 99,
        timestamp: DateTime(2024),
      );
      expect(a, b);
      expect(a.hashCode, b.hashCode);
    });
  });
}