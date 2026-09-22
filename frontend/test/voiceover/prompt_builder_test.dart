import 'package:flutter_test/flutter_test.dart';

import 'package:ai_tourist_app/location/location_models.dart';
import 'package:ai_tourist_app/voiceover/prompt_builder.dart';
import 'package:ai_tourist_app/voiceover/voiceover_models.dart';

void main() {
  group('PromptBuilder', () {
    final builder = PromptBuilder();

    test('buildMessages returns [system, user]', () {
      final req = _sampleRequest();
      final messages = builder.buildMessages(req);
      expect(messages.length, 2);
      expect(messages[0]['role'], 'system');
      expect(messages[1]['role'], 'user');
    });

    test('system prompt mentions the language', () {
      final req = _sampleRequest(language: 'en');
      final messages = builder.buildMessages(req);
      expect(messages[0]['content'], contains('English'));
    });

    test('user prompt includes the spot name', () {
      final req = _sampleRequest(spotName: 'Eiffel Tower');
      final prompt = builder.buildUserPrompt(req);
      expect(prompt, contains('Eiffel Tower'));
    });

    test('user prompt includes category when present', () {
      final req = _sampleRequest(spotCategory: 'landmark');
      final prompt = builder.buildUserPrompt(req);
      expect(prompt, contains('Category: landmark'));
    });

    test('user prompt omits category line when absent', () {
      final req = _sampleRequest(spotCategory: null);
      final prompt = builder.buildUserPrompt(req);
      expect(prompt, isNot(contains('Category:')));
    });

    test('user prompt includes description when present', () {
      final req = _sampleRequest(spotDescription: 'A wrought-iron tower.');
      final prompt = builder.buildUserPrompt(req);
      expect(prompt, contains('A wrought-iron tower.'));
    });

    test('user prompt includes location line', () {
      final req = _sampleRequest();
      final prompt = builder.buildUserPrompt(req);
      expect(prompt, contains('Location:'));
    });

    test('amenities section groups by type', () {
      final req = _sampleRequest(amenities: [
        const NearbyAmenity(name: 'Cafe de Mars', type: 'restaurant'),
        const NearbyAmenity(name: 'Bistro Paul', type: 'restaurant'),
        const NearbyAmenity(name: 'Public Toilet', type: 'toilet'),
      ]);
      final prompt = builder.buildUserPrompt(req);
      expect(prompt, contains('restaurant: Cafe de Mars, Bistro Paul'));
      expect(prompt, contains('toilet: Public Toilet'));
    });

    test('amenities with distance include the distance label', () {
      final req = _sampleRequest(amenities: [
        const NearbyAmenity(
          name: 'Corner Mart',
          type: 'mart',
          distanceMeters: 250,
        ),
        const NearbyAmenity(
          name: 'Far Mart',
          type: 'mart',
          distanceMeters: 1500,
        ),
      ]);
      final prompt = builder.buildUserPrompt(req);
      expect(prompt, contains('Corner Mart (250 m)'));
      expect(prompt, contains('Far Mart (1.5 km)'));
    });

    test('amenities are capped at maxAmenities', () {
      final many = List.generate(
        10,
        (i) => NearbyAmenity(name: 'A$i', type: 'restaurant'),
      );
      final cappedBuilder = PromptBuilder(maxAmenities: 3);
      final req = _sampleRequest(amenities: many);
      final prompt = cappedBuilder.buildUserPrompt(req);
      expect(prompt, contains('A0'));
      expect(prompt, contains('A2'));
      expect(prompt, isNot(contains('A3')));
      expect(prompt, contains('and 7 more'));
    });

    test('no amenities → no amenities section', () {
      final req = _sampleRequest(amenities: []);
      final prompt = builder.buildUserPrompt(req);
      expect(prompt, isNot(contains('Nearby amenities')));
    });

    test('system prompt forbids markdown and URLs', () {
      final messages = builder.buildMessages(_sampleRequest());
      final system = messages[0]['content']!;
      expect(system, contains('no markdown'));
      expect(system, contains('no URLs'));
    });

    test('system prompt mentions the three required topics', () {
      final messages = builder.buildMessages(_sampleRequest());
      final system = messages[0]['content']!;
      expect(system.toLowerCase(), contains('history'));
      expect(system.toLowerCase(), contains('attractive'));
      expect(system.toLowerCase(), contains('amenities'));
    });
  });

  group('voiceoverCacheKey', () {
    test('same spot + lang + amenities → same key', () {
      final a = _sampleRequest();
      final b = _sampleRequest();
      expect(voiceoverCacheKey(a), voiceoverCacheKey(b));
    });

    test('different spot → different key', () {
      final a = _sampleRequest(spotId: 's1');
      final b = _sampleRequest(spotId: 's2');
      expect(voiceoverCacheKey(a), isNot(voiceoverCacheKey(b)));
    });

    test('different language → different key', () {
      final a = _sampleRequest(language: 'en');
      final b = _sampleRequest(language: 'fr');
      expect(voiceoverCacheKey(a), isNot(voiceoverCacheKey(b)));
    });

    test('amenity order does not matter', () {
      final a = _sampleRequest(amenities: [
        const NearbyAmenity(name: 'A', type: 'restaurant'),
        const NearbyAmenity(name: 'B', type: 'toilet'),
      ]);
      final b = _sampleRequest(amenities: [
        const NearbyAmenity(name: 'B', type: 'toilet'),
        const NearbyAmenity(name: 'A', type: 'restaurant'),
      ]);
      expect(voiceoverCacheKey(a), voiceoverCacheKey(b));
    });

    test('user position is NOT part of the key', () {
      final a = _sampleRequest(position: const LatLng(latitude: 1, longitude: 1));
      final b = _sampleRequest(position: const LatLng(latitude: 2, longitude: 2));
      expect(voiceoverCacheKey(a), voiceoverCacheKey(b));
    });
  });
}

VoiceoverRequest _sampleRequest({
  String spotId = 'spot-1',
  String spotName = 'Test Spot',
  String? spotCategory = 'landmark',
  String? spotDescription,
  LatLng position = const LatLng(latitude: 48.8584, longitude: 2.2945),
  List<NearbyAmenity> amenities = const [],
  String language = 'en',
}) =>
    VoiceoverRequest(
      spotId: spotId,
      spotName: spotName,
      userPosition: position,
      spotCategory: spotCategory,
      spotDescription: spotDescription,
      amenities: amenities,
      language: language,
    );