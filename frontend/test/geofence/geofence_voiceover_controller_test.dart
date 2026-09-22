import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

import 'package:ai_tourist_app/geofence/geofence_event.dart';
import 'package:ai_tourist_app/geofence/geofence_service.dart';
import 'package:ai_tourist_app/geofence/geofence_voiceover_controller.dart';
import 'package:ai_tourist_app/location/location_models.dart';
import 'package:ai_tourist_app/voiceover/voiceover_models.dart';
import 'package:ai_tourist_app/voiceover/voiceover_provider.dart';

void main() {
  group('GeofenceVoiceoverController', () {
    late GeofenceService geofence;
    late MockVoiceoverNotifier voiceover;
    late GeofenceVoiceoverController controller;

    setUp(() {
      geofence = GeofenceService();
      voiceover = MockVoiceoverNotifier();
      registerFallbackValue(const VoiceoverRequest(
        spotId: '',
        spotName: '',
        userPosition: LatLng(latitude: 0, longitude: 0),
      ));
      when(() => voiceover.generateAndPlay(req: any(named: 'req')))
          .thenAnswer((_) async => null);
      controller = GeofenceVoiceoverController(geofence, voiceover);
    });

    tearDown(() {
      controller.dispose();
      geofence.dispose();
    });

    test('triggers voiceover on a geofence enter event', () async {
      await geofence.register(const GeofenceRegion(
        id: 's1',
        center: LatLng(latitude: 0, longitude: 0),
        radiusMeters: 200,
        spotName: 'Eiffel Tower',
        spotCategory: 'landmark',
      ));
      // Move inside the region → enter event.
      await geofence.onPosition(const LatLng(latitude: 0.001, longitude: 0));
      // Drain the microtask queue so the unawaited generateAndPlay call lands.
      await Future<void>.delayed(Duration.zero);

      expect(controller.lastRequest, isNotNull);
      expect(controller.lastRequest!.spotId, 's1');
      expect(controller.lastRequest!.spotName, 'Eiffel Tower');
      expect(controller.lastRequest!.spotCategory, 'landmark');
      verify(() => voiceover.generateAndPlay(req: any(named: 'req')))
          .called(1);
    });

    test('does NOT trigger voiceover on an exit event', () async {
      await geofence.register(const GeofenceRegion(
        id: 's1',
        center: LatLng(latitude: 0, longitude: 0),
        radiusMeters: 100,
        spotName: 'Spot',
      ));
      // Enter first so a later move outside produces an exit event.
      await geofence.onPosition(const LatLng(latitude: 0.0001, longitude: 0));
      await Future<void>.delayed(Duration.zero);
      // Clear the enter invocation count.
      clearInteractions(voiceover);

      // Move outside → exit event (should be ignored).
      await geofence.onPosition(const LatLng(latitude: 0.01, longitude: 0));
      await Future<void>.delayed(Duration.zero);

      verifyNever(() => voiceover.generateAndPlay(req: any(named: 'req')));
    });

    test('cancels its subscription on dispose', () async {
      // After dispose, enter events should not reach the voiceover.
      controller.dispose();
      await geofence.register(const GeofenceRegion(
        id: 's1',
        center: LatLng(latitude: 0, longitude: 0),
        radiusMeters: 200,
        spotName: 'Spot',
      ));
      await geofence.onPosition(const LatLng(latitude: 0.001, longitude: 0));
      await Future<void>.delayed(Duration.zero);

      verifyNever(() => voiceover.generateAndPlay(req: any(named: 'req')));
    });
  });
}

class MockVoiceoverNotifier extends Mock implements VoiceoverNotifier {}