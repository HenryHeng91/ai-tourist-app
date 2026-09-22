import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';

import 'gps_service.dart';
import 'background_location_tracker.dart';
import 'location_models.dart';

/// Single shared [GpsService] for the app. Tests override this with a
/// fake that doesn't touch platform plugins.
final gpsServiceProvider = Provider<GpsService>(
  (ref) => GpsService(),
  name: 'gpsServiceProvider',
);

/// Single shared [BackgroundLocationTracker].
final backgroundLocationTrackerProvider = Provider<BackgroundLocationTracker>(
  (ref) => BackgroundLocationTracker(),
  name: 'backgroundLocationTrackerProvider',
);

/// Notifier that drives the location permission flow, foreground GPS
/// acquisition, and background tracking toggle. Exposes [LocationState]
/// to the UI (map screen, settings).
class LocationNotifier extends StateNotifier<LocationState> {
  LocationNotifier(this._gps, this._bg)
      : super(const LocationState());

  final GpsService _gps;
  final BackgroundLocationTracker _bg;

  /// Checks the current OS permission status without prompting.
  Future<void> refreshPermission() async {
    try {
      final status = await _gps.checkPermission();
      state = state.copyWith(permission: status, error: null);
    } catch (e) {
      state = state.copyWith(error: 'Could not check permission: $e');
    }
  }

  /// Requests foreground + background permission and, on success,
  /// acquires the first position fix.
  Future<bool> requestPermissionAndFix({bool requestBackground = true}) async {
    try {
      final status = await _gps.requestPermission(
        requestBackground: requestBackground,
      );
      state = state.copyWith(permission: status, error: null);
      if (status != LocationPermissionStatus.granted &&
          status != LocationPermissionStatus.grantedAlways) {
        return false;
      }
      final fix = await _gps.acquirePosition();
      if (fix != null) {
        state = state.copyWith(
          position: fix.position,
          accuracyMeters: fix.accuracy,
        );
      }
      return fix != null;
    } catch (e) {
      state = state.copyWith(error: 'Could not acquire location: $e');
      return false;
    }
  }

  /// Updates the position from a stream event (foreground tracking).
  void updatePosition(LatLng position, {double? accuracy}) {
    state = state.copyWith(
      position: position,
      accuracyMeters: accuracy ?? state.accuracyMeters,
      error: null,
    );
  }

  /// Starts battery-optimised background tracking. No-op if already
  /// running or if permission doesn't include background.
  Future<bool> startBackgroundTracking() async {
    if (state.permission != LocationPermissionStatus.grantedAlways) {
      state = state.copyWith(
        error: 'Background location permission not granted.',
      );
      return false;
    }
    final ok = await _bg.start();
    state = state.copyWith(isTrackingInBackground: ok);
    return ok;
  }

  Future<void> stopBackgroundTracking() async {
    await _bg.stop();
    state = state.copyWith(isTrackingInBackground: false);
  }
}

final locationNotifierProvider =
    StateNotifierProvider<LocationNotifier, LocationState>(
  (ref) => LocationNotifier(
    ref.watch(gpsServiceProvider),
    ref.watch(backgroundLocationTrackerProvider),
  ),
  name: 'locationNotifierProvider',
);

/// Re-exposes the foreground position stream for the map controller.
/// The map screen listens to this and re-centers on the user.
final positionStreamProvider = StreamProvider<Position>(
  (ref) {
    final gps = ref.watch(gpsServiceProvider);
    return gps.positionStream();
  },
  name: 'positionStreamProvider',
);