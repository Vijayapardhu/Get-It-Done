import 'package:flutter/material.dart';

import 'design/design_system.dart';
import 'design/gallery.dart';

void main() {
  runApp(const GetItDoneApp());
}

/// Temporary shell.
///
/// Boots straight into the design gallery so the system can be reviewed on a
/// device. Replaced by the router and auth shell once the screens land.
class GetItDoneApp extends StatefulWidget {
  const GetItDoneApp({super.key});

  @override
  State<GetItDoneApp> createState() => _GetItDoneAppState();
}

class _GetItDoneAppState extends State<GetItDoneApp> {
  ThemeMode _themeMode = ThemeMode.light;

  /// Drives the script-aware font swap in [AppTypography]. Wired to the user's
  /// stored preference (`PATCH /users/me/language`) once auth exists.
  final Locale _locale = const Locale('en');

  @override
  Widget build(BuildContext context) {
    return MaterialApp(
      title: 'GET IT DONE',
      debugShowCheckedModeBanner: false,
      theme: AppTheme.light(_locale),
      darkTheme: AppTheme.dark(_locale),
      themeMode: _themeMode,
      locale: _locale,
      builder: (context, child) {
        // Clamp text scaling. Users can scale up for readability, but beyond
        // 1.3 the booking cards break; the app should bend, not shatter.
        final scale = MediaQuery.textScalerOf(context).clamp(minScaleFactor: 0.9, maxScaleFactor: 1.3);
        return MediaQuery(
          data: MediaQuery.of(context).copyWith(textScaler: scale),
          child: child!,
        );
      },
      home: DesignGallery(
        themeMode: _themeMode,
        onToggleTheme: () => setState(() {
          _themeMode = _themeMode == ThemeMode.light ? ThemeMode.dark : ThemeMode.light;
        }),
      ),
    );
  }
}
