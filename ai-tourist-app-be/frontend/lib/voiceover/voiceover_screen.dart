import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:go_router/go_router.dart';

import '../map/map_models.dart';
import '../map/spot_registry_client.dart';
import '../map/map_controller.dart';
import 'transcript_widget.dart';
import 'voiceover_models.dart';
import 'voiceover_provider.dart';

/// Voiceover screen — fetches the spot by id, builds a [VoiceoverRequest],
/// kicks off the generate+play flow, and shows the [TranscriptWidget].
///
/// Route: `/voiceover/:spotId` — the map screen navigates here when the
/// user taps a spot marker (or the geofence flow triggers it).
class VoiceoverScreen extends ConsumerStatefulWidget {
  const VoiceoverScreen({super.key, required this.spotId});

  static const String route = '/voiceover';

  @override
  ConsumerState<VoiceoverScreen> createState() => _VoiceoverScreenState();
}

class _VoiceoverScreenState extends ConsumerState<VoiceoverScreen> {
  TouristSpot? _spot;
  String? _loadError;

  @override
  void initState() {
    super.initState();
    Future.microtask(() => _loadSpotAndGenerate());
  }

  Future<void> _loadSpotAndGenerate() async {
    try {
      final client = ref.read(spotRegistryClientProvider);
      final spot = await client.byId(widget.spotId);
      if (!mounted) return;
      setState(() => _spot = spot);

      // Build the request and kick off the voiceover flow. Amenities
      // would come from a separate POI lookup — left empty for now
      // (the prompt builder handles the no-amenities case gracefully).
      final req = VoiceoverRequest(
        spotId: spot.id,
        spotName: spot.name,
        userPosition: spot.location, // refined when location stream arrives
        spotCategory: spot.category,
        spotDescription: spot.description,
      );
      await ref.read(voiceoverNotifierProvider.notifier).generateAndPlay(
            req: req,
          );
    } catch (e) {
      if (!mounted) return;
      setState(() => _loadError = 'Could not load spot: $e');
    }
  }

  @override
  Widget build(BuildContext context) {
    final spotName = _spot?.name ?? 'Voiceover';
    return Scaffold(
      appBar: AppBar(
        title: Text(spotName),
        leading: IconButton(
          icon: const Icon(Icons.arrow_back),
          onPressed: () => context.go('/map'),
        ),
      ),
      body: _buildBody(context),
    );
  }

  Widget _buildBody(BuildContext context) {
    if (_loadError != null) {
      return Center(
        child: Padding(
          padding: const EdgeInsets.all(32),
          child: Column(
            mainAxisAlignment: MainAxisAlignment.center,
            children: [
              const Icon(Icons.error_outline, size: 48),
              const SizedBox(height: 16),
              Text(_loadError!, textAlign: TextAlign.center),
              const SizedBox(height: 24),
              FilledButton(
                onPressed: () => context.go('/map'),
                child: const Text('Back to map'),
              ),
            ],
          ),
        ),
      );
    }
    if (_spot == null) {
      return const Center(child: CircularProgressIndicator());
    }
    return SingleChildScrollView(
      padding: const EdgeInsets.all(16),
      child: TranscriptWidget(spotName: _spot!.name),
    );
  }
}