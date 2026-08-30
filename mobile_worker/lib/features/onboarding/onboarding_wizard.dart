import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:geolocator/geolocator.dart';
import 'package:gid_core/gid_core.dart';
import 'package:gid_ui/gid_ui.dart';
import 'package:go_router/go_router.dart';
import 'package:image_picker/image_picker.dart';

import '../../core/models/worker_models.dart';
import '../../core/providers.dart';

/// Six steps, each one saved on its own.
///
/// Nobody finishes this in one sitting on a 2G connection, and a wizard that
/// loses everything when the app is backgrounded at step four is a wizard
/// nobody finishes at all. So every step commits as soon as it is valid, the
/// rail shows where the worker is, and closing the app is safe at any point.
///
///   personal → cooperative → skills → service areas → documents → payout
///
/// Steps 3 and 4 write through `PUT /workers/me/skills` and
/// `/service-areas`, which are whole-collection replaces — so they are edited
/// as a set here and sent as a set.
class OnboardingWizard extends ConsumerStatefulWidget {
  const OnboardingWizard({super.key});

  @override
  ConsumerState<OnboardingWizard> createState() => _OnboardingWizardState();
}

class _OnboardingWizardState extends ConsumerState<OnboardingWizard> {
  int _step = 0;
  bool _busy = false;
  String? _failure;

  final _address = TextEditingController();
  final _experience = TextEditingController(text: '0');
  final _payoutRef = TextEditingController();
  String _payoutProvider = 'upi';
  final Set<String> _serviceIds = {};
  double _radiusKm = 10;

  // Profile photo
  File? _photoFile;
  final _picker = ImagePicker();
  bool _pickingPhoto = false;

  static const _steps = [
    ('About you', 'Where you are based, and how long you have been doing this'),
    ('Your trades', 'What work you take. You can change this later'),
    ('How far you travel', 'We will not offer you jobs beyond this'),
    ('Your documents', 'An ID and anything that proves your trade'),
    ('Where you get paid', 'A UPI id or a bank account in your name'),
    ('Send for checking', 'A cooperative admin looks at it, usually within a day'),
  ];

  @override
  void dispose() {
    _address.dispose();
    _experience.dispose();
    _payoutRef.dispose();
    super.dispose();
  }

