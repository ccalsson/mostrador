plugins {
    id("com.android.application")
    // The Flutter Gradle Plugin must be applied after the Android and Kotlin Gradle plugins.
    id("dev.flutter.flutter-gradle-plugin")
}

val uploadStore = System.getenv("ANDROID_KEYSTORE_PATH")
val uploadPassword = System.getenv("ANDROID_STORE_PASSWORD")
val uploadAlias = System.getenv("ANDROID_KEY_ALIAS")
val uploadKeyPassword = System.getenv("ANDROID_KEY_PASSWORD")
val hasUploadSigning = listOf(uploadStore, uploadPassword, uploadAlias, uploadKeyPassword)
    .all { !it.isNullOrBlank() }

if (gradle.startParameter.taskNames.any { it.contains("release", ignoreCase = true) } && !hasUploadSigning) {
    throw GradleException("La entrega release requiere las cuatro variables ANDROID de firma upload; no se permite firma debug.")
}

android {
    namespace = "com.frutasroman.puesto_flutter"
    compileSdk = flutter.compileSdkVersion
    ndkVersion = flutter.ndkVersion

    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }

    defaultConfig {
        // TODO: Specify your own unique Application ID (https://developer.android.com/studio/build/application-id.html).
        applicationId = "com.frutasroman.puesto_flutter"
        // You can update the following values to match your application needs.
        // For more information, see: https://flutter.dev/to/review-gradle-config.
        minSdk = flutter.minSdkVersion
        targetSdk = flutter.targetSdkVersion
        // Uses the version code from pubspec.yaml. When using split APKs, 1000 * ABI_VERSION
        // is added automatically by Flutter. (https://developer.android.com/studio/build/configure-apk-splits#configure-APK-versions)
        // You can force using the value of versionCode by specifying the `-P force-version-code-ignoring-abi=true`
        // flag during build.
        versionCode = flutter.versionCode
        versionName = flutter.versionName
    }

    signingConfigs {
        if (hasUploadSigning) {
            create("upload") {
                storeFile = file(uploadStore!!)
                storePassword = uploadPassword
                keyAlias = uploadAlias
                keyPassword = uploadKeyPassword
            }
        }
    }

    buildTypes {
        release {
            signingConfig = if (hasUploadSigning) signingConfigs.getByName("upload") else null
        }
    }
}

kotlin {
    compilerOptions {
        jvmTarget = org.jetbrains.kotlin.gradle.dsl.JvmTarget.JVM_17
    }
}

flutter {
    source = "../.."
}
