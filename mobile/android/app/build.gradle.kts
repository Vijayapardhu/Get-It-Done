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
