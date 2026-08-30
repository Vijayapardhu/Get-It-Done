import 'package:flutter_test/flutter_test.dart';
import 'package:gid_core/gid_core.dart';
import 'package:getitdone_customer/core/config/server_config.dart';

/// The URL a developer types by hand, made safe to concatenate paths onto.
///
/// Every path in GidApi starts with a slash, so a stored URL with a trailing
/// one produces `http://host:4000//services` — a 404 on a router that would
/// have answered `/services`. These are the shapes people actually type.
void main() {
  group('ServerStore.normalise', () {
    test('keeps a plain host and port', () {
      expect(
        ServerStore.normalise('http://192.168.1.5:4000'),
        'http://192.168.1.5:4000',
      );
    });

    test('strips a trailing slash', () {
      expect(
        ServerStore.normalise('http://192.168.1.5:4000/'),
        'http://192.168.1.5:4000',
      );
    });

    test('strips several trailing slashes', () {
      expect(ServerStore.normalise('https://api.getitdone.in///'), 'https://api.getitdone.in');
    });

    test('keeps a base path, without its trailing slash', () {
      // A backend mounted behind a reverse proxy at /api is a real deployment.
      expect(
        ServerStore.normalise('https://getitdone.in/api/'),
        'https://getitdone.in/api',
      );
    });

    test('trims whitespace from a pasted value', () {
      expect(
        ServerStore.normalise('  http://localhost:4000  '),
        'http://localhost:4000',
      );
    });

    test('omits the port when none was given', () {
      expect(ServerStore.normalise('https://api.getitdone.in'), 'https://api.getitdone.in');
    });

    test('rejects a value with no scheme', () {
      // "192.168.1.5:4000" parses as a URI whose scheme is "192.168.1.5",
      // which would otherwise sail through and fail much later.
      expect(ServerStore.normalise('192.168.1.5:4000'), isNull);
    });

    test('rejects a scheme we cannot speak', () {
      expect(ServerStore.normalise('ftp://example.com'), isNull);
      expect(ServerStore.normalise('ws://example.com'), isNull);
    });

    test('rejects a scheme with no host', () {
      expect(ServerStore.normalise('http://'), isNull);
    });

    test('rejects empty and whitespace', () {
      expect(ServerStore.normalise(''), isNull);
      expect(ServerStore.normalise('   '), isNull);
    });
  });

  group('the build default', () {
    test('is the deployed backend, not a loopback address', () {
      // A phone is not the machine serving the backend, so `localhost` -- the
      // old default -- resolved to the device itself and every request failed
      // before the app had shown anything. The default has to be a host the
      // handset can actually reach.
      final uri = Uri.parse(AppConfig.deployedApiBaseUrl);

      expect(uri.scheme, 'https', reason: 'cleartext is blocked by the network security config');
      expect(uri.host, isNot(anyOf('localhost', '127.0.0.1', '10.0.2.2')));
    });

    test('survives normalisation unchanged', () {
      // Whatever is compiled in is concatenated with paths that already start
      // with a slash, so it must already be in the shape normalise() produces.
      expect(
        ServerStore.normalise(AppConfig.deployedApiBaseUrl),
        AppConfig.deployedApiBaseUrl,
      );
    });

    test('is what apiBaseUrl resolves to with no --dart-define', () {
      expect(AppConfig.apiBaseUrl, AppConfig.deployedApiBaseUrl);
    });

    test('is the realtime host too', () {
      // Socket.IO is attached to the same HTTP server.
      expect(AppConfig.realtimeUrl, AppConfig.apiBaseUrl);
    });
  });
}
