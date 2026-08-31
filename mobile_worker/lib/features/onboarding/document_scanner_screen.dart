import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gid_ui/gid_ui.dart';
import 'package:google_mlkit_document_scanner/google_mlkit_document_scanner.dart';
import 'package:google_mlkit_text_recognition/google_mlkit_text_recognition.dart';
import 'package:image_picker/image_picker.dart';

import '../../core/providers.dart';

/// Scan a document (Aadhaar, PAN, certificate) using Google ML Kit Document Scanner & OCR.
///
/// Features:
///  - Auto-edge detection, crop, perspective correction via ML Kit Document Scanner
///  - On-device Latin Text Recognition (OCR) to extract document text & numbers
///  - Aadhaar (12-digit) and PAN (10-char alphanumeric) pattern recognition
///  - Camera & Gallery fallback options
///  - Returns the scanned image file, raw OCR text, and extracted ID number
class DocumentScannerScreen extends ConsumerStatefulWidget {
  const DocumentScannerScreen({
    super.key,
    this.enableOcr = true,
    this.documentType = 'document',
    this.uploadOnSave = true,
  });

  final bool enableOcr;
  final String documentType;
  final bool uploadOnSave;

  static Future<({File? image, String? text, String? idNumber})?> show(
    BuildContext context, {
    bool enableOcr = true,
    String documentType = 'document',
    bool uploadOnSave = false,
  }) {
    return Navigator.of(context).push<({File? image, String? text, String? idNumber})>(
      MaterialPageRoute(
        builder: (_) => DocumentScannerScreen(
          enableOcr: enableOcr,
          documentType: documentType,
          uploadOnSave: uploadOnSave,
        ),
      ),
    );
  }

  @override
  ConsumerState<DocumentScannerScreen> createState() => _DocumentScannerScreenState();
}

class _DocumentScannerScreenState extends ConsumerState<DocumentScannerScreen> {
  final DocumentScanner _scanner = DocumentScanner(
    options: DocumentScannerOptions(
      documentFormat: DocumentFormat.jpeg,
      pageLimit: 1,
    ),
  );
  final TextRecognizer _recognizer = TextRecognizer(script: TextRecognitionScript.latin);
  final ImagePicker _picker = ImagePicker();

  bool _scanning = false;
  bool _saving = false;
  String? _extractedText;
  String? _detectedIdNumber;
  File? _scannedImage;

  @override
  void initState() {
    super.initState();
    // Auto-launch scanner on open for a fluid 1-tap experience
    WidgetsBinding.instance.addPostFrameCallback((_) {
      _scanWithMlKit();
    });
  }

  @override
  void dispose() {
    _scanner.close();
    _recognizer.close();
    super.dispose();
  }

  String? _extractId(String text) {
    if (widget.documentType.toLowerCase().contains('aadhar') ||
        widget.documentType.toLowerCase().contains('aadhaar')) {
      final aadharRegex = RegExp(r'\b[2-9]\d{3}\s?\d{4}\s?\d{4}\b');
      final match = aadharRegex.firstMatch(text);
      if (match != null) {
        final clean = match.group(0)!.replaceAll(RegExp(r'\s+'), '');
        if (clean.length == 12) {
          return '${clean.substring(0, 4)} ${clean.substring(4, 8)} ${clean.substring(8, 12)}';
        }
      }
    } else if (widget.documentType.toLowerCase().contains('pan')) {
      final panRegex = RegExp(r'\b[A-Z]{5}[0-9]{4}[A-Z]\b');
      final match = panRegex.firstMatch(text.toUpperCase());
      if (match != null) {
        return match.group(0);
      }
    }
    return null;
  }

  Future<void> _processImageFile(File imageFile) async {
    setState(() {
      _scannedImage = imageFile;
      _extractedText = null;
      _detectedIdNumber = null;
    });

    if (widget.enableOcr) {
      try {
        final inputImage = InputImage.fromFile(imageFile);
        final recognised = await _recognizer.processImage(inputImage);
        if (!mounted) return;
        final text = recognised.text;
        final idNum = _extractId(text);
        setState(() {
          _extractedText = text;
          _detectedIdNumber = idNum;
        });
      } catch (e) {
        debugPrint('[DocumentScanner] OCR Error: $e');
      }
    }
  }

  Future<void> _scanWithMlKit() async {
    if (_scanning) return;
    setState(() => _scanning = true);

    try {
      final result = await _scanner.scanDocument();
      if (!mounted) return;

      if (result.images.isNotEmpty) {
        final imageFile = File(result.images.first);
        await _processImageFile(imageFile);
      }
    } catch (error) {
      debugPrint('[DocumentScanner] ML Kit scanner error or fallback: $error');
      // If native scanner not available, user can tap camera or gallery below
    } finally {
      if (mounted) setState(() => _scanning = false);
    }
  }

