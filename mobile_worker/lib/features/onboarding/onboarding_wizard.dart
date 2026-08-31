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
import 'document_scanner_screen.dart';

/// Provider for loading all platform services for trade selection.
final _allServicesProvider = FutureProvider<List<Service>>((ref) async {
  return ref.watch(sharedApiProvider).services();
});

/// Comprehensive 6-step worker onboarding wizard.
///
/// Steps:
///   1. Personal details / About you (Name, phone, photo, experience, location)
///   2. Your trades / Skills (Choose which services you perform)
///   3. How far you travel (Set service radius in km)
///   4. Your documents (Aadhaar & PAN with Google ML Kit Scanner & OCR)
///   5. Where you get paid (UPI or Bank account)
///   6. Send for checking (Summary review & submit for verification)
class OnboardingWizard extends ConsumerStatefulWidget {
  const OnboardingWizard({super.key});

  @override
  ConsumerState<OnboardingWizard> createState() => _OnboardingWizardState();
}

class _OnboardingWizardState extends ConsumerState<OnboardingWizard> {
  int _step = 0;
  bool _busy = false;
  String? _failure;

  // Step 1: Personal Details
  final _name = TextEditingController();
  final _phone = TextEditingController();
  final _address = TextEditingController();
  int _experienceYears = 2;
  double? _latitude;
  double? _longitude;
  File? _photoFile;
  final _picker = ImagePicker();
  bool _pickingPhoto = false;

  // Step 2: Trades / Skills
  final Set<String> _selectedServiceIds = {};

  // Step 3: Service Radius
  double _globalRadiusKm = 15.0;

  // Step 4: Documents (Aadhaar & PAN with ML Kit OCR)
  File? _aadharFile;
  String? _aadharText;
  String? _aadharNumber;
  File? _panFile;
  String? _panText;
  String? _panNumber;

  // Step 5: Payout Account
  final _accountHolder = TextEditingController();
  final _payoutRef = TextEditingController();
  final _ifscCode = TextEditingController();
  String _payoutProvider = 'upi';

  // Step 6: Review & Submit
  final _adminNotes = TextEditingController();

  static const _stepTitles = [
    ('About you', 'Your name, phone, experience, and where you work'),
    ('Your trades', 'Select the services you offer to customers'),
    ('How far you travel', 'Set your preferred travel distance for jobs'),
    ('Your documents', 'Aadhaar and PAN card for identity verification'),
    ('Where you get paid', 'A UPI ID or bank account in your name'),
    ('Send for checking', 'Review your details and submit for approval'),
  ];

  @override
  void initState() {
    super.initState();
    _prefillFromAuth();
  }

  void _prefillFromAuth() {
    final user = ref.read(authProvider).user;
    if (user != null) {
      if (user.name.isNotEmpty && _name.text.isEmpty) {
        _name.text = user.name;
      }
      final phone = user.phone;
      if (phone != null && phone.isNotEmpty && _phone.text.isEmpty) {
        _phone.text = phone;
      }
      if (_accountHolder.text.isEmpty && user.name.isNotEmpty) {
        _accountHolder.text = user.name;
      }
    }
  }

  @override
  void dispose() {
    _name.dispose();
    _phone.dispose();
    _address.dispose();
    _accountHolder.dispose();
    _payoutRef.dispose();
    _ifscCode.dispose();
    _adminNotes.dispose();
    super.dispose();
  }

  Future<void> _commit(Future<void> Function() work) async {
    setState(() {
      _busy = true;
      _failure = null;
    });
    try {
      await work();
      if (mounted) {
        setState(() => _step = (_step + 1).clamp(0, _stepTitles.length - 1));
      }
    } on ApiException catch (error) {
      if (mounted) {
        setState(() => _failure = error.isNetwork
            ? 'No connection. Nothing was lost — check your network and try again.'
            : error.message);
      }
    } catch (error) {
      if (mounted) {
        setState(() => _failure = error.toString());
      }
    } finally {
      if (mounted) setState(() => _busy = false);
    }
  }

  // ────────────────────────────────────────── Step 1: Personal Details ──

