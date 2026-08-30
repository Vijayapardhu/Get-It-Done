import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gid_ui/gid_ui.dart';
import 'package:go_router/go_router.dart';

import '../../core/config/worker_config.dart';

/// The first screen, before sign-in.
///
/// Telugu first, not Telugu eventually. The audience is Telangana cooperative
/// workers, and an app that opens in English with the language buried three
/// taps into settings is an English app with a Telugu setting.
///
/// It is asked once, stored, and never asked again — but it stays changeable
/// from Settings, because a worker who taps the wrong one at 6am must not be
/// stuck with it.
class LanguageGate extends ConsumerWidget {
  const LanguageGate({super.key});

  @override
  Widget build(BuildContext context, WidgetRef ref) {
    return Scaffold(
      backgroundColor: WorkerTheme.headerLight,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(Space.page),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              const Spacer(),
              Image.asset('assets/brand/mark.png', height: 72),
              const SizedBox(height: Space.x8),
              Text(
                // Shown in all three at once, so nobody has to read a language
                // they do not read in order to choose the one they do.
                'భాష ఎంచుకోండి\nChoose your language\nभाषा चुनें',
                textAlign: TextAlign.center,
                style: context.text.titleLarge?.copyWith(color: AppColors.n0, height: 1.6),
              ),
              const SizedBox(height: Space.x8),
              for (final locale in supportedWorkerLocales)
                Padding(
                  padding: const EdgeInsets.only(bottom: Space.x3),
                  child: SizedBox(
                    height: WorkerSizes.jobAction,
                    child: FilledButton(
                      onPressed: () async {
                        await ref.read(localeProvider.notifier).set(locale.languageCode);
                        if (context.mounted) context.go('/sign-in');
                      },
                      style: FilledButton.styleFrom(
                        backgroundColor: AppColors.blue700,
                        shape: const RoundedRectangleBorder(borderRadius: Radii.rLg),
                      ),
                      child: Text(
                        workerLanguageNames[locale.languageCode]!,
                        style: context.text.titleLarge?.copyWith(color: AppColors.n0),
                      ),
                    ),
                  ),
                ),
              const Spacer(),
            ],
          ),
        ),
      ),
    );
  }
}
