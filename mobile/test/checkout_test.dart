import 'package:clock/clock.dart';
import 'package:flutter_riverpod/flutter_riverpod.dart';
import 'package:flutter_test/flutter_test.dart';
import 'package:getitdone_customer/core/cart/checkout.dart';
import 'package:gid_core/gid_core.dart';

SavedAddress address(String id, {bool isDefault = false}) => SavedAddress(
      id: id,
      name: 'Home',
      address: 'Flat 402, Sai Enclave',
      latitude: 16.5,
      longitude: 80.6,
      isDefault: isDefault,
    );

void main() {
  late ProviderContainer container;
  CheckoutController checkout() => container.read(checkoutProvider.notifier);
  CheckoutState state() => container.read(checkoutProvider);

  setUp(() => container = ProviderContainer());
  tearDown(() => container.dispose());

  /// Every mode needs somebody to meet the worker, so every completeness test
  /// below has to satisfy that first.
  void withContact() {
    checkout().setContactName('Vijaya');
    checkout().setContactPhone('9876543210');
  }

  group('what each mode requires', () {
    test('instant needs an address and a contact', () {
      checkout().setMode(CheckoutMode.instant);
      expect(state().isComplete, isFalse);

      checkout().setAddress('a1');
      // Still incomplete: an address with nobody to call is a locked gate.
      expect(state().isComplete, isFalse);

      withContact();
      expect(state().isComplete, isTrue);
      expect(state().needsSlot, isFalse);
    });

    test('scheduled needs a slot as well', () {
      checkout().setMode(CheckoutMode.scheduled);
      checkout().setAddress('a1');
      withContact();
      expect(state().isComplete, isFalse);

      checkout().setSlot(DateTime(2030, 1, 1, 10));
      expect(state().isComplete, isTrue);
    });

    test('recurring needs days on top of that', () {
      checkout().setMode(CheckoutMode.recurring);
      checkout().setAddress('a1');
      withContact();
      checkout().setSlot(DateTime(2030, 1, 1, 10));
      expect(state().isComplete, isFalse);

      checkout().toggleDay(DateTime.monday);
      expect(state().isComplete, isTrue);
    });
  });

  group('who is meeting the worker', () {
    test('a name alone is not enough, nor a number alone', () {
      checkout().setMode(CheckoutMode.instant);
      checkout().setAddress('a1');

      checkout().setContactName('Vijaya');
      expect(state().isComplete, isFalse);

      checkout().setContactName('');
      checkout().setContactPhone('9876543210');
      expect(state().isComplete, isFalse);
    });

    test('the number is checked the same way sign-up checks it', () {
      checkout().setContactName('Vijaya');

      // Too short, too long, and a leading digit no Indian mobile starts with.
      for (final bad in ['98765', '98765432100', '1234567890', '0987654321']) {
        checkout().setContactPhone(bad);
        expect(state().hasContact, isFalse, reason: bad);
      }

      checkout().setContactPhone('9876543210');
      expect(state().hasContact, isTrue);
    });

    test('formatting is accepted and normalised for the wire', () {
      // People type spaces. The server stores digits, and the two must not
      // disagree about whether "98765 43210" is the same number.
      checkout().setContactName('Vijaya');
      checkout().setContactPhone('98765 43210');

      expect(state().hasContact, isTrue);
      expect(state().contactDigits, '9876543210');
    });

    test('a name of one letter is not a name', () {
      checkout().setContactName('V');
      checkout().setContactPhone('9876543210');
      expect(state().hasContact, isFalse);
    });

    test('prefilling never overwrites what the customer typed', () {
      // The cart prefills from the account on open. Someone booking for their
      // parents changes both fields, and a later prefill must not quietly put
      // the account holder back.
      checkout().setContactName('Lakshmi');
      checkout().setContactPhone('9000000001');
      checkout().prefillContact(name: 'Vijaya', phone: '9876543210');

      expect(state().contactName, 'Lakshmi');
      expect(state().contactPhone, '9000000001');
    });

    test('prefilling fills what is empty', () {
      checkout().prefillContact(name: 'Vijaya', phone: '9876543210');

      expect(state().contactName, 'Vijaya');
      expect(state().contactPhone, '9876543210');
      expect(state().hasContact, isTrue);
    });

    test('an account with no phone leaves the field empty, not "null"', () {
      // A Google sign-up has no phone number. The field has to stay blank so
      // the customer fills it in, rather than showing a placeholder that looks
      // like an answer.
      checkout().prefillContact(name: 'Vijaya', phone: null);

      expect(state().contactName, 'Vijaya');
      expect(state().contactPhone, isEmpty);
      expect(state().hasContact, isFalse);
    });
  });

  group('mode changes', () {
    test('switching to instant drops the slot', () {
      // Not merely hidden. A time chosen for a scheduled order, kept alive
      // behind an instant one and silently reappearing later, is worse than
      // being asked again.
      checkout().setMode(CheckoutMode.scheduled);
      checkout().setSlot(DateTime(2030, 1, 1, 10));
      checkout().setMode(CheckoutMode.instant);

      expect(state().scheduledAt, isNull);
    });

    test('switching between scheduled and recurring keeps it', () {
      checkout().setSlot(DateTime(2030, 1, 1, 10));
      checkout().setMode(CheckoutMode.recurring);

      expect(state().scheduledAt, DateTime(2030, 1, 1, 10));
    });
  });

  group('days', () {
    test('toggle adds and removes', () {
      checkout().toggleDay(DateTime.monday);
      checkout().toggleDay(DateTime.thursday);
      expect(state().days, {DateTime.monday, DateTime.thursday});

      checkout().toggleDay(DateTime.monday);
      expect(state().days, {DateTime.thursday});
    });
  });

  group('address defaulting', () {
    test('picks the default address when nothing is chosen', () {
      checkout().ensureAddress([address('a1'), address('a2', isDefault: true)]);
      expect(state().addressId, 'a2');
    });

    test('falls back to the only address when none is marked default', () {
      checkout().ensureAddress([address('a1')]);
      expect(state().addressId, 'a1');
    });

    test('never overwrites a choice the customer already made', () {
      checkout().setAddress('a1');
      checkout().ensureAddress([address('a2', isDefault: true)]);
      expect(state().addressId, 'a1');
    });

    test('does nothing with no saved addresses', () {
      checkout().ensureAddress(const []);
      expect(state().addressId, isNull);
    });
  });

  group('stale slots', () {
    test('a slot that has passed is dropped', () {
      // A cart can sit open for hours. Submitting "today at 09:00" at six in
      // the evening would be accepted by the server and scheduled into the
      // past, and nobody would come.
      withClock(Clock.fixed(DateTime(2026, 8, 26, 18)), () {
        checkout().setSlot(DateTime(2026, 8, 26, 9));
        checkout().dropStaleSlot();
        expect(state().scheduledAt, isNull);
        expect(state().isComplete, isFalse);
      });
    });

    test('a future slot survives', () {
      withClock(Clock.fixed(DateTime(2026, 8, 26, 18)), () {
        checkout().setSlot(DateTime(2026, 8, 27, 9));
        checkout().dropStaleSlot();
        expect(state().scheduledAt, DateTime(2026, 8, 27, 9));
      });
    });
  });

  group('reset', () {
    test('clears everything after an order is placed', () {
      checkout().setMode(CheckoutMode.recurring);
      checkout().setAddress('a1');
      checkout().setSlot(DateTime(2030, 1, 1, 10));
      checkout().toggleDay(DateTime.monday);

      checkout().reset();

      expect(state().addressId, isNull);
      expect(state().scheduledAt, isNull);
      expect(state().days, isEmpty);
      expect(state().mode, CheckoutMode.scheduled);
    });
  });

  group('wire format', () {
    test('matches what the orders endpoint accepts', () {
      // The server's zod enum is instant | scheduled | recurring. A rename here
      // would fail as a 400 at checkout, which is the worst place to find out.
      expect(CheckoutMode.instant.wire, 'instant');
      expect(CheckoutMode.scheduled.wire, 'scheduled');
      expect(CheckoutMode.recurring.wire, 'recurring');
    });
  });
}
