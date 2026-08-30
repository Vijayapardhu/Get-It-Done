import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gid_ui/gid_ui.dart';

import '../../core/models/worker_models.dart';
import '../../core/providers.dart';

class EditProfileScreen extends ConsumerStatefulWidget {
  const EditProfileScreen({super.key});

  @override
  ConsumerState<EditProfileScreen> createState() => _EditProfileScreenState();
}

class _EditProfileScreenState extends ConsumerState<EditProfileScreen> {
  final _formKey = GlobalKey<FormState>();
  late final TextEditingController _nameController;
  late final TextEditingController _phoneController;
  late final TextEditingController _experienceController;
  late final TextEditingController _addressController;
  bool _submitting = false;
  bool _loaded = false;

  @override
  void dispose() {
    _nameController.dispose();
    _phoneController.dispose();
    _experienceController.dispose();
    _addressController.dispose();
    super.dispose();
  }

  void _initControllers(WorkerProfile profile) {
    if (_loaded) return;
    _nameController = TextEditingController(text: profile.name);
    _phoneController = TextEditingController();
    _experienceController = TextEditingController(
      text: profile.experienceYears.toString(),
    );
    _addressController = TextEditingController();
    _loaded = true;
  }

  Future<void> _save() async {
    if (!_formKey.currentState!.validate()) return;

    setState(() => _submitting = true);

    try {
      final experience = int.tryParse(_experienceController.text.trim());

      await ref.read(workerApiProvider).updateProfile(
            experienceYears: experience,
            address: _addressController.text.trim().isEmpty
                ? null
                : _addressController.text.trim(),
          );

      ref.invalidate(workerProfileProvider);

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Profile updated.')),
        );
        Navigator.pop(context);
      }
    } catch (_) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Could not update profile.')),
        );
      }
    } finally {
      if (mounted) setState(() => _submitting = false);
    }
  }

  @override
  Widget build(BuildContext context) {
    final profileAsync = ref.watch(workerProfileProvider);

    return Scaffold(
      appBar: AppBar(title: const Text('Edit Profile')),
      body: profileAsync.when(
        loading: () => const Center(child: CircularProgressIndicator()),
        error: (e, _) => const Center(child: Text('Could not load profile.')),
        data: (profile) {
          if (profile == null) {
            return const Center(child: Text('No profile found.'));
          }

          _initControllers(profile);

          return SingleChildScrollView(
            padding: const EdgeInsets.fromLTRB(
              Space.page,
              Space.x4,
              Space.page,
              Space.x12,
            ),
            child: Form(
              key: _formKey,
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.stretch,
                children: [
                  AppTextField(
                    label: 'Name',
                    controller: _nameController,
                    enabled: false,
                    textCapitalization: TextCapitalization.words,
                  ),
                  const SizedBox(height: Space.x4),
                  AppTextField(
                    label: 'Phone',
                    controller: _phoneController,
                    enabled: false,
                    keyboardType: TextInputType.phone,
                  ),
                  const SizedBox(height: Space.x4),
                  AppTextField(
                    label: 'Years of experience',
                    controller: _experienceController,
                    keyboardType: TextInputType.number,
                    textInputAction: TextInputAction.next,
                  ),
                  const SizedBox(height: Space.x4),
                  AppTextField(
                    label: 'Address',
                    controller: _addressController,
                    maxLines: 3,
                    textCapitalization: TextCapitalization.sentences,
                    textInputAction: TextInputAction.done,
                  ),
                  const SizedBox(height: Space.x8),
                  AppButton.primary(
                    label: 'Save changes',
                    loading: _submitting,
                    onPressed: _save,
                  ),
                ],
              ),
            ),
          );
        },
      ),
    );
  }
}
