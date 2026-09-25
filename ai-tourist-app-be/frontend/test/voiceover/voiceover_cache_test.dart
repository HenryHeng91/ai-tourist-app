import 'dart:io';

import 'package:flutter_test/flutter_test.dart';


import 'package:ai_tourist_app/location/location_models.dart';
import 'package:ai_tourist_app/voiceover/voiceover_cache.dart';
import 'package:ai_tourist_app/voiceover/voiceover_models.dart';

void main() {
  late Directory tempDir;
  late VoiceoverCache cache;

  setUp(() async {
    tempDir = await Directory.systemTemp.createTemp('vo_cache_test');
    cache = VoiceoverCache(documentsDir: tempDir);
  });

  tearDown(() async {
    if (tempDir.existsSync()) {
      await tempDir.delete(recursive: true);
    }
  });

  group('VoiceoverCache', () {
    test('readTranscript returns null when not cached', () async {
      final transcript = await cache.readTranscript(_req());
      expect(transcript, isNull);
    });

    test('readAudioPath returns null when not cached', () async {
      final path = await cache.readAudioPath(_req());
      expect(path, isNull);
    });

    test('persist writes transcript + audio and returns a result with path',
        () async {
      final result = VoiceoverResult(
        request: _req(),
        transcript: 'Welcome to the tower.',
        audioBytes: [1, 2, 3, 4, 5],
      );
      final persisted = await cache.persist(result);
      expect(persisted.cached, isTrue);
      expect(persisted.audioFilePath, isNotNull);
      expect(persisted.audioBytes, isNull); // cleared after persist
      expect(persisted.createdAt, isNotNull);
    });

    test('after persist, readTranscript returns the cached text', () async {
      final result = VoiceoverResult(
        request: _req(),
        transcript: 'Hello spot.',
        audioBytes: [1, 2, 3],
      );
      await cache.persist(result);
      final transcript = await cache.readTranscript(_req());
      expect(transcript, 'Hello spot.');
    });

    test('after persist, readAudioPath returns the file path', () async {
      final result = VoiceoverResult(
        request: _req(),
        transcript: 'Hello.',
        audioBytes: [1, 2, 3],
      );
      await cache.persist(result);
      final path = await cache.readAudioPath(_req());
      expect(path, isNotNull);
      expect(File(path!).existsSync(), isTrue);
    });

    test('has returns true after persist', () async {
      final result = VoiceoverResult(
        request: _req(),
        transcript: 'Hi.',
      );
      await cache.persist(result);
      expect(await cache.has(_req()), isTrue);
    });

    test('has returns false when not cached', () async {
      expect(await cache.has(_req()), isFalse);
    });

    test('persist without audioBytes keeps audioFilePath null', () async {
      final result = VoiceoverResult(
        request: _req(),
        transcript: 'No audio.',
      );
      final persisted = await cache.persist(result);
      expect(persisted.audioFilePath, isNull);
      expect(persisted.audioBytes, isNull);
    });

    test('clear removes all cached files', () async {
      await cache.persist(VoiceoverResult(
        request: _req(),
        transcript: 'A',
        audioBytes: [1],
      ));
      await cache.persist(VoiceoverResult(
        request: _req(spotId: 'other'),
        transcript: 'B',
        audioBytes: [2],
      ));
      final removed = await cache.clear();
      expect(removed, greaterThanOrEqualTo(2)); // json + mp3 per spot
      expect(await cache.has(_req()), isFalse);
    });

    test('different spots cache independently', () async {
      await cache.persist(VoiceoverResult(
        request: _req(spotId: 's1'),
        transcript: 'First',
      ));
      await cache.persist(VoiceoverResult(
        request: _req(spotId: 's2'),
        transcript: 'Second',
      ));
      expect(await cache.readTranscript(_req(spotId: 's1')), 'First');
      expect(await cache.readTranscript(_req(spotId: 's2')), 'Second');
    });
  });
}

VoiceoverRequest _req({String spotId = 's1'}) => VoiceoverRequest(
      spotId: spotId,
      spotName: 'Test Spot',
      userPosition: const LatLng(latitude: 0, longitude: 0),
    );