import 'dart:io';

import 'package:flutter/material.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:gid_ui/gid_ui.dart';
import 'package:google_mlkit_document_scanner/google_mlkit_document_scanner.dart';
import 'package:google_mlkit_text_recognition/google_mlkit_text_recognition.dart';

import '../../core/providers.dart';

/// Scan a document (ID, certificate) and optionally run OCR.
///
/// Returns the scanned image path and extracted text (if OCR enabled).
class DocumentScannerScreen extends ConsumerStatefulWidget {
  const DocumentScannerScreen({
    super.key,
    this.enableOcr = true,
    this.documentType = 'document',
  });

  final bool enableOcr;
  final String documentType;

  static Future<({File? image, String? text})?> show(
    BuildContext context, {
    bool enableOcr = true,
    String documentType = 'document',
  }) {
    return Navigator.of(context).push<({File? image, String? text})>(
      MaterialPageRoute(
        builder: (_) => DocumentScannerScreen(
          enableOcr: enableOcr,
          documentType: documentType,
        ),
      ),
    );
  }

  @override
  ConsumerState<DocumentScannerScreen> createState() =>
      _DocumentScannerScreenState();
}

class _DocumentScannerScreenState extends ConsumerState<DocumentScannerScreen> {
  final DocumentScanner _scanner = DocumentScanner(
    options: DocumentScannerOptions(
      documentFormat: DocumentFormat.jpeg,
      pageLimit: 1,
    ),
  );
  final TextRecognizer _recognizer = TextRecognizer(script: TextRecognitionScript.latin);
  bool _scanning = false;
  String? _extractedText;
  File? _scannedImage;

  @override
  void dispose() {
    _scanner.close();
    _recognizer.close();
    super.dispose();
  }

  Future<void> _scan() async {
    if (_scanning) return;
    setState(() => _scanning = true);

    try {
      final result = await _scanner.scanDocument();
      if (!mounted) return;

      if (result.images.isNotEmpty) {
        final imageFile = File(result.images.first);
        setState(() => _scannedImage = imageFile);

        if (widget.enableOcr) {
          final inputImage = InputImage.fromFile(imageFile);
          final recognised = await _recognizer.processImage(inputImage);
          if (mounted) {
            setState(() => _extractedText = recognised.text);
          }
        }
      }
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Scan failed: $error')),
        );
      }
    } finally {
      if (mounted) setState(() => _scanning = false);
    }
  }

  Future<void> _save() async {
    if (_scannedImage == null) return;

    try {
      await ref
          .read(workerApiProvider)
          .uploadDocument(
            type: widget.documentType,
            file: _scannedImage!,
            extractedText: _extractedText,
          );

      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          const SnackBar(content: Text('Document uploaded')),
        );
        Navigator.pop(context, (image: _scannedImage, text: _extractedText));
      }
    } catch (error) {
      if (mounted) {
        ScaffoldMessenger.of(context).showSnackBar(
          SnackBar(content: Text('Upload failed: $error')),
        );
      }
    }
  }

  @override
  Widget build(BuildContext context) {
    final tokens = context.tokens;

    return Scaffold(
      appBar: AppBar(
        title: Text('Scan ${widget.documentType}'),
        actions: [
          if (_scannedImage != null)
            TextButton(
              onPressed: _save,
              child: const Text('Save'),
            ),
        ],
      ),
      body: Column(
        children: [
          Expanded(
            child: _scannedImage == null
                ? Center(
                    child: Column(
                      mainAxisSize: MainAxisSize.min,
                      children: [
                        AppIcon(
                          AppIcons.document,
                          size: 64,
                          color: tokens.textTertiary,
                        ),
                        const SizedBox(height: Space.x3),
                        Text(
                          'Scan your ${widget.documentType}',
                          style: context.text.titleMedium,
                        ),
                        const SizedBox(height: Space.x1),
                        Text(
                          'Place it on a flat surface with good lighting',
                          style: context.text.bodySmall?.copyWith(
                            color: tokens.textSecondary,
                          ),
                          textAlign: TextAlign.center,
                        ),
                      ],
                    ),
                  )
                : Stack(
                    fit: StackFit.expand,
                    children: [
                      Image.file(_scannedImage!, fit: BoxFit.contain),
                      if (_extractedText != null && _extractedText!.isNotEmpty)
                        Positioned(
                          bottom: 0,
                          left: 0,
                          right: 0,
                          child: Container(
                            padding: const EdgeInsets.all(Space.x4),
                            color: tokens.surface.withValues(alpha: 0.9),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              mainAxisSize: MainAxisSize.min,
                              children: [
                                Text(
                                  'Extracted text',
                                  style: context.text.labelSmall?.copyWith(
                                    color: tokens.textTertiary,
                                  ),
                                ),
                                const SizedBox(height: Space.x1),
                                Text(
                                  _extractedText!,
                                  style: context.text.bodySmall,
                                  maxLines: 4,
                                  overflow: TextOverflow.ellipsis,
                                ),
                              ],
                            ),
                          ),
                        ),
                    ],
                  ),
          ),
          SafeArea(
            minimum: const EdgeInsets.all(Space.x4),
            child: SizedBox(
              width: double.infinity,
              height: WorkerSizes.button,
              child: FilledButton.icon(
                onPressed: _scanning ? null : _scan,
                icon: _scanning
                    ? const SizedBox(
                        width: 20,
                        height: 20,
                        child: CircularProgressIndicator(
                          strokeWidth: 2,
                          color: AppColors.n0,
                        ),
                      )
                    : AppIcon(AppIcons.camera, size: 20),
                label: Text(_scanning
                    ? 'Scanning…'
                    : _scannedImage == null
                        ? 'Scan document'
                        : 'Re-scan'),
              ),
            ),
          ),
        ],
      ),
    );
  }
}