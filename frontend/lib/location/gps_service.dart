import 'package:geolocator/geolocator.dart';

import 'location_models.dart';

/// Wraps `geolocator` for foreground GPS acquisition + permission flow.
///
/// The background significant-location-change tracker is a separate
/// concern (see [BackgroundLocationTracker]) because it has a different
/// lifecycle (headless callback) and different permission tier.
///
/// All platform calls go through here so tests can mock a single
/// seam — the rest of the app never imports `package:geolocator`.
class GpsService {
  GpsService({GeolocatorPlatform? platform})
      : _platform = platform ?? GeolocatorPlatform.instance;

  final GeolocatorPlatform _platform;

  /// Returns the current OS-level permission status, mapped to our
  /// platform-agnostic [LocationPermissionStatus].
  Future<LocationPermissionStatus> checkPermission() async {
    final service = await _platform.isLocationServiceEnabled();
    if (!service) return LocationPermissionStatus.serviceDisabled;

    final perm = await _platform.checkPermission();
    return _mapPermission(perm);
  }

  /// Requests foreground permission, then background permission if the
  /// foreground grant succeeded. Returns the final status.
  ///
  /// On iOS the background request is part of the same prompt when the
  /// `NSLocationAlwaysAndWhenInUseUsageDescription` key is present; on
  /// Android 11+ this is a separate follow-up prompt. We model it as
  /// two steps so the UI can show rationale between them.
  Future<LocationPermissionStatus> requestPermission({
    bool requestBackground = true,
  }) async {
    final service = await _platform.isLocationServiceEnabled();
    if (!service) return LocationPermissionStatus.serviceDisabled;

    final foreground = await _platform.requestPermission();
    final mapped = _mapPermission(foreground);
    if (mapped != LocationPermissionStatus.granted &&
        mapped != LocationPermissionStatus.grantedAlways) {
      return mapped;
    }

    if (!requestBackground) return mapped;

    // geolocator exposes background permission via the same request on
    // iOS (the "always" prompt) and via `requestPermission` on Android
    // when the manifest declares ACCESS_BACKGROUND_LOCATION. A second
    // call here upgrades to "always" if the OS allows it.
    final elevated = await _platform.requestPermission();
    return _mapPermission(elevated);
  }

  /// Gets the current position. Throws if permission hasn't been
  /// granted — callers should check [checkPermission] first or use
  /// [acquirePosition] which handles the permission flow.
  Future<Position> getCurrentPosition({
    LocationAccuracy desiredAccuracy = LocationAccuracy.high,
    Duration timeLimit = const Duration(seconds: 10),
  }) async {
    return _platform.getCurrentPosition(
      LocationSettings(
        accuracy: desiredAccuracy,
        timeLimit: timeLimit,
      ),
    );
  }

  /// Convenience: ensures permission, then returns the position as a
  /// domain [LatLng] plus accuracy in metres. Returns null (and sets
  /// [LocationState.error] upstream) if permission was denied.
  Future<({LatLng position, double accuracy})?> acquirePosition({
    bool requestBackground = false,
  }) async {
    final status = await requestPermission(requestBackground: requestBackground);
    if (status != LocationPermissionStatus.granted &&
        status != LocationPermissionStatus.grantedAlways) {
      return null;
    }
    final pos = await getCurrentPosition();
    return (
      position: LatLng(latitude: pos.latitude, longitude: pos.longitude),
      accuracy: pos.accuracy,
    );
  }

  /// Streams position updates while the app is in the foreground.
  /// The caller (LocationProvider) is responsible for cancelling the
  /// subscription when the app goes to background — background tracking
  /// uses [BackgroundLocationTracker] instead.
  Stream<Position> positionStream({
    LocationAccuracy desiredAccuracy = LocationAccuracy.high,
    Duration interval = const Duration(seconds: 5),
  }) {
    return _platform.getPositionStream(
      LocationSettings(
        accuracy: desiredAccuracy,
        timeLimit: const Duration(seconds: 15),
        distanceFilter: 10, // metres — avoid spamming on small jitter
      ),
    );
  }

  static LocationPermissionStatus _mapPermission(LocationPermission p) {
    switch (p) {
      case LocationPermission.denied:
        return LocationPermissionStatus.denied;
      case LocationPermission.deniedForever:
        return LocationPermissionStatus.denied;
      case LocationPermission.whileInUse:
        return LocationPermissionStatus.granted;
      case LocationPermission.always:
        return LocationPermissionStatus.grantedAlways;
      case LocationPermission.unableToDetermine:
        return LocationPermissionStatus.notDetermined;
    }
  }
}