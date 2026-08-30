import 'package:dio/dio.dart';
import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';

import 'package:gid_core/gid_core.dart';
import '../../core/config/server_config.dart';
import '../../core/providers.dart';
import '../../design/design_system.dart';

/// Point the app at a different backend without rebuilding it.
///
/// The base URL is compiled in, which meant every change of network — a new
/// Wi-Fi, a laptop that picked up a different DHCP lease, switching between a
/// USB tunnel and the LAN — cost a four-minute rebuild and reinstall. This is
/// the screen that makes it a ten-second edit.
///
/// Two things it refuses to do quietly:
///
///  * It never switches server while signed in. The access and refresh tokens
///    were issued by the old host and mean nothing to the new one; sending them
///    anyway hands a credential to a server that did not mint it.
///  * It never claims a URL works without asking. "Test" makes a real request
///    to /health and reports what actually came back, because the two failures
///    that matter here — the server is down, and Android refused the connection
///    as cleartext — look identical from the outside.
class DeveloperScreen extends ConsumerStatefulWidget {
  const DeveloperScreen({super.key});

  @override
  ConsumerState<DeveloperScreen> createState() => _DeveloperScreenState();
}

class _DeveloperScreenState extends ConsumerState<DeveloperScreen> {
  late final TextEditingController _controller;

  _ProbeResult? _probe;
  bool _testing = false;

  @override
  void initState() {
    super.initState();
    _controller = TextEditingController(text: ref.read(serverUrlProvider));
  }

  @override
  void dispose() {
    _controller.dispose();
    super.dispose();
  }

  /// Ask the candidate server whether it is there.
  ///
  /// A fresh Dio rather than the app's client: this URL is not the app's server
  /// yet, and the shared client would attach the current session's bearer token
  /// to a host that has no business seeing it.
  Future<void> _test() async {
    final url = ServerStore.normalise(_controller.text);
    if (url == null) {
      setState(() => _probe = const _ProbeResult.bad('That is not a URL we can call. Use http://host:port or https://host.'));
      return;
    }

    setState(() { _testing = true; _probe = null; });

    final dio = Dio(BaseOptions(
      // Short: this is a reachability check, and a developer waiting twenty
      // seconds to be told "no" will assume the button is broken.
      connectTimeout: const Duration(seconds: 6),
      receiveTimeout: const Duration(seconds: 6),
      validateStatus: (_) => true,
    ));

    try {
      final response = await dio.get<dynamic>('$url/health');
      final status = response.statusCode ?? 0;
      if (!mounted) return;

      setState(() {
        _probe = status == 200
            ? _ProbeResult.good('Reachable. ${_describe(response.data)}')
            : _ProbeResult.bad('Answered $status. That is a server, but not this API.');
      });
    } on DioException catch (e) {
      if (!mounted) return;
      setState(() => _probe = _ProbeResult.bad(_explain(e)));
    } finally {
      dio.close();
      if (mounted) setState(() => _testing = false);
    }
  }

  static String _describe(dynamic body) {
    if (body is Map && body['database'] != null) {
      return 'Database ${body['database']}.';
    }
    return 'Health check passed.';
  }

  /// Say which failure this is, in the developer's terms.
  static String _explain(DioException e) {
    final text = e.message ?? e.error?.toString() ?? '';

    if (text.contains('CLEARTEXT') || text.contains('cleartext')) {
      return 'Android blocked this as cleartext HTTP. Add the host to '
          'network_security_config.xml and rebuild, or use https.';
    }
    if (e.type == DioExceptionType.connectionTimeout ||
        e.type == DioExceptionType.receiveTimeout) {
      return 'Timed out. The host is reachable but nothing answered on that '
          'port — check the server is running, and that this network is not '
          'isolating clients from each other.';
    }
    if (text.contains('Failed host lookup')) {
      return 'That hostname does not resolve from this device.';
    }
    if (text.contains('Connection refused')) {
      return 'Connection refused. Nothing is listening on that port.';
    }
    return 'Could not reach it: ${e.type.name}.';
  }

  Future<void> _apply() async {
    final url = ServerStore.normalise(_controller.text);
    if (url == null) {
      setState(() => _probe = const _ProbeResult.bad('That is not a URL we can call.'));
      return;
    }

    final signedIn = ref.read(authControllerProvider).isAuthenticated;

    if (signedIn) {
      final confirmed = await showDialog<bool>(
        context: context,
        builder: (context) => AlertDialog(
          title: const Text('Sign out and switch?'),
          content: Text(
            'Your session was issued by the current server, so switching to '
            '$url signs you out. You will need to sign in again there.',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.of(context).pop(false),
              child: const Text('Cancel'),
            ),
            TextButton(
              onPressed: () => Navigator.of(context).pop(true),
              child: const Text('Switch'),
            ),
          ],
        ),
      );
      if (confirmed != true) return;
    }

    await ref.read(serverUrlProvider.notifier).use(url);
    // After the URL, not before: signing out first would send the revoke to the
    // old host, which is right, but the order matters for the redirect.
    if (signedIn) ref.read(authControllerProvider.notifier).forceSignOut();

