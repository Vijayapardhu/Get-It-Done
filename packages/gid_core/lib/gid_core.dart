/// GET IT DONE platform plumbing, shared by both apps.
///
/// One import:
/// ```dart
/// import 'package:gid_core/gid_core.dart';
/// ```
///
/// What is in here, and what deliberately is not:
///
///  * [ApiClient] — the HTTP layer, and the refresh queue. Access tokens are
///    short-lived and the backend rotates refresh tokens on use, so concurrent
///    401s are serialised onto one shared refresh future. This is the single
///    most important reason this package exists: a second implementation would
///    faithfully reproduce the bug the first was written to fix.
///  * [GidApi] — the typed surface over it. Shared endpoints only make sense
///    shared: auth, notifications, chat, support, i18n, documents. Each app
///    adds its own surface for its own nouns on top.
///  * [TokenStore] and friends — keystore-backed storage.
///  * [RealtimeService] — the socket, rooms and reconnection. It knows nothing
///    about who is signed in; each app wires that in its own composition root.
///  * The models, and the money/date formatting they depend on.
///
///  * NOT riverpod providers. Composition is an app's own business, and a
///    provider defined here would force both apps to share a lifetime they do
///    not share — the worker app connects its socket on duty, not on sign-in.
///  * NOT widgets. Those are `gid_ui`.
library;

export 'api/gid_api.dart';
export 'config/app_config.dart';
export 'config/remote_config.dart';
export 'location/address_format.dart';
export 'models/account_models.dart';
export 'models/models.dart';
export 'models/payment_models.dart';
export 'network/api_client.dart';
export 'network/api_exception.dart';
export 'network/json.dart';
export 'realtime/realtime_service.dart';
export 'storage/guest_store.dart';
export 'storage/otp_store.dart';
export 'storage/token_store.dart';
export 'storage/user_store.dart';
