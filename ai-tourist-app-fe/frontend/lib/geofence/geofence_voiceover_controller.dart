import 'dart:async';

import 'package:flutter_riverpod/flutter_riverpod.dart';

import '../voiceover/voiceover_models.dart';
import '../voiceover/voiceover_provider.dart';
import 'geofence_event.dart';
import 'geofence_service.dart';

/// Wires geofence `enter` events to the AI voiceover flow (REQ-LOC-3).
///
/// Subscribes to [GeofenceService.events] and, on each `enter`
/// transition, builds a [VoiceoverRequest] from the event and kicks off
/// [VoiceoverNotifier.generateAndPlay]. `exit`/`dwell` events are
/// ignored — the voiceover is triggered on arrival only.
///
/// This controller is created once and kept alive by the map screen
/// watching [geofenceVoiceoverControllerProvider]. It owns the stream
/// subscription and cancels it on dispose, so there's exactly one
/// listener on the geofence event stream for the lifetime of the map
/// screen.
class GeofenceVoiceoverController {
  GeofenceVoiceoverController(this._geofence, this._voiceover) {
    _subscription = _geofence.events.listen(_handleEvent);
  }

  final GeofenceService _geofence;
  final VoiceoverNotifier _voiceover;
  late final StreamSubscription<GeofenceEvent> _subscription;

  /// Tracks the most recent in-flight request so tests/observers can
  /// assert that an enter event produced a voiceover request.
  VoiceoverRequest? lastRequest;

  void _handleEvent(GeofenceEvent event) {
    if (!event.isEntry) return;
    final req = VoiceoverRequest(
      spotId: event.spotId,
      spotName: event.spotName,
      userPosition: event.position,
      spotCategory: event.spotCategory,
    );
    lastRequest = req;
    // Fire-and-forget; generation errors are surfaced via the
    // VoiceoverNotifier state (the transcript widget shows them).
    unawaited(_voiceover.generateAndPlay(req: req));
  }

  /// Cancels the geofence event subscription. Idempotent.
  void dispose() {
    _subscription.cancel();
  }
}

/// Riverpod wiring. The map screen `ref.watch`es this to keep the
/// controller (and its event subscription) alive while the user is on
/// the map. Disposed automatically when no longer watched.
final geofenceVoiceoverControllerProvider =
    Provider<GeofenceVoiceoverController>(
  (ref) {
    final controller = GeofenceVoiceoverController(
      ref.watch(geofenceServiceProvider),
      ref.watch(voiceoverNotifierProvider.notifier),
    );
    ref.onDispose(controller.dispose);
    return controller;
  },
  name: 'geofenceVoiceoverControllerProvider',
);