  Future<void> _savePersonalDetails() => _commit(() async {
        final name = _name.text.trim();
        final phone = _phone.text.trim();
        final address = _address.text.trim();

        if (name.isEmpty) throw 'Please enter your full name.';
        if (phone.isEmpty) throw 'Please enter your phone number.';

        if (_latitude == null || _longitude == null) {
          await _fetchCurrentLocation();
        }

        // Create or update worker profile
        try {
          await ref.read(workerApiProvider).registerWorker(
                name: name,
                phone: phone,
                address: address.isNotEmpty ? address : 'Hyderabad',
                latitude: _latitude,
                longitude: _longitude,
              );
        } catch (_) {
          // If already registered, update profile
          await ref.read(workerApiProvider).updateProfile(
                address: address.isNotEmpty ? address : null,
                experienceYears: _experienceYears,
              );
        }

        if (_photoFile != null) {
          final url = await ref.read(workerApiProvider).uploadProfilePhoto(_photoFile!);
          await ref.read(workerApiProvider).updateProfile(photoUrl: url);
        }

        ref.invalidate(workerProfileProvider);
      });

  Future<void> _fetchCurrentLocation() async {
    setState(() => _failure = null);
    try {
      if (!await Geolocator.isLocationServiceEnabled()) {
        setState(() => _failure = 'Please enable location services in settings.');
        return;
      }

      var permission = await Geolocator.checkPermission();
      if (permission == LocationPermission.denied) {
        permission = await Geolocator.requestPermission();
      }
      if (permission == LocationPermission.deniedForever || permission == LocationPermission.denied) {
        setState(() => _failure = 'Location permission is required for finding jobs near you.');
        return;
      }

      final position = await Geolocator.getCurrentPosition(
        locationSettings: const LocationSettings(accuracy: LocationAccuracy.high),
      );

      setState(() {
        _latitude = position.latitude;
        _longitude = position.longitude;
        if (_address.text.isEmpty) {
          _address.text = 'Location: ${position.latitude.toStringAsFixed(4)}, ${position.longitude.toStringAsFixed(4)}';
        }
      });
    } catch (error) {
      setState(() => _failure = 'Could not get current location: $error');
    }
  }

  Future<void> _pickPhoto(ImageSource source) async {
    if (_pickingPhoto) return;
    setState(() => _pickingPhoto = true);
    try {
      final picked = await _picker.pickImage(
        source: source,
        preferredCameraDevice: CameraDevice.front,
        imageQuality: 85,
        maxWidth: 600,
        maxHeight: 600,
      );
      if (picked != null && mounted) {
        setState(() => _photoFile = File(picked.path));
      }
    } catch (error) {
      if (mounted) setState(() => _failure = 'Photo selection error: $error');
    } finally {
      if (mounted) setState(() => _pickingPhoto = false);
    }
  }

  // ────────────────────────────────────────── Step 2: Trades & Skills ──

  Future<void> _saveTrades() => _commit(() async {
        if (_selectedServiceIds.isEmpty) {
          throw 'Please select at least one trade you can perform.';
        }

        final skillsList = _selectedServiceIds.map((id) => (serviceId: id, level: 'intermediate')).toList();
        await ref.read(workerApiProvider).saveSkills(skillsList);
      });

  // ────────────────────────────────────────── Step 3: Service Radius ──

  Future<void> _saveRadius() => _commit(() async {
        final allServices = await ref.read(_allServicesProvider.future);
        final selectedServices = allServices.where((s) => _selectedServiceIds.contains(s.id)).toList();

        final areas = selectedServices.map((service) => ServiceArea(
              serviceId: service.id,
              serviceName: service.name,
              radiusKm: _globalRadiusKm,
            )).toList();

        await ref.read(workerApiProvider).saveServiceAreas(areas);
      });

  // ────────────────────────────────────────── Step 4: Documents ──

  Future<void> _scanDocument(String type) async {
    final result = await DocumentScannerScreen.show(
      context,
      documentType: type,
      enableOcr: true,
      uploadOnSave: false,
    );

    if (result != null && mounted) {
      setState(() {
        if (type == 'aadhar') {
          _aadharFile = result.image;
          _aadharText = result.text;
          _aadharNumber = result.idNumber;
        } else {
          _panFile = result.image;
          _panText = result.text;
          _panNumber = result.idNumber;
        }
      });
    }
  }

