import 'dart:async';

import 'package:flutter/foundation.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:gid_core/gid_core.dart';
import '../providers.dart';

/// Operator-editable strings, layered over the bundled ARB translations.
///
/// Two layers, because they answer different questions:
///
///   * The ARB files are the app's own vocabulary — buttons, validation, empty
///     states. They ship with the build, work with no network, and are the only
///     thing that can be trusted to exist.
///   * `/i18n/translations/:lang` is the operator's vocabulary — a service
///     description reworded, a policy line corrected, a term a particular
///     cooperative uses differently. Those must be changeable without waiting
///     on a store review.
///
/// The overlay NEVER replaces the ARB layer, only shadows individual keys. A
/// backend that is down, slow, or returns nonsense degrades to a fully working
/// English/Telugu/Hindi app rather than to a screen of blank labels — which is
/// why [lookup] falls through instead of returning null-ish placeholders.
class TranslationOverlay {
  TranslationOverlay(this._client);

  final ApiClient _client;

  /// Keyed by language code, so switching language does not discard the fetch
  /// for the previous one — customers flip back and forth while deciding.
  final Map<String, Map<String, String>> _byLanguage = {};

  /// In-flight fetches, so a rebuild storm cannot fire ten identical requests.
  final Map<String, Future<void>> _loading = {};

  /// Overlay value for [key], or null to fall through to the bundled string.
  String? lookup(String language, String key) => _byLanguage[language]?[key];

  bool isLoaded(String language) => _byLanguage.containsKey(language);

  /// Fetch one language's overrides. Best-effort by design.
  Future<void> load(String language) {
    final existing = _loading[language];
    if (existing != null) return existing;

    final future = _fetch(language).whenComplete(() => _loading.remove(language));
    _loading[language] = future;
    return future;
  }

  Future<void> _fetch(String language) async {
    try {
      final json = await _client.get('/i18n/translations/$language', auth: false);

      // The endpoint returns { translations: { key: value } }. Anything else is
      // treated as "no overrides" rather than as an error worth surfacing: a
      // customer cannot act on a translation-service problem.
      final raw = json['translations'];
      if (raw is! Map) {
        _byLanguage[language] = const {};
        return;
      }

      _byLanguage[language] = {
        for (final entry in raw.entries)
          if (entry.value is String && (entry.value as String).isNotEmpty)
            entry.key.toString(): entry.value as String,
      };
    } catch (error) {
      // Cache the failure as "no overrides" so every rebuild does not retry a
      // backend that is down. A restart, or a language change, tries again.
      _byLanguage[language] = const {};
      if (kDebugMode) debugPrint('[i18n] overlay unavailable for $language: $error');
    }
  }
}

final translationOverlayProvider = Provider<TranslationOverlay>((ref) {
  return TranslationOverlay(ref.watch(apiClientProvider));
});
