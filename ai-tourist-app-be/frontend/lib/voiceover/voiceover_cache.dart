import 'dart:convert';
import 'dart:io';

import 'package:path_provider/path_provider.dart';

import 'prompt_builder.dart';
import 'voiceover_models.dart';

/// On-disk cache for voiceover transcripts + audio files (NFR-REL-1:
/// degrade gracefully when offline — cached voiceovers remain
/// available).
///
/// Layout under the app documents dir:
///   voiceover_cache/
///     <cacheKey>.json   — transcript + metadata
///     <cacheKey>.mp3    — audio bytes (provider TTS only)
///
/// The cache key is derived from [voiceoverCacheKey] (spot + language +
/// amenity set) so two visits to the same spot hit the cache.
class VoiceoverCache {
  VoiceoverCache({Directory? documentsDir})
      : _documentsDir = documentsDir;

  final Directory? _documentsDir;
  static const _cacheDirName = 'voiceover_cache';

  Future<Directory> _cacheDir() async {
    final base = _documentsDir ?? await getApplicationDocumentsDirectory();
    final dir = Directory('${base.path}/$_cacheDirName');
    if (!dir.existsSync()) dir.createSync(recursive: true);
    return dir;
  }

  /// Returns a cached transcript for [req], or null if not cached.
  Future<String?> readTranscript(VoiceoverRequest req) async {
    final file = File('${(await _cacheDir()).path}/${voiceoverCacheKey(req)}.json');
    if (!file.existsSync()) return null;
    try {
      final json = jsonDecode(file.readAsStringSync()) as Map<String, dynamic>;
      return json['transcript'] as String?;
    } catch (_) {
      return null;
    }
  }

  /// Returns the path to a cached audio file for [req], or null.
  Future<String?> readAudioPath(VoiceoverRequest req) async {
    final file = File('${(await _cacheDir()).path}/${voiceoverCacheKey(req)}.mp3');
    return file.existsSync() ? file.path : null;
  }

  /// Persists [result] to disk: writes the transcript JSON and, if
  /// [VoiceoverResult.audioBytes] is present, writes the audio file.
  /// Returns a new [VoiceoverResult] with [audioFilePath] set and
  /// [audioBytes] cleared (so the in-memory copy can be GC'd).
  Future<VoiceoverResult> persist(VoiceoverResult result) async {
    final dir = await _cacheDir();
    final key = voiceoverCacheKey(result.request);

    final jsonFile = File('${dir.path}/$key.json');
    jsonFile.writeAsStringSync(jsonEncode({
      'transcript': result.transcript,
      'spotId': result.request.spotId,
      'spotName': result.request.spotName,
      'createdAt': DateTime.now().toIso8601String(),
    })));

    String? audioPath;
    var bytes = result.audioBytes;
    if (bytes != null) {
      final audioFile = File('${dir.path}/$key.mp3');
      audioFile.writeAsBytesSync(bytes);
      audioPath = audioFile.path;
      bytes = null; // free the in-memory copy
    } else {
      audioPath = result.audioFilePath;
    }

    // Construct directly (not copyWith) so audioBytes is genuinely
    // cleared — copyWith's `?? this.audioBytes` fallback can't
    // distinguish "not provided" from "set to null".
    return VoiceoverResult(
      request: result.request,
      transcript: result.transcript,
      audioBytes: null,
      audioFilePath: audioPath,
      cached: true,
      createdAt: DateTime.now(),
    );
  }

  /// Clears the entire cache. Returns the number of files removed.
  Future<int> clear() async {
    final dir = await _cacheDir();
    if (!dir.existsSync()) return 0;
    var count = 0;
    for (final entity in dir.listSync()) {
      entity.deleteSync();
      count++;
    }
    return count;
  }

  /// True if a cached transcript exists for [req].
  Future<bool> has(VoiceoverRequest req) async =>
      await readTranscript(req) != null;
}