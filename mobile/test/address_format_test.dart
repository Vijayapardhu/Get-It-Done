import 'package:flutter_test/flutter_test.dart';
import 'package:gid_core/gid_core.dart';

/// The header has room for about thirty characters. Google gives us seventy.
///
/// These are the real strings the app has shown: the first is what a demo
/// account had saved, the second is what reverse-geocoding a Vijayawada fix
/// actually returns.
void main() {
  group('shortenAddress', () {
    test('keeps the house and the neighbourhood', () {
      expect(
        shortenAddress('3-83, Valuthimmapuram, Surampalem, Andhra Pradesh 533437, India'),
        '3-83, Valuthimmapuram',
      );
    });

    test('drops the state, the postcode and the country', () {
      expect(
        shortenAddress(
          '29-5-35, 1st Line, Mogalrajapuram, Vijayawada, Andhra Pradesh 520010, India',
        ),
        '29-5-35, 1st Line',
      );
    });

    test('a postcode fused to the state does not survive as a stray number', () {
      expect(
        shortenAddress('Benz Circle, Vijayawada, Andhra Pradesh 520010, India', parts: 3),
        'Benz Circle, Vijayawada',
      );
    });

    test('an address shorter than the limit is returned whole', () {
      expect(shortenAddress('Flat 402, Sai Enclave'), 'Flat 402, Sai Enclave');
    });

    test('a single-part address is left alone', () {
      expect(shortenAddress('Gunadala'), 'Gunadala');
    });

    test('an address of nothing but noise falls back to the original', () {
      // Everything here is stripped, and showing an empty header would be
      // worse than showing the string we were given.
      expect(shortenAddress('Andhra Pradesh 520010, India'), 'Andhra Pradesh 520010, India');
    });

    test('extra separators do not become empty segments', () {
      expect(shortenAddress('3-83,, Valuthimmapuram,  , Surampalem'), '3-83, Valuthimmapuram');
    });
  });
}
