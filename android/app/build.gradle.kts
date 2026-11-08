plugins {
    id("com.android.application")
    id("org.jetbrains.kotlin.android")
}

android {
    namespace = "io.github.mariyaz0.handtonose"
    compileSdk = 35

    defaultConfig {
        applicationId = "io.github.mariyaz0.handtonose"
        minSdk = 29 // Android 10: MediaStore.Downloads for exporting without permissions
        targetSdk = 35
        versionCode = 1
        versionName = "0.1.0"
    }

    buildTypes {
        release {
            isMinifyEnabled = false
        }
    }
    compileOptions {
        sourceCompatibility = JavaVersion.VERSION_17
        targetCompatibility = JavaVersion.VERSION_17
    }
    kotlinOptions {
        jvmTarget = "17"
    }
}

dependencies {
    // The app itself uses only the Android framework (no libraries) - fewer things to break.
    testImplementation("junit:junit:4.13.2")
}
