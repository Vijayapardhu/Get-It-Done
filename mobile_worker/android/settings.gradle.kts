pluginManagement {
    val flutterSdkPath = run {
        val properties = java.util.Properties()
        file("local.properties").inputStream().use { properties.load(it) }
        val flutterSdkPath = properties.getProperty("flutter.sdk")
        require(flutterSdkPath != null) { "flutter.sdk not set in local.properties" }
        flutterSdkPath
    }

    includeBuild("$flutterSdkPath/packages/flutter_tools/gradle")

    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}

plugins {
    id("dev.flutter.flutter-plugin-loader") version "1.0.0"
    id("com.android.application") version "8.7.3" apply false
    id("org.jetbrains.kotlin.android") version "2.1.0" apply false
    // Reads android/app/google-services.json and generates the Firebase
    // resource values the FCM SDK looks up at runtime. Declared here, applied
    // in app/build.gradle.kts. Without it, firebase_core throws "Default
    // FirebaseApp is not initialized" at launch -- and this app is built around
    // a push that arrives while it is not running.
    id("com.google.gms.google-services") version "4.4.2" apply false
}

include(":app")