  Future<void> _commit(Future<void> Function() work) async {
    setState(() {
      _busy = true;
      _failure = null;
    });
    try {
      await work();
      if (mounted) setState(() => _step = (_step + 1).clamp(0, _steps.length - 1));
    } on ApiException catch (error) {
      if (mounted) {
        setState(() => _failure = error.isNetwork
            ? 'No connection. Nothing was lost — try again when you have signal.'
            : error.message);
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  Future<void> _saveProfile() => _commit(() async {
        await ref.read(workerApiProvider).onboard({
          'address': _address.text.trim(),
          'experienceYears': int.tryParse(_experience.text) ?? 0,
        });
        // The photo goes through the presigned-URL flow; the profile only ever
        // stores the resulting URL, never the bytes.
        if (_photoFile != null) {
          final url = await ref.read(workerApiProvider).uploadProfilePhoto(_photoFile!);
          await ref.read(workerApiProvider).updateProfile(photoUrl: url);
        }
        ref.invalidate(workerProfileProvider);
      });

  Future<void> _saveSkills() => _commit(() async {
        await ref.read(workerApiProvider).saveSkills(
              _serviceIds.map((id) => (serviceId: id, level: null)).toList(),
            );
      });

  Future<void> _saveAreas() => _commit(() async {
        await ref.read(workerApiProvider).saveServiceAreas([
          for (final id in _serviceIds)
            ServiceAreaInput(serviceId: id, radiusKm: _radiusKm).toArea(),
        ]);
      });

  Future<void> _savePayout() => _commit(() async {
        await ref.read(workerApiProvider).savePayoutAccount(
              provider: _payoutProvider,
              accountReference: _payoutRef.text.trim(),
            );
      });

  Future<void> _submit() => _commit(() async {
        await ref.read(workerApiProvider).submitForVerification();
        ref.invalidate(verificationStatusProvider);
        if (mounted) context.go('/verification');
      });

  Future<void> _pickPhoto() async {
    if (_pickingPhoto) return;
    setState(() => _pickingPhoto = true);
    try {
      final picked = await _picker.pickImage(
        source: ImageSource.camera,
        preferredCameraDevice: CameraDevice.front,
        imageQuality: 80,
        maxWidth: 512,
        maxHeight: 512,
      );
      if (picked != null && mounted) {
        setState(() => _photoFile = File(picked.path));
      }
    } catch (error) {
      if (mounted) {
        setState(() => _failure = 'Could not take photo: $error');
      }
    } finally {
      if (mounted) setState(() => _pickingPhoto = false);
    }
  }

  Future<void> _pickPhotoFromGallery() async {
    if (_pickingPhoto) return;
    setState(() => _pickingPhoto = true);
    try {
      final picked = await _picker.pickImage(
        source: ImageSource.gallery,
        imageQuality: 80,
        maxWidth: 512,
        maxHeight: 512,
      );
      if (picked != null && mounted) {
        setState(() => _photoFile = File(picked.path));
      }
    } catch (error) {
      if (mounted) {
        setState(() => _failure = 'Could not select photo: $error');
      }
    } finally {
      if (mounted) setState(() => _pickingPhoto = false);
    }
  }

  void _removePhoto() {
    setState(() => _photoFile = null);
  }

  Future<void> _fetchCurrentLocation() async {
    setState(() => _failure = null);

    try {
      if (!await Geolocator.isLocationServiceEnabled()) {
        setState(() => _failure = 'Location services are disabled. Please enable them in settings.');
        return;
      }

      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }
      if (permission == LocationPermission.deniedForever || permission == LocationPermission.denied) {
        setState(() => _failure = 'Location permission is required to auto-fill your address.');
        return;
      }

      final position = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(accuracy: LocationAccuracy.high),
      );

      _address.text = '${position.latitude.toStringAsFixed(6)}, ${position.longitude.toStringAsFixed(6)}';
    } catch (error) {
      setState(() => _failure = 'Could not get location: $error');
    }
  }

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    final (title, subtitle) = _steps[_step];

    return Scaffold(
      appBar: AppBar(
        title: Text('Step ${_step + 1} of ${_steps.length}'),
        leading: _step == 0
            ? null
            : IconButton(
                onPressed: () => setState(() => _step -= 1),
                icon: AppIcon(AppIcons.chevronLeft, size: 24),
              ),
      ),
      body: Column(
        children: [
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: Space.page),
            child: Row(
              children: [
                for (var i = 0; i < _steps.length; i++)
                  Expanded(
                    child: Container(
                      height: 5,
                      margin: const EdgeInsets.symmetric(horizontal: 2),
                      decoration: BoxDecoration(
                        color: i <= _step ? tokens.primary : tokens.border,
                        borderRadius: Radii.rPill,
                      ),
                    ),
                  ),
              ],
            ),
          ),
          Expanded(
            child: ListView(
              padding: const EdgeInsets.all(Space.page),
              children: [
                Text(title, style: context.text.headlineSmall),
                const SizedBox(height: Space.x2),
                Text(subtitle, style: context.text.bodyMedium?.copyWith(color: tokens.textSecondary)),
                const SizedBox(height: Space.x6),
                _body(),
                if (_failure != null) ...[
                  const SizedBox(height: Space.x4),
                  Container(
                    padding: const EdgeInsets.all(Space.x3),
                    decoration: BoxDecoration(color: tokens.dangerSoft, borderRadius: Radii.rMd),
                    child: Text(_failure!, style: context.text.bodyMedium?.copyWith(color: tokens.danger)),
                  ),
                ],
              ],
            ),
          ),
        ],
      ),
      bottomNavigationBar: SafeArea(
        minimum: const EdgeInsets.fromLTRB(Space.page, 0, Space.page, Space.x4),
        child: SizedBox(
          height: WorkerSizes.button,
          child: FilledButton(
            onPressed: _busy ? null : _advance,
            child: _busy
                ? const SizedBox(
                    width: 22, height: 22,
                    child: CircularProgressIndicator(strokeWidth: 2.5, color: AppColors.n0),
                  )
                : Text(_step == _steps.length - 1 ? 'Send for checking' : 'Save and continue'),
          ),
        ),
      ),
    );
  }

  void _advance() {
    switch (_step) {
      case 0:
        _saveProfile();
      case 1:
        _saveSkills();
      case 2:
        _saveAreas();
      case 3:
        setState(() => _step += 1);
      case 4:
        _savePayout();
      default:
        _submit();
    }
  }

  Widget _body() {
    final tokens = context.tokens;
    switch (_step) {
      case 0:
        return _AboutYouStep(
          addressController: _address,
          experienceController: _experience,
          photoFile: _photoFile,
          onPickPhoto: _pickPhoto,
          onPickFromGallery: _pickPhotoFromGallery,
          onRemovePhoto: _removePhoto,
          isPickingPhoto: _pickingPhoto,
          onFetchLocation: _fetchCurrentLocation,
        );

      case 1:
        return Consumer(
          builder: (context, ref, _) {
            final services = ref.watch(_servicesProvider);
            return services.when(
              loading: () => const Center(child: CircularProgressIndicator()),
              error: (_, __) => const Text('Could not load the list of trades. Pull down to retry.'),
              data: (list) => Column(
                children: [
                  for (final service in list)
                    CheckboxListTile(
                      contentPadding: EdgeInsets.zero,
                      value: _serviceIds.contains(service.id),
                      title: Text(service.name),
                      subtitle: Text(service.category, style: context.text.bodySmall),
                      onChanged: (on) => setState(() {
                        on == true ? _serviceIds.add(service.id) : _serviceIds.remove(service.id);
                      }),
                    ),
                ],
              ),
            );
          },
        );

      case 2:
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text('${_radiusKm.round()} km', style: context.text.displaySmall),
            Slider(
              value: _radiusKm,
              min: 2,
              max: 50,
              divisions: 24,
              onChanged: (v) => setState(() => _radiusKm = v),
            ),
            Text(
              'A bigger area means more offers and longer journeys. You can change it any time.',
              style: context.text.bodySmall?.copyWith(color: tokens.textSecondary),
            ),
          ],
        );

      case 3:
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'You will need a photo ID, and a certificate for any trade that needs one '
              '(gas, electrical, childcare).',
              style: context.text.bodyMedium,
            ),
            const SizedBox(height: Space.x4),
            OutlinedButton.icon(
              onPressed: () => context.push('/profile/documents'),
              icon: AppIcon(AppIcons.upload, size: 20),
              label: const Text('Upload documents'),
              style: OutlinedButton.styleFrom(minimumSize: const Size.fromHeight(WorkerSizes.button)),
            ),
          ],
        );

      case 4:
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            SegmentedButton<String>(
              segments: const [
                ButtonSegment(value: 'upi', label: Text('UPI')),
                ButtonSegment(value: 'bank', label: Text('Bank account')),
              ],
              selected: {_payoutProvider},
              onSelectionChanged: (s) => setState(() => _payoutProvider = s.first),
            ),
            const SizedBox(height: Space.x4),
            TextField(
              controller: _payoutRef,
              decoration: InputDecoration(
                labelText: _payoutProvider == 'upi' ? 'Your UPI id' : 'Account number and IFSC',
              ),
            ),
            const SizedBox(height: Space.x3),
            Text(
              'It must be in your own name. Payouts to somebody else\'s account cannot be released.',
              style: context.text.bodySmall?.copyWith(color: tokens.textSecondary),
            ),
          ],
        );

      default:
        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              'That is everything we need. A cooperative admin will check it, usually within a day. '
              'We will tell you as soon as it is done.',
              style: context.text.bodyLarge,
            ),
            const SizedBox(height: Space.x4),
            Text(
              'You will not be offered jobs until then.',
              style: context.text.bodyMedium?.copyWith(color: tokens.textSecondary),
            ),
          ],
        );
    }
  }
}

