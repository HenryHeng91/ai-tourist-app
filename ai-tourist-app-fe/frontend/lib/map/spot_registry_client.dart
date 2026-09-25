import 'package:dio/dio.dart';

import '../core/app_http_client.dart';
import 'map_models.dart';

/// Calls the backend tourist-spot registry: `GET /spots?lat&lng&radiusKm`.
///
/// Uses the authenticated Dio (JWT bearer attached by [AuthInterceptor]).
/// The caller (MapController) is responsible for caching + invalidation;
/// this class is a thin HTTP seam so tests can mock it.
class SpotRegistryClient {
  SpotRegistryClient({Dio? dio}) : _dio = dio ?? AppHttpClient.createBase();

  final Dio _dio;

  /// Fetches spots within [radiusKm] of [lat]/[lng]. The backend
  /// applies a hard cap (default 50) — pass [limit] to lower it.
  Future<List<TouristSpot>> nearby({
    required double lat,
    required double lng,
    double radiusKm = 5.0,
    int limit = 50,
  }) async {
    final response = await _dio.get(
      '/spots',
      queryParameters: {
        'lat': lat,
        'lng': lng,
        'radiusKm': radiusKm,
        'limit': limit,
      },
    );
    // Backend wraps the list: { "spots": [ ... ] } (see spots.routes.ts).
    final body = response.data as Map<String, dynamic>;
    final data = body['spots'] as List;
    return data
        .cast<Map<String, dynamic>>()
        .map(TouristSpot.fromJson)
        .toList(growable: false);
  }

  /// Fetches the full spot record (with metadata) by id.
  ///
  /// The backend returns a single (unwrapped) spot object for
  /// `GET /spots/:id` — only the list endpoint is wrapped in `{ "spots": [] }`.
  Future<TouristSpot> byId(String id) async {
    final response = await _dio.get('/spots/$id');
    return TouristSpot.fromJson(response.data as Map<String, dynamic>);
  }
}