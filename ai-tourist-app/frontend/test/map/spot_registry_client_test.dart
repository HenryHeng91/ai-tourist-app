import 'package:dio/dio.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:mocktail/mocktail.dart';

import 'package:ai_tourist_app/map/spot_registry_client.dart';

void main() {
  group('SpotRegistryClient', () {
    late MockDio dio;
    late SpotRegistryClient client;

    setUp(() {
      dio = MockDio();
      client = SpotRegistryClient(dio: dio);
    });

    test('nearby() unwraps the { "spots": [...] } envelope', () async {
      // Backend wraps the list: { "spots": [ ... ] } (spots.routes.ts).
      // Each spot has flat lat/lng (spots.service.ts → toSummary).
      when(() => dio.get(
            any(),
            queryParameters: any(named: 'queryParameters'),
          )).thenAnswer((_) async => Response<Map<String, dynamic>>(
            requestOptions: RequestOptions(path: '/spots'),
            data: {
              'spots': [
                {
                  'id': 's1',
                  'name': 'Eiffel Tower',
                  'lat': 48.8584,
                  'lng': 2.2945,
                  'geofenceRadiusM': 200,
                  'category': 'landmark',
                },
                {
                  'id': 's2',
                  'name': 'Louvre',
                  'lat': 48.8606,
                  'lng': 2.3376,
                  'geofenceRadiusM': 150,
                  'category': 'museum',
                },
              ],
            },
          ));

      final spots = await client.nearby(lat: 48.85, lng: 2.29);
      expect(spots.length, 2);
      expect(spots.first.id, 's1');
      expect(spots.first.name, 'Eiffel Tower');
      expect(spots.first.location.latitude, 48.8584);
      expect(spots.first.location.longitude, 2.2945);
      expect(spots.last.id, 's2');
    });

    test('nearby() returns empty list when spots envelope is empty', () async {
      when(() => dio.get(
            any(),
            queryParameters: any(named: 'queryParameters'),
          )).thenAnswer((_) async => Response<Map<String, dynamic>>(
            requestOptions: RequestOptions(path: '/spots'),
            data: {'spots': <Map<String, dynamic>>[]},
          ));

      final spots = await client.nearby(lat: 0, lng: 0);
      expect(spots, isEmpty);
    });

    test('byId() parses a single (unwrapped) spot object', () async {
      // GET /spots/:id returns the spot directly, NOT wrapped in { "spots": [] }.
      when(() => dio.get(any())).thenAnswer((_) async =>
          Response<Map<String, dynamic>>(
            requestOptions: RequestOptions(path: '/spots/s1'),
            data: {
              'id': 's1',
              'name': 'Eiffel Tower',
              'lat': 48.8584,
              'lng': 2.2945,
              'geofenceRadiusM': 200,
              'category': 'landmark',
              'metadata': {'hours': '9-5'},
            },
          ));

      final spot = await client.byId('s1');
      expect(spot.id, 's1');
      expect(spot.name, 'Eiffel Tower');
      expect(spot.location.latitude, 48.8584);
      expect(spot.location.longitude, 2.2945);
    });
  });
}

class MockDio extends Mock implements Dio {}