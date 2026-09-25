import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

import 'package:ai_tourist_app/location/location_models.dart';
import 'package:ai_tourist_app/voiceover/voiceover_models.dart';
import 'package:ai_tourist_app/voiceover/voiceover_service.dart';

void main() {
  group('VoiceoverService.generateTranscript', () {
    late MockDio dio;
    late VoiceoverService service;

    setUp(() {
      dio = MockDio();
      service = VoiceoverService(
        dio: dio,
        providerBaseUrl: 'https://example.com/v1',
      );
    });

    test('returns the transcript content from the first choice', () async {
      when(() => dio.post(
            any(),
            data: any(named: 'data'),
            options: any(named: 'options'),
          )).thenAnswer((_) async => Response<Map<String, dynamic>>(
            requestOptions: RequestOptions(path: '/chat/completions'),
            data: {
              'choices': [
                {
                  'message': {'role': 'assistant', 'content': 'Welcome!'},
                }
              ],
            },
            statusCode: 200,
          ));

      final transcript = await service.generateTranscript(
        req: _req(),
        apiKey: 'sk-test',
      );
      expect(transcript, 'Welcome!');
    });

    test('trims whitespace from the transcript', () async {
      when(() => dio.post(
            any(),
            data: any(named: 'data'),
            options: any(named: 'options'),
          )).thenAnswer((_) async => Response<Map<String, dynamic>>(
            requestOptions: RequestOptions(path: '/chat/completions'),
            data: {
              'choices': [
                {
                  'message': {'content': '  Hello world  '},
                }
              ],
            },
            statusCode: 200,
          ));

      final transcript = await service.generateTranscript(
        req: _req(),
        apiKey: 'sk-test',
      );
      expect(transcript, 'Hello world');
    });

    test('throws StateError when choices is empty', () async {
      when(() => dio.post(
            any(),
            data: any(named: 'data'),
            options: any(named: 'options'),
          )).thenAnswer((_) async => Response<Map<String, dynamic>>(
            requestOptions: RequestOptions(path: '/chat/completions'),
            data: {'choices': []},
            statusCode: 200,
          ));

      expect(
        () => service.generateTranscript(req: _req(), apiKey: 'sk-test'),
        throwsA(isA<StateError>()),
      );
    });

    test('throws StateError when content is null', () async {
      when(() => dio.post(
            any(),
            data: any(named: 'data'),
            options: any(named: 'options'),
          )).thenAnswer((_) async => Response<Map<String, dynamic>>(
            requestOptions: RequestOptions(path: '/chat/completions'),
            data: {
              'choices': [
                {
                  'message': {'content': null},
                }
              ],
            },
            statusCode: 200,
          ));

      expect(
        () => service.generateTranscript(req: _req(), apiKey: 'sk-test'),
        throwsA(isA<StateError>()),
      );
    });

    test('sends the bearer auth header with the user key', () async {
      Options? captured;
      when(() => dio.post(
            any(),
            data: any(named: 'data'),
            options: any(named: 'options'),
          )).thenAnswer((inv) async {
        captured = inv.namedArguments[#options] as Options?;
        return Response<Map<String, dynamic>>(
          requestOptions: RequestOptions(path: '/chat/completions'),
          data: {
            'choices': [
              {
                'message': {'content': 'ok'},
              }
            ],
          },
          statusCode: 200,
        );
      });

      await service.generateTranscript(req: _req(), apiKey: 'sk-secret');
      expect(captured?.headers?['Authorization'], 'Bearer sk-secret');
    });

    test('POSTs to /chat/completions', () async {
      when(() => dio.post(
            any(),
            data: any(named: 'data'),
            options: any(named: 'options'),
          )).thenAnswer((_) async => Response<Map<String, dynamic>>(
            requestOptions: RequestOptions(path: '/chat/completions'),
            data: {
              'choices': [
                {
                  'message': {'content': 'ok'},
                }
              ],
            },
            statusCode: 200,
          ));

      await service.generateTranscript(req: _req(), apiKey: 'sk-test');

      final calls = verify(() => dio.post(
            captureAny(),
            data: any(named: 'data'),
            options: any(named: 'options'),
          )).captured;
      expect(calls.last, 'https://example.com/v1/chat/completions');
    });
  });
}

VoiceoverRequest _req() => const VoiceoverRequest(
      spotId: 's1',
      spotName: 'Test Spot',
      userPosition: LatLng(latitude: 0, longitude: 0),
    );

class MockDio extends Mock implements Dio {}