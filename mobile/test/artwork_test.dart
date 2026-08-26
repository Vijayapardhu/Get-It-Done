import 'package:flutter/material.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:getitdone_customer/core/models/models.dart';
import 'package:getitdone_customer/design/design_system.dart';

/// Artwork is served by the backend and can be absent, stale, or unreachable.
/// These pin the behaviour that makes that safe to rely on everywhere.
void main() {
  group('resolveArtworkUrl', () {
    const base = 'http://10.0.2.2:4000';

    test('puts the API host back on a relative media path', () {
      expect(
        resolveArtworkUrl('/media/artwork/abc.png', base),
        'http://10.0.2.2:4000/media/artwork/abc.png',
      );
    });

    test('leaves an absolute URL alone', () {
      // A cooperative hosting its own artwork, or a CDN in front of us.
      const cdn = 'https://cdn.example.in/plumbing.png';
      expect(resolveArtworkUrl(cdn, base), cdn);
      expect(resolveArtworkUrl('http://legacy.example/x.png', base),
          'http://legacy.example/x.png');
    });

    test('does not double the slash when the base carries one', () {
      expect(
        resolveArtworkUrl('/media/artwork/abc.png', 'https://api.getitdone.in/'),
        'https://api.getitdone.in/media/artwork/abc.png',
      );
    });

    test('tolerates a path with no leading slash', () {
      expect(
        resolveArtworkUrl('media/artwork/abc.png', base),
        'http://10.0.2.2:4000/media/artwork/abc.png',
      );
    });

    test('returns null for nothing', () {
      expect(resolveArtworkUrl(null, base), isNull);
      expect(resolveArtworkUrl('', base), isNull);
    });
  });

  group('parseHexColor', () {
    test('parses a six-digit hex with a hash', () {
      expect(parseHexColor('#3B63F5'), const Color(0xFF3B63F5));
    });

    test('parses without the hash, and with alpha', () {
      expect(parseHexColor('3B63F5'), const Color(0xFF3B63F5));
      expect(parseHexColor('#803B63F5'), const Color(0x803B63F5));
    });

    test('returns null rather than throwing on bad data', () {
      // An accent colour is decoration. Malformed reference data must never
      // take a screen down.
      for (final bad in [null, '', 'blue', '#12', '#GGGGGG', '#1234567']) {
        expect(parseHexColor(bad), isNull, reason: 'should reject "$bad"');
      }
    });
  });

  group('ServiceVisuals.forNames', () {
    test('prefers the service name over its category', () {
      // The regression this exists for: Plumbing and Electrical both sit under
      // "Home Repair", and resolving by category alone gave both the neutral
      // tool glyph, so a rail of services was three identical tiles.
      expect(
        ServiceVisuals.forNames(['Plumbing', 'Home Repair']).icon,
        ServiceVisuals.plumbing.icon,
      );
      expect(
        ServiceVisuals.forNames(['Electrical', 'Home Repair']).icon,
        ServiceVisuals.electrical.icon,
      );
    });

    test('falls back to the category when the name is unknown', () {
      expect(
        ServiceVisuals.forNames(['Ravi Special Combo', 'Deep Cleaning']).icon,
        ServiceVisuals.cleaning.icon,
      );
    });

    test('lands on the neutral visual when nothing matches', () {
      expect(ServiceVisuals.forNames(['Zzz', null, '']).icon, ServiceVisuals.other.icon);
      expect(ServiceVisuals.forNames(const []).icon, ServiceVisuals.other.icon);
    });

    test('matchOrNull reports a miss rather than guessing', () {
      expect(ServiceVisuals.matchOrNull('Home Repair'), isNull);
      expect(ServiceVisuals.matchOrNull('Plumbing'), isNotNull);
    });
  });

  group('Service artwork resolution', () {
    Service service(Map<String, dynamic> json) => Service.fromJson({
          'id': 's1',
          'name': 'Plumbing',
          'category': 'Home Repair',
          'basePrice': 299,
          ...json,
        });

    test('prefers the service’s own artwork over the category’s', () {
      final s = service({
        'imageUrl': '/media/artwork/service.png',
        'categoryImageUrl': '/media/artwork/category.png',
      });
      expect(s.artworkImage, '/media/artwork/service.png');
    });

    test('falls back to the category artwork', () {
      final s = service({'categoryImageUrl': '/media/artwork/category.png'});
      expect(s.artworkImage, '/media/artwork/category.png');
    });

    test('is null when neither exists, so the glyph is used', () {
      expect(service({}).artworkImage, isNull);
      expect(service({}).artworkAnimation, isNull);
    });

    test('resolves animation with the same precedence', () {
      final s = service({
        'animationUrl': '/media/artwork/a.json',
        'categoryAnimationUrl': '/media/artwork/b.json',
      });
      expect(s.artworkAnimation, '/media/artwork/a.json');
    });
  });

  group('AppArtwork', () {
    Future<void> pump(WidgetTester tester, Widget child) async {
      await tester.pumpWidget(MaterialApp(
        theme: AppTheme.light(null),
        home: Scaffold(body: Center(child: child)),
      ));
    }

    testWidgets('renders the glyph when there is no artwork', (tester) async {
      await pump(tester, const AppArtwork(fallbackIcon: AppIcons.bookings));
      expect(find.byType(AppIcon), findsOneWidget);
    });

    testWidgets('keeps a fixed box whatever the source', (tester) async {
      // A late-arriving image must not reflow a list under the user's thumb.
      await pump(tester, const AppArtwork(fallbackIcon: AppIcons.bookings, size: 44));
      final box = tester.getSize(find.byType(AppArtwork));
      expect(box, const Size(44, 44));

      await pump(tester, const AppArtwork(
        fallbackIcon: AppIcons.bookings,
        size: 44,
        imageUrl: 'https://example.invalid/missing.png',
      ));
      expect(tester.getSize(find.byType(AppArtwork)), const Size(44, 44));
    });

    testWidgets('shows the glyph, not a spinner, while an image loads',
        (tester) async {
      await pump(tester, const AppArtwork(
        fallbackIcon: AppIcons.bookings,
        imageUrl: 'https://example.invalid/slow.png',
      ));
      await tester.pump();

      // A 44px tile with a spinner in it reads as broken.
      expect(find.byType(CircularProgressIndicator), findsNothing);
      expect(find.byType(AppIcon), findsOneWidget);
    });
  });
}
