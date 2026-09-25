import 'dart:async';

import 'package:flutter_test/flutter_test.dart';
import 'package:just_audio/just_audio.dart';
import 'package:mocktail/mocktail.dart';

import 'package:ai_tourist_app/voiceover/audio_player_controller.dart';

void main() {
  group('AudioPlayerController listener hygiene', () {
    late MockAudioPlayer player;
    late StreamController<Duration> positionController;
    late StreamController<Duration?> durationController;
    late StreamController<ProcessingState> processingController;
    int positionListenerCount = 0;

    setUp(() {
      player = MockAudioPlayer();
      positionListenerCount = 0;
      positionController = StreamController<Duration>.broadcast(
        onListen: () => positionListenerCount++,
      );
      durationController = StreamController<Duration?>.broadcast();
      processingController = StreamController<ProcessingState>.broadcast();
      // AudioSource is non-primitive → mocktail needs a fallback for `any()`.
      registerFallbackValue(
        AudioSource.uri(Uri.dataFromBytes([0], mimeType: 'audio/mpeg')),
      );

      when(() => player.positionStream).thenReturn(positionController.stream);
      when(() => player.durationStream).thenReturn(durationController.stream);
      when(() => player.processingStateStream)
          .thenReturn(processingController.stream);
      when(() => player.setAudioSource(any(),
              initialIndex: any(named: 'initialIndex'),
              initialPosition: any(named: 'initialPosition')))
          .thenAnswer((_) async {});
      when(() => player.play()).thenAnswer((_) async {});
    });

    tearDown(() {
      positionController.close();
      durationController.close();
      processingController.close();
    });

    test('does not stack duplicate listeners across play calls', () async {
      final controller = AudioPlayerController(player: player);

      await controller.playBytes([1, 2, 3]);
      expect(positionListenerCount, 1);

      // A second play() must cancel the previous subscription before
      // creating a new one — otherwise we'd have 2 listeners (the leak).
      await controller.playBytes([4, 5, 6]);
      expect(positionListenerCount, 1,
          reason: 'Second play() should replace, not stack, the listener.');

      controller.dispose();
    });

    test('a single position event updates state exactly once', () async {
      final controller = AudioPlayerController(player: player);
      await controller.playBytes([1, 2, 3]);
      await controller.playBytes([4, 5, 6]);

      final emitted = <int>[];
      final sub = controller.stream.listen((s) => emitted.add(s.positionMs));

      // Emit one position event; with the leak this would fire twice.
      positionController.add(const Duration(milliseconds: 500));
      await Future<void>.delayed(Duration.zero);

      // Exactly one state update carrying the new position.
      expect(emitted.where((ms) => ms == 500).length, 1);

      await sub.cancel();
      controller.dispose();
    });
  });
}

class MockAudioPlayer extends Mock implements AudioPlayer {}