    if (!mounted) return;
    setState(() => _probe = _ProbeResult.good('Now talking to $url.'));
  }

  Future<void> _reset() async {
    await ref.read(serverUrlProvider.notifier).reset();
    if (!mounted) return;
    _controller.text = ref.read(serverUrlProvider);
    setState(() => _probe = null);
  }

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;
    final current = ref.watch(serverUrlProvider);
    final overridden = ref.watch(serverUrlProvider.notifier).isOverridden;

    return Scaffold(
      appBar: AppBar(
        leading: AppIconButton(
          icon: AppIcons.chevronLeft,
          onPressed: () => Navigator.of(context).maybePop(),
        ),
        title: const Text('Developer'),
      ),
      body: ListView(
        padding: const EdgeInsets.all(Space.x5),
        children: [
          AppBanner(
            message: 'These settings change which server the app trusts. '
                'Nobody should ever ask you to change them.',
            tone: StateTone.warning,
            icon: AppIcons.shield,
          ),
          const SizedBox(height: Space.x5),

          Text('Current server', style: context.text.titleSmall),
          const SizedBox(height: Space.x2),
          Container(
            padding: Space.cardInsetsLarge,
            decoration: BoxDecoration(
              color: t.surfaceAlt,
              borderRadius: BorderRadius.circular(Radii.xl),
              border: Border.all(color: t.border),
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(
                      child: Text(current, style: context.text.bodyMedium),
                    ),
                    const SizedBox(width: Space.x2),
                    AppBadge(
                      overridden ? 'Override' : 'Build default',
                      tone: overridden ? BadgeTone.warning : BadgeTone.neutral,
                      dense: true,
                    ),
                  ],
                ),
                if (overridden) ...[
                  const SizedBox(height: Space.x2),
                  Text(
                    'Built with ${AppConfig.apiBaseUrl}',
                    style: context.text.bodySmall?.copyWith(color: t.textTertiary),
                  ),
                ],
              ],
            ),
          ),
          const SizedBox(height: Space.x5),

          AppTextField(
            label: 'Server URL',
            hint: 'http://192.168.1.5:4000',
            controller: _controller,
            keyboardType: TextInputType.url,
            onChanged: (_) => setState(() => _probe = null),
          ),
          const SizedBox(height: Space.x3),

          Text('Common hosts', style: context.text.labelMedium?.copyWith(color: t.textSecondary)),
          const SizedBox(height: Space.x2),
          Wrap(
            spacing: Space.x2,
            runSpacing: Space.x2,
            children: [
              for (final preset in _presets)
                _PresetChip(
                  preset: preset,
                  onTap: () {
                    _controller.text = preset.url;
                    setState(() => _probe = null);
                  },
                ),
            ],
          ),
          const SizedBox(height: Space.x5),

          if (_probe != null) ...[
            AppBanner(
              message: _probe!.message,
              tone: _probe!.ok ? StateTone.success : StateTone.error,
              icon: _probe!.ok ? AppIcons.success : AppIcons.alertCircle,
            ),
            const SizedBox(height: Space.x4),
          ],

          AppButton.secondary(
            label: 'Test connection',
            icon: AppIcons.refresh,
            loading: _testing,
            onPressed: _testing ? null : _test,
          ),
          const SizedBox(height: Space.x3),
          AppButton.primary(
            label: 'Use this server',
            onPressed: _testing ? null : _apply,
          ),
          const SizedBox(height: Space.x3),
          if (overridden)
            AppButton(
              label: 'Reset to build default',
              variant: AppButtonVariant.tertiary,
              onPressed: _reset,
            ),

          const SizedBox(height: Space.x8),
          AppButton(
            label: 'Hide developer settings',
            variant: AppButtonVariant.tertiary,
            onPressed: () async {
              await ref.read(developerModeProvider.notifier).lock();
              if (context.mounted) Navigator.of(context).maybePop();
            },
          ),
        ],
      ),
    );
  }
}

/// The hosts a developer actually types, and why each one is right.
class _Preset {
  const _Preset(this.url, this.why);

  final String url;
  final String why;
}

const _presets = [
  _Preset(AppConfig.deployedApiBaseUrl, 'Deployed — what the app ships with'),
  _Preset('http://localhost:4000', 'USB — needs adb reverse tcp:4000 tcp:4000'),
  _Preset('http://10.0.2.2:4000', 'Android emulator'),
];

class _PresetChip extends StatelessWidget {
  const _PresetChip({required this.preset, required this.onTap});

  final _Preset preset;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final t = context.tokens;

    return GestureDetector(
      onTap: onTap,
      behavior: HitTestBehavior.opaque,
      child: Container(
        padding: const EdgeInsets.symmetric(horizontal: Space.x3, vertical: Space.x2),
        decoration: BoxDecoration(
          color: t.primarySoft,
          borderRadius: BorderRadius.circular(Radii.md),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              preset.url,
              style: context.text.labelMedium?.copyWith(
                color: t.primary,
                fontWeight: FontWeight.w600,
              ),
            ),
            Text(
              preset.why,
              style: context.text.bodySmall?.copyWith(color: t.textTertiary),
            ),
          ],
        ),
      ),
    );
  }
}

class _ProbeResult {
  const _ProbeResult.good(this.message) : ok = true;
  const _ProbeResult.bad(this.message) : ok = false;

  final bool ok;
  final String message;
}
