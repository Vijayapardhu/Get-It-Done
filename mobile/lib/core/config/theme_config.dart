import 'dart:async';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_secure_storage/flutter_secure_storage.dart';

/// Which theme the app uses, and the fact that it never guesses.
///
/// The app is a LIGHT app. It opens light for everyone, first run and every
/// run after, and only ever goes dark because somebody asked it to.
///
/// [ThemeMode.system] is deliberately not an option. Following the OS sounds
/// accommodating and behaves badly here: a phone on an automatic schedule
/// flips this app at sunset mid-booking, screenshots taken for a demo come out
/// in whichever mode the laptop happened to be in, and a customer who chose
/// light gets dark anyway because their battery saver said so. Two states, both
/// chosen, neither surprising.
enum AppThemeChoice {
  light,
  dark;

  ThemeMode get mode => this == AppThemeChoice.dark ? ThemeMode.dark : ThemeMode.light;

  AppThemeChoice get opposite =>
      this == AppThemeChoice.dark ? AppThemeChoice.light : AppThemeChoice.dark;
}

class ThemeStore {
  ThemeStore({FlutterSecureStorage? storage})
      : _storage = storage ?? const FlutterSecureStorage();

  final FlutterSecureStorage _storage;

  static const _key = 'gid.theme';

  /// Read in `main()` before the first frame, so the app never paints light and
  /// then snaps to dark in front of someone who chose dark.
  static AppThemeChoice cached = AppThemeChoice.light;

  static Future<void> load() async {
    cached = await ThemeStore().read();
  }

  Future<AppThemeChoice> read() async {
    try {
      return await _storage.read(key: _key) == 'dark'
          ? AppThemeChoice.dark
          : AppThemeChoice.light;
    } catch (_) {
      // A device whose keystore is unavailable gets the default rather than a
      // crash on the very first frame.
      return AppThemeChoice.light;
    }
  }

  Future<void> write(AppThemeChoice choice) async {
    cached = choice;
    await _storage.write(key: _key, value: choice.name);
  }
}

class ThemeController extends Notifier<AppThemeChoice> {
  @override
  AppThemeChoice build() => ThemeStore.cached;

  void toggle() => use(state.opposite);

  void use(AppThemeChoice choice) {
    if (choice == state) return;
    state = choice;
    unawaited(ThemeStore().write(choice));
  }
}

final themeProvider = NotifierProvider<ThemeController, AppThemeChoice>(ThemeController.new);
