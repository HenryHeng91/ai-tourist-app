import 'voiceover_models.dart';

/// Builds the chat-completions prompt for the AI voiceover.
///
/// The prompt is a structured template (system + user messages) that
/// asks the AI for: a brief history of the place, why it's attractive,
/// and nearby amenities (restaurants, toilets, marts). The output is
/// constrained to a conversational tone suitable for TTS — short
/// sentences, no markdown, no URLs.
///
/// Pure logic — no IO, no Dio. Fully unit-tested.
class PromptBuilder {
  PromptBuilder({
    this.maxAmenities = 6,
    this.targetWordCount = 180,
  });

  /// Cap on amenities listed in the prompt (keeps token cost bounded).
  final int maxAmenities;

  /// Suggested transcript length. The AI is asked to aim for this;
  /// it's not a hard limit.
  final int targetWordCount;

  /// Builds the messages array for an OpenAI-compatible
  /// `POST /chat/completions` call.
  ///
  /// Returns a list of `{role, content}` maps in the order
  /// `[system, user]`. The system message sets the persona + format
  /// constraints; the user message carries the spot + amenities.
  List<Map<String, String>> buildMessages(VoiceoverRequest req) {
    return [
      {'role': 'system', 'content': _systemPrompt(req.language)},
      {'role': 'user', 'content': _userPrompt(req)},
    ];
  }

  /// Convenience: returns the user-message content only. Used by tests
  /// + by the cache key derivation (the system prompt is constant per
  /// language).
  String buildUserPrompt(VoiceoverRequest req) => _userPrompt(req);

  String _systemPrompt(String language) {
    // Single source of truth for the AI persona. Keeping it in one
    // string makes A/B testing alternative personas trivial.
    final langName = language == 'en' ? 'English' : language;
    return 'You are an engaging travel guide. The user has just arrived '
        'at a tourist spot. Deliver a spoken voiceover in $langName that '
        'covers: (1) a brief history of the place, (2) why it is '
        'attractive or notable, and (3) nearby useful amenities if any. '
        'Keep it conversational — short sentences, no markdown, no URLs, '
        'no bullet lists. Aim for about $targetWordCount words. Do not '
        'invent facts; if you are unsure about a detail, omit it.';
  }

  String _userPrompt(VoiceoverRequest req) {
    final parts = <String>[
      'Spot: ${req.spotName}',
      if (req.spotCategory != null) 'Category: ${req.spotCategory}',
      if (req.spotDescription != null) 'Description: ${req.spotDescription}',
      'Location: ${_fmt(req.userPosition)}',
      if (req.amenities.isNotEmpty) _amenitiesSection(req.amenities),
    ];
    return parts.join('\n');
  }

  String _amenitiesSection(List<NearbyAmenity> amenities) {
    final capped = amenities.take(maxAmenities).toList();
    final byType = <String, List<NearbyAmenity>>{};
    for (final a in capped) {
      byType.putIfAbsent(a.type, () => []).add(a);
    }
    final lines = <String>['Nearby amenities:'];
    for (final entry in byType.entries) {
      final names = entry.value.map(_amenityLabel).join(', ');
      lines.add('- ${entry.key}: $names');
    }
    if (amenities.length > maxAmenities) {
      lines.add('(and ${amenities.length - maxAmenities} more)');
    }
    return lines.join('\n');
  }

  String _amenityLabel(NearbyAmenity a) {
    if (a.distanceMeters == null) return a.name;
    final d = a.distanceMeters!;
    if (d < 1000) return '${a.name} (${d.round()} m)';
    return '${a.name} (${(d / 1000).toStringAsFixed(1)} km)';
  }

  String _fmt(LatLng p) =>
      '${p.latitude.toStringAsFixed(5)}, ${p.longitude.toStringAsFixed(5)}';
}

/// Derives a stable cache key for a voiceover request. Two requests
/// with the same spot + language + amenity set hit the same cache
/// entry — the user position is intentionally excluded (a 5m shift
/// shouldn't bust the cache).
String voiceoverCacheKey(VoiceoverRequest req) {
  final amenitySig = req.amenities
      .map((a) => '${a.type}:${a.name}')
      .toList()
        ..sort();
  return '${req.spotId}|${req.language}|${amenitySig.join(',')}';
}