  Future<void> _saveDocuments() => _commit(() async {
        if (_aadharFile == null && _panFile == null) {
          throw 'Please upload at least your Aadhaar or PAN card.';
        }

        if (_aadharFile != null) {
          await ref.read(workerApiProvider).uploadDocument(
                type: 'aadhar',
                file: _aadharFile!,
                extractedText: _aadharText,
              );
        }

        if (_panFile != null) {
          await ref.read(workerApiProvider).uploadDocument(
                type: 'pan',
                file: _panFile!,
                extractedText: _panText,
              );
        }
      });

  // ────────────────────────────────────────── Step 5: Payout Account ──

  Future<void> _savePayout() => _commit(() async {
        final holder = _accountHolder.text.trim();
        final refStr = _payoutRef.text.trim();
        final ifsc = _ifscCode.text.trim().toUpperCase();

        if (holder.isEmpty) throw 'Please enter account holder name.';
        if (refStr.isEmpty) {
          throw _payoutProvider == 'upi' ? 'Please enter your UPI ID.' : 'Please enter your account number.';
        }
        if (_payoutProvider == 'bank' && ifsc.isEmpty) {
          throw 'Please enter IFSC code.';
        }

        await ref.read(workerApiProvider).savePayoutAccount(
              provider: _payoutProvider,
              accountHolder: holder,
              accountReference: refStr,
              ifscCode: _payoutProvider == 'bank' ? ifsc : null,
            );
      });

  // ────────────────────────────────────────── Step 6: Submit Verification ──

  Future<void> _submitVerification() => _commit(() async {
        await ref.read(workerApiProvider).submitForVerification(
              notes: _adminNotes.text.trim().isNotEmpty ? _adminNotes.text.trim() : null,
            );
        ref.invalidate(verificationStatusProvider);
        ref.invalidate(workerProfileProvider);
        if (mounted) context.go('/verification');
      });

  void _advance() {
    switch (_step) {
      case 0:
        _savePersonalDetails();
      case 1:
        _saveTrades();
      case 2:
        _saveRadius();
      case 3:
        _saveDocuments();
      case 4:
        _savePayout();
      default:
        _submitVerification();
    }
  }

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;
    final (title, subtitle) = _stepTitles[_step];

