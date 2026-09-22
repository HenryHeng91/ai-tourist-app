import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

import 'package:ai_tourist_app/voiceover/tts_service.dart';

void main() {
  group('TtsService.generateProviderAudio', () {
    late MockDio dio;
    late MockAdapter adapter;
    late TtsService tts;

    setUp(() {
      dio = MockDio();
      adapter = MockAdapter();
      when(() => dio.post(
            any(),
            data: any(named: 'data'),
            options: any(named: 'options'),
          )).thenAnswer((inv) async {
        // Capture the options to verify headers + responseType.
        final opts = inv.namedArguments[#options] as Options?;
        adapter.lastOptions = opts;
        return Response<List<int>>(
          requestOptions: RequestOptions(path: inv.positionalArguments[0]),
          data: [1, 2, 3, 4],
          statusCode: 200,
        );
      });
      tts = TtsService(dio: dio, providerBaseUrl: 'https://example.com/v1');
    });

    test('sends bearer auth with the user key', () async {
      await tts.generateProviderAudio(
        transcript: 'Hello world',
        apiKey: 'sk-test',
      );
      expect(adapter.lastOptions?.headers?['Authorization'], 'Bearer sk-test');
      expect(adapter.lastOptions?.headers?['Content-Type'], 'application/json');
    });

    test('requests bytes responseType', () async {
      await tts.generateProviderAudio(
        transcript: 'Hello',
        apiKey: 'sk-test',
      );
      expect(adapter.lastOptions?.responseType, ResponseType.bytes);
    });

    test('sends model + voice + input in the body', () async {
      await tts.generateProviderAudio(
        transcript: 'Hello world',
        apiKey: 'sk-test',
      );
      // The mock captured the call — verify the body via the recorded
      // invocation. We re-fetch the last call's data argument.
      final calls = verify(() => dio.post(
            any(),
            data: captureAny(named: 'data'),
            options: any(named: 'options'),
          )).captured;
      final body = calls.last as Map<String, dynamic>;
      expect(body['model'], 'tts-1');
      expect(body['voice'], 'alloy');
      expect(body['input'], 'Hello world');
      expect(body['response_format'], 'mp3');
    });

    test('returns the audio bytes from the response', () async {
      final bytes = await tts.generateProviderAudio(
        transcript: 'Hello',
        apiKey: 'sk-test',
      );
      expect(bytes, [1, 2, 3, 4]);
    });

    test('POSTs to the /audio/speech endpoint', () async {
      await tts.generateProviderAudio(
        transcript: 'Hello',
        apiKey: 'sk-test',
      );
      final calls = verify(() => dio.post(
            captureAny(),
            data: any(named: 'data'),
            options: any(named: 'options'),
          )).captured;
      expect(calls.last, 'https://example.com/v1/audio/speech');
    });
  });

  group('TtsStrategy', () {
    test('has provider + native values', () {
      expect(TtsStrategy.values, contains(TtsStrategy.provider));
      expect(TtsStrategy.values, contains(TtsStrategy.native));
      expect(TtsStrategy.values.length, 2);
    });
  });
}

class MockDio extends Mock implements Dio {}

class MockAdapter {
  Options? lastOptions;
}