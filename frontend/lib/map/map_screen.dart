import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';
import 'package:google_maps_flutter/google_maps_flutter.dart'
    show
        CameraPosition,
        CameraUpdate,
        GoogleMap,
        GoogleMapController,
        LatLng as GmsLatLng,
        Marker;

import '../location/location_models.dart' show LatLng, LocationState;
import '../location/location_provider.dart';
import 'map_controller.dart';
import 'map_models.dart';
import 'spot_markers.dart';

/// Map screen — Google Maps with the user's position + nearby spot
/// markers. Fetches spots on first location fix and re-centers the
/// camera on the user.
///
/// Tapping a spot marker navigates to the voiceover route for that spot
/// (the voiceover flow is owned by the voiceover module).
class MapScreen extends ConsumerStatefulWidget {
  const MapScreen({super.key});

  static const String route = '/map';

  @override
  ConsumerState<MapScreen> createState() => _MapScreenState();
}

class _MapScreenState extends ConsumerState<MapScreen> {
  GoogleMapController? _mapController;
  bool _initialCameraSet = false;
  bool _spotsRequested = false;

  @override
  void initState() {
    super.initState();
    // Kick off the permission + first fix as soon as the screen mounts.
    Future.microtask(() {
      ref.read(locationNotifierProvider.notifier).requestPermissionAndFix();
    });

    // When the user's position changes, push it to the map notifier
    // (which fetches spots on the first fix). Using ref.listen avoids
    // side-effects inside build().
    ref.listen(locationNotifierProvider, (prev, next) {
      if (next.hasFix && next.position != prev?.position) {
        ref.read(mapNotifierProvider.notifier).updateUserPosition(
              next.position!,
            );
        _maybeCenterOnUser(next.position!);
        if (!_spotsRequested) {
          _spotsRequested = true;
          ref.read(mapNotifierProvider.notifier).refreshSpots();
        }
      }
    });
  }

  void _onMapCreated(GoogleMapController controller) {
    _mapController = controller;
  }

  void _maybeCenterOnUser(LatLng position) {
    if (_initialCameraSet) return;
    _initialCameraSet = true;
    _mapController?.animateCamera(
      CameraUpdate.newLatLngZoom(
        GmsLatLng(position.latitude, position.longitude),
        14,
      ),
    );
  }

  void _onSpotTap(TouristSpot spot) {
    context.go('/voiceover/${spot.id}');
  }

  @override
  Widget build(BuildContext context) {
    final location = ref.watch(locationNotifierProvider);
    final mapState = ref.watch(mapNotifierProvider);


    return Scaffold(
      appBar: AppBar(title: const Text('Nearby Spots')),
      body: _buildBody(context, location, mapState),
    );
  }

  Widget _buildBody(
    BuildContext context,
    LocationState location,
    MapState mapState,
  ) {
    if (location.permission == LocationPermissionStatus.serviceDisabled) {
      return const _InfoOverlay(
        icon: Icons.location_off,
        title: 'Location is off',
        message: 'Enable location services in your OS settings to see '
            'nearby tourist spots.',
      );
    }
    if (location.permission == LocationPermissionStatus.denied) {
      return _InfoOverlay(
        icon: Icons.location_searching,
        title: 'Location permission needed',
        message: 'We need your location to show nearby spots and trigger '
            'voiceovers when you arrive.',
        action: FilledButton(
          onPressed: () => ref
              .read(locationNotifierProvider.notifier)
              .requestPermissionAndFix(),
          child: const Text('Grant location'),
        ),
      );
    }
    if (!location.hasFix) {
      return const _InfoOverlay(
        icon: Icons.my_location,
        title: 'Finding your location',
        message: 'Acquiring a GPS fix…',
      );
    }

    final userPos = location.position!;
    final markers = SpotMarkers.build(
      userPosition: userPos,
      spots: mapState.spots,
      onSpotTap: _onSpotTap,
    );

    return Stack(
      children: [
        GoogleMap(
          initialCameraPosition: CameraPosition(
            target: GmsLatLng(userPos.latitude, userPos.longitude),
            zoom: 14,
          ),
          onMapCreated: _onMapCreated,
          markers: markers,
          myLocationEnabled: true,
          myLocationButtonEnabled: true,
          zoomControlsEnabled: true,
        ),
        if (mapState.isLoadingSpots)
          const Positioned(
            top: 16,
            left: 0,
            right: 0,
            child: Center(child: CircularProgressIndicator()),
          ),
        if (mapState.error != null)
          Positioned(
            bottom: 16,
            left: 16,
            right: 16,
            child: Card(
              child: Padding(
                padding: const EdgeInsets.all(12),
                child: Text(
                  mapState.error!,
                  style: TextStyle(color: Theme.of(context).colorScheme.error),
                ),
              ),
            ),
          ),
      ],
    );
  }
}

class _InfoOverlay extends StatelessWidget {
  const _InfoOverlay({
    required this.icon,
    required this.title,
    required this.message,
    this.action,
  });

  final IconData icon;
  final String title;
  final String message;
  final Widget? action;

  @override
  Widget build(BuildContext context) {
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(32),
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            Icon(icon, size: 64),
            const SizedBox(height: 16),
            Text(title, style: const TextStyle(fontSize: 20)),
            const SizedBox(height: 8),
            Text(
              message,
              textAlign: TextAlign.center,
            ),
            if (action != null) ...[
              const SizedBox(height: 24),
              action!,
            ],
          ],
        ),
      ),
    );
  }
}