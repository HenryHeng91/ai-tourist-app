import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../location/location_models.dart';
import 'geofence_event.dart';

/// Registers geofences around nearby tourist spots and emits
/// [GeofenceEvent]s on entry/exit/dwell.
///
/// Two evaluation paths:
/// - **Platform geofence API** (preferred): delegates to
///   `geofence_service` (or the OS GeofencingClient). Low latency, no
///   battery cost for polling. Wired in `GeofencePlugin` once native
///   config lands.
/// - **In-memory evaluator** (fallback + tests): when a new position
///   fix arrives, check all registered regions. Used in unit tests and
///   on platforms without a geofence API (desktop).
///
/// The service exposes a single [events] stream that the voiceover
/// flow subscribes to. On an `enter` event, the voiceover provider
/// triggers the prompt → AI → TTS → playback pipeline.
class GeofenceService {
  GeofenceService({GeofenceBackend? backend})
      : _backend = backend ?? InMemoryGeofenceBackend();

  final GeofenceBackend _backend;
  final StreamController<GeofenceEvent> _controller =
      StreamController<GeofenceEvent>.broadcast();

  /// Stream of geofence transitions. The voiceover provider listens
  /// here and filters for `enter` events.
  Stream<GeofenceEvent> get events => _controller.stream;

  /// Currently registered regions (for the map UI + tests).
  List<GeofenceRegion> get regions => _backend.regions;

  /// Registers a single region. Idempotent on [GeofenceRegion.id].
  Future<void> register(GeofenceRegion region) async {
    await _backend.register(region);
  }

  /// Registers many regions in one call — used after a `/spots` fetch.
  Future<void> registerAll(Iterable<GeofenceRegion> regions) async {
    await _backend.registerAll(regions);
  }

  /// Removes a region by id.
  Future<void> unregister(String id) async => _backend.unregister(id);

  /// Clears all regions.
  Future<void> clear() async => _backend.clear();

  /// Feeds a new position fix to the in-memory evaluator. The platform
  /// backend ignores this (the OS calls back directly) — see
  /// [GeofenceBackend.onPosition].
  Future<void> onPosition(LatLng position, {DateTime? timestamp}) async {
    final events = await _backend.onPosition(position, timestamp: timestamp);
    for (final e in events) {
      _controller.add(e);
    }
  }

  /// Releases the event stream. Idempotent.
  void dispose() {
    _controller.close();
  }
}

/// Strategy seam for [GeofenceService]. The real implementation calls
/// the platform geofence API; tests inject an in-memory evaluator.
abstract class GeofenceBackend {
  List<GeofenceRegion> get regions;
  Future<void> register(GeofenceRegion region);
  Future<void> registerAll(Iterable<GeofenceRegion> regions);
  Future<void> unregister(String id);
  Future<void> clear();

  /// Returns the transitions caused by this position fix. The platform
  /// backend returns an empty list (it emits via its own callback); the
  /// in-memory backend computes transitions here.
  Future<List<GeofenceEvent>> onPosition(
    LatLng position, {
    DateTime? timestamp,
  });
}

/// Pure-Dart evaluator used in tests and as a fallback when the OS
/// geofence API isn't available. Tracks which regions the user is
/// currently inside so it can emit `enter`/`exit` transitions.
class InMemoryGeofenceBackend implements GeofenceBackend {
  InMemoryGeofenceBackend();

  final Map<String, GeofenceRegion> _regions = {};
  final Set<String> _inside = {};

  @override
  List<GeofenceRegion> get regions => _regions.values.toList(growable: false);

  @override
  Future<void> register(GeofenceRegion region) async {
    _regions[region.id] = region;
  }

  @override
  Future<void> registerAll(Iterable<GeofenceRegion> regions) async {
    for (final r in regions) {
      _regions[r.id] = r;
    }
  }

  @override
  Future<void> unregister(String id) async {
    _regions.remove(id);
    _inside.remove(id);
  }

  @override
  Future<void> clear() async {
    _regions.clear();
    _inside.clear();
  }

  @override
  Future<List<GeofenceEvent>> onPosition(
    LatLng position, {
    DateTime? timestamp,
  }) async {
    final events = <GeofenceEvent>[];
    for (final region in _regions.values) {
      final isInside = region.contains(position);
      final wasInside = _inside.contains(region.id);
      if (isInside && !wasInside) {
        _inside.add(region.id);
        events.add(GeofenceEvent(
          spotId: region.id,
          spotName: region.spotName ?? region.id,
          transition: GeofenceTransition.enter,
          position: position,
          spotCategory: region.spotCategory,
          timestamp: timestamp,
        ));
      } else if (!isInside && wasInside) {
        _inside.remove(region.id);
        events.add(GeofenceEvent(
          spotId: region.id,
          spotName: region.spotName ?? region.id,
          transition: GeofenceTransition.exit,
          position: position,
          spotCategory: region.spotCategory,
          timestamp: timestamp,
        ));
      }
    }
    return events;
  }
}

/// Riverpod wiring.
final geofenceServiceProvider = Provider<GeofenceService>(
  (ref) => GeofenceService(),
  name: 'geofenceServiceProvider',
);