/// Step 0 — About you: photo, location, experience.
///
/// A single cohesive card instead of scattered fields. Photo first (customers
/// see it), then address with GPS shortcut, then experience.
class _AboutYouStep extends StatelessWidget {
  const _AboutYouStep({
    required this.addressController,
    required this.experienceController,
    required this.photoFile,
    required this.onPickPhoto,
    required this.onPickFromGallery,
    required this.onRemovePhoto,
    required this.isPickingPhoto,
    required this.onFetchLocation,
  });

  final TextEditingController addressController;
  final TextEditingController experienceController;
  final File? photoFile;
  final VoidCallback onPickPhoto;
  final VoidCallback onPickFromGallery;
  final VoidCallback onRemovePhoto;
  final bool isPickingPhoto;
  final VoidCallback onFetchLocation;

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        // ── Profile photo ──
        Center(
          child: Stack(
            children: [
              CircleAvatar(
                radius: 56,
                backgroundColor: tokens.primarySoft,
                backgroundImage: photoFile != null ? FileImage(photoFile!) : null,
                child: photoFile == null
                    ? AppIcon(AppIcons.camera, size: 32, color: tokens.primary)
                    : null,
              ),
              Positioned(
                right: 0,
                bottom: 0,
                child: Material(
                  color: tokens.primary,
                  shape: const CircleBorder(),
                  child: InkWell(
                    customBorder: const CircleBorder(),
                    onTap: isPickingPhoto ? null : () => _showPhotoSourceSheet(context),
                    child: Padding(
                      padding: const EdgeInsets.all(8),
                      child: isPickingPhoto
                          ? SizedBox(
                              width: 20,
                              height: 20,
                              child: CircularProgressIndicator(
                                strokeWidth: 2,
                                color: AppColors.n0,
                              ),
                            )
                          : AppIcon(AppIcons.camera, size: 20, color: AppColors.n0),
                    ),
                  ),
                ),
              ),
              if (photoFile != null)
                Positioned(
                  left: 0,
                  bottom: 0,
                  child: Material(
                    color: tokens.danger,
                    shape: const CircleBorder(),
                    child: InkWell(
                      customBorder: const CircleBorder(),
                      onTap: onRemovePhoto,
                      child: Padding(
                        padding: const EdgeInsets.all(8),
                        child: AppIcon(AppIcons.close, size: 18, color: AppColors.n0),
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),

        const SizedBox(height: Space.x6),

        // ── Location ──
        Text('Where you work', style: context.text.titleMedium),
        const SizedBox(height: Space.x2),
        TextField(
          controller: addressController,
          autofocus: true,
          textInputAction: TextInputAction.next,
          keyboardType: TextInputType.text,
          maxLines: 2,
          decoration: InputDecoration(
            labelText: 'City / area',
            hintText: 'e.g. Hyderabad, Jubilee Hills',
            prefixIcon: AppIcon(AppIcons.location, size: 20, color: tokens.textSecondary),
            suffixIcon: IconButton(
              tooltip: 'Use current location',
              onPressed: onFetchLocation,
              icon: AppIcon(AppIcons.location, size: 20),
            ),
          ),
        ),

        const SizedBox(height: Space.x4),

        // ── Experience ──
        Text('Experience', style: context.text.titleMedium),
        const SizedBox(height: Space.x2),
        TextField(
          controller: experienceController,
          keyboardType: TextInputType.number,
          textInputAction: TextInputAction.done,
          decoration: InputDecoration(
            labelText: 'Years doing this work',
            hintText: '0',
            prefixIcon: AppIcon(AppIcons.time, size: 20, color: tokens.textSecondary),
          ),
        ),

        const SizedBox(height: Space.x3),
        Text(
          'This helps customers pick the right person for their job.',
          style: context.text.bodySmall?.copyWith(color: tokens.textSecondary),
        ),
      ],
    );
  }

  void _showPhotoSourceSheet(BuildContext context) {
    showModalBottomSheet(
      context: context,
      builder: (_) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: AppIcon(AppIcons.camera, size: 24),
              title: const Text('Take a photo'),
              onTap: () {
                Navigator.pop(context);
                onPickPhoto();
              },
            ),
            ListTile(
              leading: AppIcon(AppIcons.photo, size: 24),
              title: const Text('Choose from gallery'),
              onTap: () {
                Navigator.pop(context);
                onPickFromGallery();
              },
            ),
          ],
        ),
      ),
    );
  }
}

/// The catalogue, read once during onboarding. Lives here rather than in the
/// composition root because nothing else in this app needs it — the worker app
/// has no catalogue.
final _servicesProvider = FutureProvider<List<Service>>(
  (ref) => ref.watch(sharedApiProvider).services(),
);

/// A tiny helper so the wizard can build service areas without importing the
/// model's positional shape at three call sites.
class ServiceAreaInput {
  const ServiceAreaInput({required this.serviceId, required this.radiusKm});
  final String serviceId;
  final double radiusKm;

  ServiceArea toArea() => ServiceArea(serviceId: serviceId, serviceName: '', radiusKm: radiusKm);
}