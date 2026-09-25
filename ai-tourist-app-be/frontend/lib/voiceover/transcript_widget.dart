import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'voiceover_models.dart';
import 'voiceover_provider.dart';

/// Transcript + audio controls UI (REQ-AI-3, REQ-AI-4).
///
/// Shows the spot name, the transcript text, and a row of controls:
/// play/pause, stop, replay. A progress bar reflects playback position.
/// Error states show a retry button.
///
/// Designed to be embedded in the voiceover route's scaffold — it does
/// not own the AppBar.
class TranscriptWidget extends ConsumerWidget {
  const TranscriptWidget({super.key, required this.spotName});

  final String spotName;

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    final state = ref.watch(voiceoverNotifierProvider);

    return Card(
      child: Padding(
        padding: const EdgeInsets.all(16),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            _header(context, state),
            const SizedBox(height: 12),
            _transcript(context, state),
            if (state.result != null && state.result!.hasAudio) ...[
              const SizedBox(height: 12),
              _progress(state),
            ],
            const SizedBox(height: 16),
            _controls(context, ref, state),
          ],
        ),
      ),
    );
  }

  Widget _header(BuildContext context, VoiceoverPlayback state) {
    return Row(
      children: [
        Icon(
          Icons.graphic_eq,
          color: Theme.of(context).colorScheme.primary,
        ),
        const SizedBox(width: 8),
        Expanded(
          child: Text(
            spotName,
            style: Theme.of(context).textTheme.titleMedium,
          ),
        ),
        if (state.result?.cached == true)
          Tooltip(
            message: 'Played from cache',
            child: Icon(
              Icons.cloud_off,
              size: 18,
              color: Theme.of(context).colorScheme.secondary,
            ),
          ),
      ],
    );
  }

  Widget _transcript(BuildContext context, VoiceoverPlayback state) {
    if (state.isLoading && state.result == null) {
      return const Row(
        children: [
          SizedBox(
            width: 16,
            height: 16,
            child: CircularProgressIndicator(strokeWidth: 2),
          ),
          SizedBox(width: 12),
          Text('Generating voiceover…'),
        ],
      );
    }
    if (state.error != null && state.result == null) {
      return Text(
        state.error!,
        style: TextStyle(color: Theme.of(context).colorScheme.error),
      );
    }
    final transcript = state.result?.transcript ?? '';
    if (transcript.isEmpty) {
      return const Text('No transcript yet.');
    }
    return Text(transcript, style: Theme.of(context).textTheme.bodyMedium);
  }

  Widget _progress(VoiceoverPlayback state) {
    final duration = state.durationMs <= 0 ? 1 : state.durationMs;
    final value = (state.positionMs / duration).clamp(0.0, 1.0);
    return LinearProgressIndicator(value: value);
  }

  Widget _controls(
    BuildContext context,
    WidgetRef ref,
    VoiceoverPlayback state,
  ) {
    final notifier = ref.read(voiceoverNotifierProvider.notifier);

    if (state.isLoading && state.result == null) {
      return const Center(
        child: Text('Generating…', style: TextStyle(color: Colors.grey)),
      );
    }
    if (state.error != null && state.result == null) {
      return Center(
        child: Text(
          state.error!,
          style: TextStyle(color: Theme.of(context).colorScheme.error),
          textAlign: TextAlign.center,
        ),
      );
    }
    if (state.result == null) {
      return const SizedBox.shrink();
    }

    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        if (state.isPlaying)
          IconButton.filled(
            icon: const Icon(Icons.pause),
            onPressed: notifier.pause,
            tooltip: 'Pause',
          )
        else if (state.isPaused)
          IconButton.filled(
            icon: const Icon(Icons.play_arrow),
            onPressed: notifier.resume,
            tooltip: 'Resume',
          )
        else
          IconButton.filled(
            icon: const Icon(Icons.play_arrow),
            onPressed: notifier.replay,
            tooltip: 'Play',
          ),
        const SizedBox(width: 8),
        IconButton(
          icon: const Icon(Icons.stop),
          onPressed: notifier.stop,
          tooltip: 'Stop',
        ),
        const SizedBox(width: 8),
        IconButton(
          icon: const Icon(Icons.replay),
          onPressed: notifier.replay,
          tooltip: 'Replay',
        ),
      ],
    );
  }
}