    return Scaffold(
      appBar: AppBar(
        title: Text('Step ${_step + 1} of ${_stepTitles.length}'),
        leading: _step == 0
            ? null
            : IconButton(
                onPressed: () => setState(() => _step -= 1),
                icon: AppIcon(AppIcons.chevronLeft, size: 24),
              ),
      ),
      body: Column(
        children: [
          // Step progress indicator bar
          Padding(
            padding: const EdgeInsets.symmetric(horizontal: Space.page, vertical: Space.x2),
            child: Row(
              children: [
                for (var i = 0; i < _stepTitles.length; i++)
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
                Text(
                  subtitle,
                  style: context.text.bodyMedium?.copyWith(color: tokens.textSecondary),
                ),
                const SizedBox(height: Space.x6),
                _body(),
                if (_failure != null) ...[
                  const SizedBox(height: Space.x4),
                  Container(
                    padding: const EdgeInsets.all(Space.x3),
                    decoration: BoxDecoration(color: tokens.dangerSoft, borderRadius: Radii.rMd),
                    child: Row(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        AppIcon(AppIcons.close, size: 20, color: tokens.danger),
                        const SizedBox(width: Space.x2),
                        Expanded(
                          child: Text(
                            _failure!,
                            style: context.text.bodyMedium?.copyWith(color: tokens.danger),
                          ),
                        ),
                      ],
                    ),
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
                    width: 22,
                    height: 22,
                    child: CircularProgressIndicator(strokeWidth: 2.5, color: AppColors.n0),
                  )
                : Text(_step == _stepTitles.length - 1 ? 'Send for checking' : 'Save and continue'),
          ),
        ),
      ),
    );
  }

  Widget _body() {
    switch (_step) {
      case 0:
        return _buildStep1Personal();
      case 1:
        return _buildStep2Trades();
      case 2:
        return _buildStep3Radius();
      case 3:
        return _buildStep4Documents();
      case 4:
        return _buildStep5Payout();
      default:
        return _buildStep6Review();
    }
  }

  // ────────────────────────────────────────────── Step 1 UI ──

  Widget _buildStep1Personal() {
    final tokens = context.tokens;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Center(
          child: Stack(
            children: [
              CircleAvatar(
                radius: 54,
                backgroundColor: tokens.primarySoft,
                backgroundImage: _photoFile != null ? FileImage(_photoFile!) : null,
                child: _photoFile == null
                    ? AppIcon(AppIcons.user, size: 48, color: tokens.primary)
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
                    onTap: _pickingPhoto ? null : () => _showPhotoSheet(context),
                    child: const Padding(
                      padding: EdgeInsets.all(8),
                      child: Icon(Icons.camera_alt, size: 20, color: AppColors.n0),
                    ),
                  ),
                ),
              ),
              if (_photoFile != null)
                Positioned(
                  left: 0,
                  bottom: 0,
                  child: Material(
                    color: tokens.danger,
                    shape: const CircleBorder(),
                    child: InkWell(
                      customBorder: const CircleBorder(),
                      onTap: () => setState(() => _photoFile = null),
                      child: const Padding(
                        padding: EdgeInsets.all(8),
                        child: Icon(Icons.close, size: 18, color: AppColors.n0),
                      ),
                    ),
                  ),
                ),
            ],
          ),
        ),
        const SizedBox(height: Space.x6),
        Text('Full Name', style: context.text.titleMedium),
        const SizedBox(height: Space.x2),
        TextField(
          controller: _name,
          textInputAction: TextInputAction.next,
          decoration: InputDecoration(
            labelText: 'Your full name',
            prefixIcon: AppIcon(AppIcons.user, size: 20, color: tokens.textSecondary),
          ),
        ),
        const SizedBox(height: Space.x4),
        Text('Phone Number', style: context.text.titleMedium),
        const SizedBox(height: Space.x2),
        TextField(
          controller: _phone,
          keyboardType: TextInputType.phone,
          textInputAction: TextInputAction.next,
          decoration: InputDecoration(
            labelText: '+91 XXXXX XXXXX',
            prefixIcon: AppIcon(AppIcons.call, size: 20, color: tokens.textSecondary),
          ),
        ),
        const SizedBox(height: Space.x4),
        Text('Years of Experience', style: context.text.titleMedium),
        const SizedBox(height: Space.x2),
        Container(
          padding: const EdgeInsets.symmetric(horizontal: Space.x4, vertical: Space.x1),
          decoration: BoxDecoration(
            border: Border.all(color: tokens.border),
            borderRadius: Radii.rMd,
          ),
          child: Row(
            children: [
              AppIcon(AppIcons.work, size: 20, color: tokens.textSecondary),
              const SizedBox(width: Space.x3),
              Expanded(
                child: Text(
                  '$_experienceYears year${_experienceYears == 1 ? '' : 's'} working in trades',
                  style: context.text.bodyLarge,
                ),
              ),
              IconButton(
                onPressed: _experienceYears > 0 ? () => setState(() => _experienceYears--) : null,
                icon: const Icon(Icons.remove_circle_outline),
              ),
              Text(
                '$_experienceYears',
                style: context.text.titleMedium?.copyWith(fontWeight: FontWeight.w700),
              ),
              IconButton(
                onPressed: _experienceYears < 40 ? () => setState(() => _experienceYears++) : null,
                icon: const Icon(Icons.add_circle_outline),
              ),
            ],
          ),
        ),
        const SizedBox(height: Space.x4),
        Text('Working Base / Location', style: context.text.titleMedium),
        const SizedBox(height: Space.x2),
        TextField(
          controller: _address,
          textInputAction: TextInputAction.done,
          decoration: InputDecoration(
            labelText: 'City or Area name',
            hintText: 'e.g. Hyderabad, Hitec City',
            prefixIcon: AppIcon(AppIcons.location, size: 20, color: tokens.textSecondary),
            suffixIcon: IconButton(
              tooltip: 'Get GPS location',
              onPressed: _fetchCurrentLocation,
              icon: AppIcon(AppIcons.locationPin, size: 22, color: tokens.primary),
            ),
          ),
        ),
        const SizedBox(height: Space.x2),
        Row(
          children: [
            Icon(
              _latitude != null ? Icons.check_circle : Icons.info_outline,
              size: 16,
              color: _latitude != null ? tokens.success : tokens.textTertiary,
            ),
            const SizedBox(width: Space.x1),
            Text(
              _latitude != null
                  ? 'GPS location active (Federation auto-assigned)'
                  : 'Tap location icon to detect your cooperative zone.',
              style: context.text.bodySmall?.copyWith(
                color: _latitude != null ? tokens.success : tokens.textSecondary,
              ),
            ),
          ],
        ),
      ],
    );
  }

  void _showPhotoSheet(BuildContext context) {
    showModalBottomSheet(
      context: context,
      builder: (_) => SafeArea(
        child: Column(
          mainAxisSize: MainAxisSize.min,
          children: [
            ListTile(
              leading: AppIcon(AppIcons.camera, size: 24),
              title: const Text('Take a photo with camera'),
              onTap: () {
                Navigator.pop(context);
                _pickPhoto(ImageSource.camera);
              },
            ),
            ListTile(
              leading: AppIcon(AppIcons.photo, size: 24),
              title: const Text('Choose from gallery'),
              onTap: () {
                Navigator.pop(context);
                _pickPhoto(ImageSource.gallery);
              },
            ),
          ],
        ),
      ),
    );
  }

  // ────────────────────────────────────────────── Step 2 UI ──

  Widget _buildStep2Trades() {
    final tokens = context.tokens;
    final allServicesAsync = ref.watch(_allServicesProvider);

    return allServicesAsync.when(
      loading: () => const Center(
        child: Padding(
          padding: EdgeInsets.all(Space.x8),
          child: CircularProgressIndicator(),
        ),
      ),
      error: (e, _) => Container(
        padding: const EdgeInsets.all(Space.x4),
        decoration: BoxDecoration(color: tokens.dangerSoft, borderRadius: Radii.rMd),
        child: Text('Could not load services list: $e'),
      ),
      data: (services) {
        if (services.isEmpty) {
          return const Center(child: Text('No trades available on platform.'));
        }

        // Group services by category
        final grouped = <String, List<Service>>{};
        for (final s in services) {
          grouped.putIfAbsent(s.category, () => []).add(s);
        }

        return Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Container(
              padding: const EdgeInsets.all(Space.x3),
              decoration: BoxDecoration(color: tokens.surfaceBlue, borderRadius: Radii.rMd),
              child: Row(
                children: [
                  AppIcon(AppIcons.info, size: 20, color: tokens.primary),
                  const SizedBox(width: Space.x2),
                  Expanded(
                    child: Text(
                      'Select every trade you are qualified for. You will only receive job offers for your chosen trades.',
                      style: context.text.bodySmall?.copyWith(color: tokens.textSecondary),
                    ),
                  ),
                ],
              ),
            ),
            const SizedBox(height: Space.x4),
            Row(
              mainAxisAlignment: MainAxisAlignment.spaceBetween,
              children: [
                Text(
                  '${_selectedServiceIds.length} trade${_selectedServiceIds.length == 1 ? '' : 's'} selected',
                  style: context.text.titleMedium?.copyWith(fontWeight: FontWeight.w700),
                ),
                TextButton(
                  onPressed: () {
                    setState(() {
                      if (_selectedServiceIds.length == services.length) {
                        _selectedServiceIds.clear();
                      } else {
                        _selectedServiceIds.addAll(services.map((s) => s.id));
                      }
                    });
                  },
                  child: Text(_selectedServiceIds.length == services.length ? 'Clear all' : 'Select all'),
                ),
              ],
            ),
            const SizedBox(height: Space.x2),
            for (final entry in grouped.entries) ...[
              Padding(
                padding: const EdgeInsets.only(top: Space.x3, bottom: Space.x1),
                child: Text(
                  entry.key.toUpperCase(),
                  style: context.text.labelMedium?.copyWith(
                    color: tokens.primary,
                    fontWeight: FontWeight.w700,
                    letterSpacing: 1.1,
                  ),
                ),
              ),
              for (final service in entry.value)
                CheckboxListTile(
                  contentPadding: EdgeInsets.zero,
                  value: _selectedServiceIds.contains(service.id),
                  title: Text(service.name, style: context.text.bodyLarge),
                  subtitle: Text(
                    '₹${service.basePrice.round()} base rate',
                    style: context.text.bodySmall?.copyWith(color: tokens.textSecondary),
                  ),
                  onChanged: (selected) {
                    setState(() {
                      if (selected == true) {
                        _selectedServiceIds.add(service.id);
                      } else {
                        _selectedServiceIds.remove(service.id);
                      }
                    });
                  },
                ),
              const Divider(),
            ],
          ],
        );
      },
    );
  }

  // ────────────────────────────────────────────── Step 3 UI ──

  Widget _buildStep3Radius() {
    final tokens = context.tokens;
    const radiusPresets = [5.0, 10.0, 15.0, 25.0, 50.0];

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Center(
          child: Column(
            children: [
              Text(
                '${_globalRadiusKm.round()} km',
                style: context.text.displayMedium?.copyWith(
                  fontWeight: FontWeight.w700,
                  color: tokens.primary,
                ),
              ),
              Text(
                'Maximum travel radius from your base',
                style: context.text.bodyMedium?.copyWith(color: tokens.textSecondary),
              ),
            ],
          ),
        ),
        const SizedBox(height: Space.x6),
        Slider(
          value: _globalRadiusKm,
          min: 3.0,
          max: 50.0,
          divisions: 47,
          label: '${_globalRadiusKm.round()} km',
          onChanged: (val) => setState(() => _globalRadiusKm = val),
        ),
        const SizedBox(height: Space.x4),
        Text('Quick presets', style: context.text.labelLarge),
        const SizedBox(height: Space.x2),
        Wrap(
          spacing: Space.x2,
          runSpacing: Space.x2,
          children: [
            for (final p in radiusPresets)
              ChoiceChip(
                label: Text('${p.round()} km'),
                selected: _globalRadiusKm == p,
                onSelected: (selected) {
                  if (selected) setState(() => _globalRadiusKm = p);
                },
              ),
          ],
        ),
        const SizedBox(height: Space.x6),
        Container(
          padding: const EdgeInsets.all(Space.x4),
          decoration: BoxDecoration(color: tokens.surfaceBlue, borderRadius: Radii.rMd),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  AppIcon(AppIcons.location, size: 20, color: tokens.primary),
                  const SizedBox(width: Space.x2),
                  Text('How this affects jobs', style: context.text.titleSmall),
                ],
              ),
              const SizedBox(height: Space.x2),
              Text(
                '• 10–15 km is ideal for quick 15-minute response times in cities.\n'
                '• Larger radii give you more total offers, but travel times are longer.\n'
                '• You can customize this per trade in Settings anytime.',
                style: context.text.bodySmall?.copyWith(color: tokens.textSecondary, height: 1.4),
              ),
            ],
          ),
        ),
      ],
    );
  }

  // ────────────────────────────────────────────── Step 4 UI ──

  Widget _buildStep4Documents() {
    final tokens = context.tokens;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          padding: const EdgeInsets.all(Space.x3),
          decoration: BoxDecoration(color: tokens.surfaceBlue, borderRadius: Radii.rMd),
          child: Row(
            children: [
              AppIcon(AppIcons.document, size: 20, color: tokens.primary),
              const SizedBox(width: Space.x2),
              Expanded(
                child: Text(
                  'Powered by on-device AI scanner with auto-cropping and OCR recognition for instant verification.',
                  style: context.text.bodySmall?.copyWith(color: tokens.textSecondary),
                ),
              ),
            ],
          ),
        ),
        const SizedBox(height: Space.x5),
        _buildDocumentTile(
          title: 'Aadhaar Card',
          subtitle: 'Front side of government Aadhaar card',
          file: _aadharFile,
          detectedId: _aadharNumber,
          onScan: () => _scanDocument('aadhar'),
          onRemove: () => setState(() {
            _aadharFile = null;
            _aadharText = null;
            _aadharNumber = null;
          }),
        ),
        const SizedBox(height: Space.x4),
        _buildDocumentTile(
          title: 'PAN Card',
          subtitle: 'Permanent Account Number card',
          file: _panFile,
          detectedId: _panNumber,
          onScan: () => _scanDocument('pan'),
          onRemove: () => setState(() {
            _panFile = null;
            _panText = null;
            _panNumber = null;
          }),
        ),
      ],
    );
  }

  Widget _buildDocumentTile({
    required String title,
    required String subtitle,
    required File? file,
    required String? detectedId,
    required VoidCallback onScan,
    required VoidCallback onRemove,
  }) {
    final tokens = context.tokens;
    return Container(
      padding: const EdgeInsets.all(Space.x4),
      decoration: BoxDecoration(
        border: Border.all(color: file != null ? tokens.primary : tokens.border),
        borderRadius: Radii.rMd,
        color: file != null ? tokens.surfaceBlue.withValues(alpha: 0.3) : tokens.surfaceAlt,
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Container(
                padding: const EdgeInsets.all(Space.x2),
                decoration: BoxDecoration(
                  color: file != null ? tokens.success : tokens.primarySoft,
                  shape: BoxShape.circle,
                ),
                child: Icon(
                  file != null ? Icons.check : Icons.camera_alt,
                  size: 20,
                  color: file != null ? AppColors.n0 : tokens.primary,
                ),
              ),
              const SizedBox(width: Space.x3),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(title, style: context.text.titleMedium),
                    Text(subtitle, style: context.text.bodySmall?.copyWith(color: tokens.textSecondary)),
                  ],
                ),
              ),
              if (file != null)
                IconButton(
                  onPressed: onRemove,
                  icon: AppIcon(AppIcons.close, size: 20, color: tokens.danger),
                ),
            ],
          ),
          if (file != null) ...[
            const SizedBox(height: Space.x3),
            Row(
              children: [
                ClipRRect(
                  borderRadius: Radii.rSm,
                  child: Image.file(file, width: 64, height: 64, fit: BoxFit.cover),
                ),
                const SizedBox(width: Space.x3),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          AppIcon(AppIcons.verified, size: 16, color: tokens.success),
                          const SizedBox(width: Space.x1),
                          Text(
                            'Scanned & Ready',
                            style: context.text.labelMedium?.copyWith(color: tokens.success),
                          ),
                        ],
                      ),
                      if (detectedId != null) ...[
                        const SizedBox(height: Space.x1),
                        Text(
                          'ID: $detectedId',
                          style: context.text.bodyMedium?.copyWith(
                            fontWeight: FontWeight.w700,
                            letterSpacing: 1.0,
                          ),
                        ),
                      ],
                    ],
                  ),
                ),
                OutlinedButton(
                  onPressed: onScan,
                  child: const Text('Re-scan'),
                ),
              ],
            ),
          ] else ...[
            const SizedBox(height: Space.x3),
            SizedBox(
              width: double.infinity,
              child: FilledButton.tonalIcon(
                onPressed: onScan,
                icon: const Icon(Icons.document_scanner, size: 18),
                label: Text('Scan $title with AI'),
              ),
            ),
          ],
        ],
      ),
    );
  }

  // ────────────────────────────────────────────── Step 5 UI ──

  Widget _buildStep5Payout() {
    final tokens = context.tokens;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          'Where would you like to receive your weekly earnings?',
          style: context.text.bodyMedium,
        ),
        const SizedBox(height: Space.x4),
        SegmentedButton<String>(
          segments: const [
            ButtonSegment(value: 'upi', label: Text('UPI ID (Instant)')),
            ButtonSegment(value: 'bank', label: Text('Bank Account')),
          ],
          selected: {_payoutProvider},
          onSelectionChanged: (s) => setState(() => _payoutProvider = s.first),
        ),
        const SizedBox(height: Space.x6),
        TextField(
          controller: _accountHolder,
          textInputAction: TextInputAction.next,
          decoration: InputDecoration(
            labelText: 'Account holder full name',
            hintText: 'As registered in bank',
            prefixIcon: AppIcon(AppIcons.user, size: 20, color: tokens.textSecondary),
          ),
        ),
        const SizedBox(height: Space.x4),
        if (_payoutProvider == 'upi')
          TextField(
            controller: _payoutRef,
            textInputAction: TextInputAction.done,
            decoration: InputDecoration(
              labelText: 'Your UPI ID',
              hintText: 'e.g. 9876543210@paytm or name@okaxis',
              prefixIcon: AppIcon(AppIcons.call, size: 20, color: tokens.textSecondary),
            ),
          )
        else ...[
          TextField(
            controller: _payoutRef,
            keyboardType: TextInputType.number,
            textInputAction: TextInputAction.next,
            decoration: InputDecoration(
              labelText: 'Bank Account Number',
              prefixIcon: AppIcon(AppIcons.card, size: 20, color: tokens.textSecondary),
            ),
          ),
          const SizedBox(height: Space.x4),
          TextField(
            controller: _ifscCode,
            textCapitalization: TextCapitalization.characters,
            textInputAction: TextInputAction.done,
            decoration: InputDecoration(
              labelText: 'IFSC Code',
              hintText: 'e.g. SBIN0001234',
              prefixIcon: AppIcon(AppIcons.card, size: 20, color: tokens.textSecondary),
            ),
          ),
        ],
        const SizedBox(height: Space.x4),
        Container(
          padding: const EdgeInsets.all(Space.x3),
          decoration: BoxDecoration(color: tokens.warningSoft, borderRadius: Radii.rMd),
          child: Row(
            children: [
              AppIcon(AppIcons.info, size: 20, color: tokens.warning),
              const SizedBox(width: Space.x2),
              Expanded(
                child: Text(
                  'The bank or UPI account must be in your own name to ensure compliant payout settlements.',
                  style: context.text.bodySmall?.copyWith(color: tokens.textSecondary),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  // ────────────────────────────────────────────── Step 6 UI ──

  Widget _buildStep6Review() {
    final tokens = context.tokens;
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Container(
          padding: const EdgeInsets.all(Space.x4),
          decoration: BoxDecoration(
            color: tokens.surfaceBlue,
            borderRadius: Radii.rLg,
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  AppIcon(AppIcons.verified, size: 24, color: tokens.primary),
                  const SizedBox(width: Space.x2),
                  Text('Onboarding Checklist', style: context.text.titleLarge),
                ],
              ),
              const SizedBox(height: Space.x2),
              Text(
                'Everything looks ready! A cooperative administrator will review your submission, usually within 24 hours.',
                style: context.text.bodyMedium?.copyWith(color: tokens.textSecondary),
              ),
            ],
          ),
        ),
        const SizedBox(height: Space.x5),
        _buildReviewRow('Personal Details', '${_name.text.trim()} (${_phone.text.trim()})', Icons.person),
        _buildReviewRow('Experience', '$_experienceYears years in trade', Icons.badge),
        _buildReviewRow('Selected Trades', '${_selectedServiceIds.length} trade(s) chosen', Icons.handyman),
        _buildReviewRow('Travel Radius', '${_globalRadiusKm.round()} km radius', Icons.near_me),
        _buildReviewRow(
          'Documents',
          '${_aadharFile != null ? 'Aadhaar ✓ ' : ''}${_panFile != null ? 'PAN ✓' : ''}',
          Icons.description,
        ),
        _buildReviewRow(
          'Payout Method',
          _payoutProvider == 'upi' ? 'UPI (${_payoutRef.text.trim()})' : 'Bank Account (${_payoutRef.text.trim()})',
          Icons.account_balance,
        ),
        const SizedBox(height: Space.x5),
        Text('Note to Cooperative Reviewer (Optional)', style: context.text.titleSmall),
        const SizedBox(height: Space.x2),
        TextField(
          controller: _adminNotes,
          maxLines: 2,
          decoration: const InputDecoration(
            hintText: 'Any additional certifications, references or notes…',
          ),
        ),
        const SizedBox(height: Space.x6),
        Container(
          padding: const EdgeInsets.all(Space.x3),
          decoration: BoxDecoration(
            color: tokens.surfaceAlt,
            borderRadius: Radii.rMd,
            border: Border.all(color: tokens.border),
          ),
          child: Row(
            children: [
              const Icon(Icons.shield_outlined, size: 24),
              const SizedBox(width: Space.x3),
              Expanded(
                child: Text(
                  'Once submitted, your verification state will update automatically. You will receive a notification as soon as you are verified.',
                  style: context.text.bodySmall?.copyWith(color: tokens.textSecondary),
                ),
              ),
            ],
          ),
        ),
      ],
    );
  }

  Widget _buildReviewRow(String title, String value, IconData icon) {
    final tokens = context.tokens;
    return Padding(
      padding: const EdgeInsets.only(bottom: Space.x3),
      child: Row(
        children: [
          Icon(icon, size: 20, color: tokens.primary),
          const SizedBox(width: Space.x3),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(title, style: context.text.labelSmall?.copyWith(color: tokens.textSecondary)),
                Text(value, style: context.text.bodyMedium?.copyWith(fontWeight: FontWeight.w600)),
              ],
            ),
          ),
          const Icon(Icons.check_circle, size: 18, color: Colors.green),
        ],
      ),
    );
  }
}
