import java.util.Properties

// The Maps SDK key, kept out of the repository.
//
// This is the WORKER app's own key, not the customer app's: restrict it in the
// Cloud console to com.getitdone.worker plus this signing certificate. Android
// has no way to hide a key inside an APK -- it ships with the app and can be
// read out of it -- so the console restriction is the protection, not secrecy.
// Keeping it out of git still matters: a key in history is a key in every fork.
val mapsApiKey: String = Properties().apply {
    val file = rootProject.file("local.properties")
    if (file.exists()) file.inputStream().use { load(it) }
}.getProperty("MAPS_API_KEY") ?: ""

// Whether this build may speak plain HTTP to any host.
//
// A build handed to a cooperative for a pilot points at their own instance,
// chosen at runtime, and those hosts cannot be listed in a static cleartext
// policy at build time. A build for real workers must not have it, so this
// defaults to false and has to be asked for explicitly in local.properties.
val allowCleartext: Boolean = Properties().apply {
    val file = rootProject.file("local.properties")
    if (file.exists()) file.inputStream().use { load(it) }
}.getProperty("ALLOW_CLEARTEXT")?.toBoolean() ?: false

plugins {
    id("com.android.application")
    id("kotlin-android")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

// Applied conditionally rather than declared above.
//
// google-services.json does not exist until somebody creates the Firebase
// project (WORKER_APP_PLAN 5.4). Declaring the plugin unconditionally makes the
// whole build fail with a message about a missing file, which is a terrible
// first experience for anyone cloning this repo. With this, the app builds and
// runs without push -- socket-only delivery, exactly the way the backend
// degrades without a service account -- and picks push up the moment the file
// is dropped in.
if (rootProject.file("app/google-services.json").exists()) {
    apply(plugin = "com.google.gms.google-services")
} else {
    logger.lifecycle(
        "google-services.json not found: building without push. " +
        "Job offers will only arrive while the app is open. See WORKER_APP_PLAN 5.4."
    )
}

android {
    // The Play listing this app ships under. Deliberately its own package: two
    // listings, two icons, two audiences. A worker and a customer must be able
    // to have both installed and never confuse them.
    namespace = "com.getitdone.worker"

    // 36 because flutter_secure_storage is compiled against it, and a library
    // compiled against a newer SDK than the app can reference APIs the app
    // cannot resolve.
    compileSdk = maxOf(flutter.compileSdkVersion, 36)

    // Pinned rather than taken from flutter.ndkVersion: sqflite, path_provider,
    // geolocator and url_launcher all declare 27, and Flutter's default is
    // older. The native libraries linked are the plugins' own, so matching what
    // they asked for is the difference between a warning now and a crash on a
    // device later.
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
        applicationId = "com.getitdone.worker"

        // 23 for flutter_secure_storage: it keeps the refresh token in the
        // Android keystore, and the EncryptedSharedPreferences it uses does not
        // exist below Marshmallow. This audience's phones are cheap, not
        // ancient -- 23 is 2015.
        minSdk = maxOf(flutter.minSdkVersion, 23)
        targetSdk = flutter.targetSdkVersion
        versionCode = flutter.versionCode
        versionName = flutter.versionName

        // Substituted into com.google.android.geo.API_KEY. An empty value
        // builds fine and shows a blank grey map, which is the honest failure
        // for a missing key.
        manifestPlaceholders["MAPS_API_KEY"] = mapsApiKey

        manifestPlaceholders["NETWORK_SECURITY_CONFIG"] =
            if (allowCleartext) "network_security_config_dev" else "network_security_config"
    }

    buildTypes {
        release {
            // TODO: replace with the worker app's own upload key before the
            // first internal-testing upload. Play will not accept two listings
            // signed with the debug key.
            signingConfig = signingConfigs.getByName("debug")
            isMinifyEnabled = false
            isShrinkResources = false
        }
    }
}

flutter {
    source = "../.."
}

dependencies {
    coreLibraryDesugaring("com.android.tools:desugar_jdk_libs:2.1.4")
}