  Future<void> _pickFromCamera() async {
    try {
      final picked = await _picker.pickImage(
        source: ImageSource.camera,
        imageQuality: 85,
        maxWidth: 1600,
        maxHeight: 1600,
      );
      if (picked != null && mounted) {
        await _processImageFile(File(picked.path));
      }
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Camera error: $error')),
        );
      }
    }
  }

  Future<void> _pickFromGallery() async {
    try {
      final picked = await _picker.pickImage(
        source: ImageSource.gallery,
        imageQuality: 85,
        maxWidth: 1600,
        maxHeight: 1600,
      );
      if (picked != null && mounted) {
        await _processImageFile(File(picked.path));
      }
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Gallery error: $error')),
        );
      }
    }
  }

  Future<void> _save() async {
    if (_scannedImage == null) return;

    if (!widget.uploadOnSave) {
      Navigator.pop(context, (
        image: _scannedImage,
        text: _extractedText,
        idNumber: _detectedIdNumber,
      ));
      return;
    }

    setState(() => _saving = true);
    try {
      await ref.read(workerApiProvider).uploadDocument(
            type: widget.documentType,
            file: _scannedImage!,
            extractedText: _extractedText,
          );

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Document uploaded successfully')),
        );
        Navigator.pop(context, (
          image: _scannedImage,
          text: _extractedText,
          idNumber: _detectedIdNumber,
        ));
      }
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Upload failed: $error')),
        );
      }
    } finally {
      if (mounted) setState(() => _saving = false);
    }
  }

  String get _displayTitle => switch (widget.documentType.toLowerCase()) {
        'aadhar' || 'aadhaar' => 'Aadhaar Card',
        'pan' => 'PAN Card',
        'certificate' => 'Skill Certificate',
        _ => widget.documentType,
      };

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;

    return Scaffold(
      appBar: AppBar(
        title: Text('Scan $_displayTitle'),
        actions: [
          if (_scannedImage != null)
            Padding(
              padding: const EdgeInsets.only(right: Space.x2),
              child: TextButton.icon(
                onPressed: _saving ? null : _save,
                icon: _saving
                    ? const SizedBox(
                        width: 16,
                        height: 16,
                        child: CircularProgressIndicator(strokeWidth: 2),
                      )
                    : AppIcon(AppIcons.verified, size: 18),
                label: Text(_saving ? 'Saving…' : 'Use Document'),
              ),
            ),
        ],
      ),
      body: Column(
        children: [
          Expanded(
            child: _scannedImage == null
                ? Center(
                    child: Padding(
                      padding: const EdgeInsets.all(Space.page),
                      child: Column(
                        mainAxisSize: MainAxisSize.min,
                        children: [
                          Container(
                            padding: const EdgeInsets.all(Space.x6),
                            decoration: BoxDecoration(
                              color: tokens.surfaceBlue,
                              shape: BoxShape.circle,
                            ),
                            child: AppIcon(
                              AppIcons.document,
                              size: 56,
                              color: tokens.primary,
                            ),
                          ),
                          const SizedBox(height: Space.x5),
                          Text(
                            'Scan your $_displayTitle',
                            style: context.text.headlineSmall,
                            textAlign: TextAlign.center,
                          ),
                          const SizedBox(height: Space.x2),
                          Text(
                            'Place your card on a flat, well-lit surface.\nAI Document Scanner will auto-crop and read the card details.',
                            style: context.text.bodyMedium?.copyWith(
                              color: tokens.textSecondary,
                            ),
                            textAlign: TextAlign.center,
                          ),
                          const SizedBox(height: Space.x6),
                          FilledButton.icon(
                            onPressed: _scanning ? null : _scanWithMlKit,
                            icon: _scanning
                                ? const SizedBox(
                                    width: 18,
                                    height: 18,
                                    child: CircularProgressIndicator(
                                      strokeWidth: 2,
                                      color: AppColors.n0,
                                    ),
                                  )
                                : AppIcon(AppIcons.camera, size: 20),
                            label: const Text('Start AI Scan'),
                          ),
                          const SizedBox(height: Space.x3),
                          Row(
                            mainAxisAlignment: MainAxisAlignment.center,
                            children: [
                              OutlinedButton.icon(
                                onPressed: _pickFromCamera,
                                icon: AppIcon(AppIcons.camera, size: 18),
                                label: const Text('Camera'),
                              ),
                              const SizedBox(width: Space.x3),
                              OutlinedButton.icon(
                                onPressed: _pickFromGallery,
                                icon: AppIcon(AppIcons.photo, size: 18),
                                label: const Text('Gallery'),
                              ),
                            ],
                          ),
                        ],
                      ),
                    ),
                  )
                : SingleChildScrollView(
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.stretch,
                      children: [
                        Container(
                          margin: const EdgeInsets.all(Space.page),
                          height: 320,
                          decoration: BoxDecoration(
                            borderRadius: Radii.rLg,
                            border: Border.all(color: tokens.border),
                            color: tokens.surfaceAlt,
                          ),
                          clipBehavior: Clip.antiAlias,
                          child: Stack(
                            fit: StackFit.expand,
                            children: [
                              Image.file(_scannedImage!, fit: BoxFit.contain),
                              Positioned(
                                top: Space.x2,
                                right: Space.x2,
                                child: Container(
                                  padding: const EdgeInsets.symmetric(horizontal: Space.x3, vertical: Space.x1),
                                  decoration: BoxDecoration(
                                    color: tokens.surface.withValues(alpha: 0.9),
                                    borderRadius: Radii.rPill,
                                    border: Border.all(color: tokens.border),
                                  ),
                                  child: Row(
                                    mainAxisSize: MainAxisSize.min,
                                    children: [
                                      AppIcon(AppIcons.verified, size: 16, color: tokens.success),
                                      const SizedBox(width: Space.x1),
                                      Text('Scanned', style: context.text.labelSmall),
                                    ],
                                  ),
                                ),
                              ),
                            ],
                          ),
                        ),
                        if (_detectedIdNumber != null) ...[
                          Padding(
                            padding: const EdgeInsets.symmetric(horizontal: Space.page),
                            child: Container(
                              padding: const EdgeInsets.all(Space.x4),
                              decoration: BoxDecoration(
                                color: tokens.surfaceBlue,
                                borderRadius: Radii.rMd,
                                border: Border.all(color: tokens.primarySoft),
                              ),
                              child: Row(
                                children: [
                                  AppIcon(AppIcons.verified, size: 24, color: tokens.primary),
                                  const SizedBox(width: Space.x3),
                                  Expanded(
                                    child: Column(
                                      crossAxisAlignment: CrossAxisAlignment.start,
                                      children: [
                                        Text(
                                          'Detected $_displayTitle Number',
                                          style: context.text.labelSmall?.copyWith(color: tokens.textSecondary),
                                        ),
                                        Text(
                                          _detectedIdNumber!,
                                          style: context.text.titleLarge?.copyWith(
                                            fontWeight: FontWeight.w700,
                                            letterSpacing: 1.1,
                                          ),
                                        ),
                                      ],
                                    ),
                                  ),
                                ],
                              ),
                            ),
                          ),
                          const SizedBox(height: Space.x4),
                        ],
                        if (_extractedText != null && _extractedText!.isNotEmpty) ...[
                          Padding(
                            padding: const EdgeInsets.symmetric(horizontal: Space.page),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  'Extracted Text (OCR)',
                                  style: context.text.titleSmall?.copyWith(color: tokens.textSecondary),
                                ),
                                const SizedBox(height: Space.x1),
                                Container(
                                  width: double.infinity,
                                  padding: const EdgeInsets.all(Space.x3),
                                  decoration: BoxDecoration(
                                    color: tokens.surfaceAlt,
                                    borderRadius: Radii.rMd,
                                    border: Border.all(color: tokens.border),
                                  ),
                                  child: Text(
                                    _extractedText!,
                                    style: context.text.bodySmall,
                                    maxLines: 6,
                                    overflow: TextOverflow.ellipsis,
                                  ),
                                ),
                              ],
                            ),
                          ),
                          const SizedBox(height: Space.x4),
                        ],
                      ],
                    ),
                  ),
          ),
          if (_scannedImage != null)
            SafeArea(
              minimum: const EdgeInsets.all(Space.page),
              child: Row(
                children: [
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: _scanning || _saving ? null : _scanWithMlKit,
                      icon: AppIcon(AppIcons.camera, size: 18),
                      label: const Text('Re-scan'),
                    ),
                  ),
                  const SizedBox(width: Space.x3),
                  Expanded(
                    flex: 2,
                    child: FilledButton.icon(
                      onPressed: _saving ? null : _save,
                      icon: _saving
                          ? const SizedBox(
                              width: 18,
                              height: 18,
                              child: CircularProgressIndicator(strokeWidth: 2, color: AppColors.n0),
                            )
                          : AppIcon(AppIcons.verified, size: 18),
                      label: Text(_saving ? 'Saving…' : 'Use Document'),
                    ),
                  ),
                ],
              ),
            ),
        ],
      ),
    );
  }
}