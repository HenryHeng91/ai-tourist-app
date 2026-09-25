import 'location_models.dart';

/// Significant-location-change background tracker.
///
/// Wraps `flutter_background_geolocation` (or the platform's native
/// significant-change API) to satisfy NFR-BAT-1 — battery-optimised
/// background tracking that wakes the app only on meaningful moves
/// (typically cell-tower handoffs, ~500m–1km resolution).
///
/// The actual native wiring lives in a platform plugin and is injected
/// via [BackgroundLocationHandler] so this class stays unit-testable
/// without a device. The real plugin call is made in
/// `BackgroundLocationPlugin` (added when the native config lands); the
/// default constructor here uses a no-op handler that's safe in tests.
class BackgroundLocationTracker {
  BackgroundLocationTracker({BackgroundLocationHandler? handler})
      : _handler = handler ?? const _NoOpHandler();

  final BackgroundLocationHandler _handler;
  bool _running = false;

  bool get isRunning => _running;

  /// Starts the tracker. The handler is invoked on each significant
  /// location change while the app is in the background. Returns true
  /// if the tracker is now running.
  Future<bool> start() async {
    if (_running) return true;
    final ok = await _handler.start();
    _running = ok;
    return ok;
  }

  /// Stops the tracker. Safe to call when not running.
  Future<void> stop() async {
    if (!_running) return;
    await _handler.stop();
    _running = false;
  }

  /// Emits the most recent background fix, if any. The handler is
  /// responsible for caching the last fix (the native plugin does this
  /// automatically).
  Future<LatLng?> lastKnownPosition() => _handler.lastKnownPosition();
}

/// Strategy seam for [BackgroundLocationTracker]. The real
/// implementation calls `flutter_background_geolocation`'s
/// `Geolocation.start`/`stop`; tests inject a fake.
abstract class BackgroundLocationHandler {
  Future<bool> start();
  Future<void> stop();
  Future<LatLng?> lastKnownPosition();
}

class _NoOpHandler implements BackgroundLocationHandler {
  const _NoOpHandler();

  @override
  Future<bool> start() async => true;

  @override
  Future<void> stop() async {}

  @override
  Future<LatLng?> lastKnownPosition() async => null;
}