import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

import 'package:ai_tourist_app/location/background_location_tracker.dart';
import 'package:ai_tourist_app/location/gps_service.dart';
import 'package:ai_tourist_app/location/location_models.dart';
import 'package:ai_tourist_app/location/location_provider.dart';

void main() {
  group('LocationNotifier', () {
    late MockGpsService gps;
    late MockBackgroundLocationTracker bg;
    late LocationNotifier notifier;

    setUp(() {
      gps = MockGpsService();
      bg = MockBackgroundLocationTracker();
      notifier = LocationNotifier(gps, bg);

    });

    test('refreshPermission updates state with the OS status', () async {
      when(() => gps.checkPermission())
          .thenAnswer((_) async => LocationPermissionStatus.granted);
      await notifier.refreshPermission();
      expect(notifier.state.permission, LocationPermissionStatus.granted);
      expect(notifier.state.error, isNull);
    });

    test('refreshPermission surfaces errors in state.error', () async {
      when(() => gps.checkPermission()).thenThrow(Exception('boom'));
      await notifier.refreshPermission();
      expect(notifier.state.error, contains('boom'));
    });

    test('requestPermissionAndFix returns false when denied', () async {
      when(() => gps.requestPermission(requestBackground: any(named: 'requestBackground')))
          .thenAnswer((_) async => LocationPermissionStatus.denied);
      final ok = await notifier.requestPermissionAndFix();
      expect(ok, isFalse);
      expect(notifier.state.permission, LocationPermissionStatus.denied);
    });

    test('requestPermissionAndFix sets position on success', () async {
      const pos = LatLng(latitude: 48.8584, longitude: 2.2945);
      when(() => gps.requestPermission(requestBackground: any(named: 'requestBackground')))
          .thenAnswer((_) async => LocationPermissionStatus.granted);
      when(() => gps.acquirePosition()).thenAnswer(
        (_) async => (position: pos, accuracy: 5.0),
      );
      final ok = await notifier.requestPermissionAndFix();
      expect(ok, isTrue);
      expect(notifier.state.position, pos);
      expect(notifier.state.accuracyMeters, 5.0);
    });

    test('updatePosition sets position + accuracy', () {
      const pos = LatLng(latitude: 1, longitude: 2);
      notifier.updatePosition(pos, accuracy: 10);
      expect(notifier.state.position, pos);
      expect(notifier.state.accuracyMeters, 10);
    });

    test('startBackgroundTracking refuses without grantedAlways', () async {
      // Default state is notDetermined — should refuse.
      when(() => bg.start()).thenAnswer((_) async => true);
      final ok = await notifier.startBackgroundTracking();
      expect(ok, isFalse);
      expect(notifier.state.error, contains('not granted'));
      verifyNever(() => bg.start());
    });

    test('startBackgroundTracking calls bg.start when permitted', () async {
      // Manually grant always-permission first.
      when(() => gps.checkPermission())
          .thenAnswer((_) async => LocationPermissionStatus.grantedAlways);
      await notifier.refreshPermission();
      when(() => bg.start()).thenAnswer((_) async => true);
      final ok = await notifier.startBackgroundTracking();
      expect(ok, isTrue);
      expect(notifier.state.isTrackingInBackground, isTrue);
      verify(() => bg.start()).called(1);
    });

    test('stopBackgroundTracking calls bg.stop', () async {
      when(() => bg.stop()).thenAnswer((_) async {});
      await notifier.stopBackgroundTracking();
      expect(notifier.state.isTrackingInBackground, isFalse);
      verify(() => bg.stop()).called(1);
    });
  });
}

class MockGpsService extends Mock implements GpsService {}

class MockBackgroundLocationTracker extends Mock
    implements BackgroundLocationTracker {}