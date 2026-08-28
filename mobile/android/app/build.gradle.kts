import java.util.Properties

// The Maps SDK key, kept out of the repository.
//
// Android has no way to hide a key inside an APK -- it ships with the app and
// can be read out of it -- so the protection is a Cloud console restriction to
// this package name plus signing certificate, NOT secrecy. Keeping it out of
// git still matters: a key in history is a key in every fork and every clone.
val mapsApiKey: String = Properties().apply {
    val file = rootProject.file("local.properties")
    if (file.exists()) file.inputStream().use { load(it) }
}.getProperty("MAPS_API_KEY") ?: ""

// Whether this build may speak plain HTTP to any host.
//
// The developer settings screen repoints the app at a server chosen at
// runtime, and those hosts cannot be listed in a static Android cleartext
// policy at build time. A demo build therefore needs the permissive config; a
// build for real users must not have it, so this defaults to false and has to
// be asked for explicitly in local.properties.
val allowCleartext: Boolean = Properties().apply {
    val file = rootProject.file("local.properties")
    if (file.exists()) file.inputStream().use { load(it) }
}.getProperty("ALLOW_CLEARTEXT")?.toBoolean() ?: false

plugins {
    id("com.android.application")
    id("kotlin-android")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

android {
    namespace = "com.getitdone.getitdone_customer"
    // 36 because flutter_secure_storage is compiled against it, and a library
    // compiled against a newer SDK than the app can reference APIs the app
    // cannot resolve. compileSdk only affects what the compiler knows about;
    // minSdk above is what actually decides which devices can install this.
    compileSdk = maxOf(flutter.compileSdkVersion, 36)
    // Pinned rather than taken from flutter.ndkVersion: path_provider,
    // razorpay_flutter, share_plus, sqflite and url_launcher all declare 27,
    // and Flutter's default is older. The build only warned, but the native
    // libraries it links are the plugins' own, so matching what they asked for
    // is the difference between a warning now and a crash on a device later.
    ndkVersion = "27.0.12077973"

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_11
        targetCompatibility = JavaVersion.VERSION_11
        // flutter_local_notifications uses java.time, which arrived in API 26.
        // minSdk here is 23, so the build fails outright without desugaring
        // rather than degrading on old devices.
        isCoreLibraryDesugaringEnabled = true
    }

    kotlinOptions {
        jvmTarget = JavaVersion.VERSION_11.toString()
    }

    defaultConfig {
        // TODO: Specify your own unique Application ID (https://developer.android.com/studio/build/application-id.html).
        applicationId = "com.getitdone.getitdone_customer"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        // flutter_secure_storage needs 23: it stores the refresh token in
        // the Android keystore, and the EncryptedSharedPreferences it uses
        // does not exist below Marshmallow. Flutter's default is lower, so the
        // release build fails outright rather than degrading.
        minSdk = maxOf(flutter.minSdkVersion, 23)
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName

        // Substituted into the com.google.android.geo.API_KEY meta-data. An
        // empty value builds fine and shows a blank grey map at runtime, which
        // is the honest failure for a missing key.
        manifestPlaceholders["MAPS_API_KEY"] = mapsApiKey

        // Strict by default: plain HTTP only to the three development hosts
        // named in network_security_config.xml.
        manifestPlaceholders["NETWORK_SECURITY_CONFIG"] =
            if (allowCleartext) "network_security_config_dev" else "network_security_config"
    }

    buildTypes {
        release {
            // TODO: Add your own signing config for the release build.
            // Signing with the debug keys for now, so `flutter run --release` works.
            signingConfig = signingConfigs.getByName("debug")
        }
    }
}

flutter {
    source = "../.."
}

dependencies {
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.4")
}
