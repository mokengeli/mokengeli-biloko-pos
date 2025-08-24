// plugins/withProguardRules.js

const {
  withDangerousMod,
  withAppBuildGradle,
} = require("@expo/config-plugins");
const fs = require("fs");
const path = require("path");

/**
 * Plugin Expo pour configurer ProGuard avec les règles Socket.io
 */
module.exports = function withProguardRules(config) {
  // Étape 1: Copier le fichier proguard-rules.pro
  config = withDangerousMod(config, [
    "android",
    async (config) => {
      const projectRoot = config.modRequest.projectRoot;

      // Chemin source (à la racine du projet)
      const sourcePath = path.join(projectRoot, "proguard-rules.pro");

      // Chemin destination dans Android
      const destPath = path.join(
        projectRoot,
        "android",
        "app",
        "proguard-rules.pro"
      );

      // Créer le contenu ProGuard si le fichier n'existe pas
      const proguardContent = `# ============================================================================
# React Native Core
# ============================================================================
-keep,allowobfuscation @interface com.facebook.proguard.annotations.DoNotStrip
-keep,allowobfuscation @interface com.facebook.proguard.annotations.KeepGettersAndSetters
-keep,allowobfuscation @interface com.facebook.common.internal.DoNotStrip

-keep @com.facebook.proguard.annotations.DoNotStrip class *
-keep @com.facebook.common.internal.DoNotStrip class *
-keepclassmembers class * {
    @com.facebook.proguard.annotations.DoNotStrip *;
    @com.facebook.common.internal.DoNotStrip *;
}

-keepclassmembers @com.facebook.proguard.annotations.KeepGettersAndSetters class * {
  void set*(***);
  *** get*();
}

-keep class * extends com.facebook.react.bridge.JavaScriptModule { *; }
-keep class * extends com.facebook.react.bridge.NativeModule { *; }
-keepclassmembers,includedescriptorclasses class * { native <methods>; }
-keepclassmembers class *  { @com.facebook.react.uimanager.annotations.ReactProp <methods>; }
-keepclassmembers class *  { @com.facebook.react.uimanager.annotations.ReactPropGroup <methods>; }

-dontwarn com.facebook.react.**
-keep,includedescriptorclasses class com.facebook.react.bridge.** { *; }

# ============================================================================
# Socket.io Client v4
# ============================================================================
# Socket.io core
-keep class io.socket.** { *; }
-keep interface io.socket.** { *; }
-keep enum io.socket.** { *; }

# Socket.io client
-keep class io.socket.client.** { *; }
-keep interface io.socket.client.** { *; }
-keepnames class io.socket.client.** { *; }

# Socket.io emitter
-keep class io.socket.emitter.** { *; }
-keep interface io.socket.emitter.** { *; }

# Socket.io engine
-keep class io.socket.engineio.** { *; }
-keep interface io.socket.engineio.** { *; }
-keep class io.socket.engineio.client.** { *; }
-keep interface io.socket.engineio.client.** { *; }
-keep class io.socket.engineio.client.transports.** { *; }

# Socket.io parser
-keep class io.socket.parser.** { *; }
-keep interface io.socket.parser.** { *; }

# Socket.io thread
-keep class io.socket.thread.** { *; }
-keep interface io.socket.thread.** { *; }

# Prevent stripping of Socket.io methods
-keepclassmembers class io.socket.** {
    public *;
    protected *;
}

# ============================================================================
# OkHttp (utilisé par Socket.io)
# ============================================================================
-dontwarn okhttp3.**
-dontwarn okio.**
-dontwarn javax.annotation.**
-dontwarn org.conscrypt.**

-keep class okhttp3.** { *; }
-keep interface okhttp3.** { *; }
-keep class okio.** { *; }
-keep interface okio.** { *; }

# OkHttp platform used for SSL
-keepnames class okhttp3.internal.publicsuffix.PublicSuffixDatabase

# ============================================================================
# WebSocket Support
# ============================================================================
-keep class com.facebook.react.modules.websocket.** { *; }
-keep class org.java_websocket.** { *; }
-keep interface org.java_websocket.** { *; }

# ============================================================================
# JSON Processing (pour Socket.io)
# ============================================================================
-keep class org.json.** { *; }
-keepclassmembers class * {
    @com.google.gson.annotations.SerializedName <fields>;
}

# ============================================================================
# Network Security
# ============================================================================
-keep class com.google.android.gms.common.** { *; }
-keep class com.google.android.gms.internal.** { *; }
-dontwarn com.google.android.gms.**

# ============================================================================
# Expo & React Native Community
# ============================================================================
# Expo modules
-keep class expo.modules.** { *; }
-keep interface expo.modules.** { *; }

# React Native NetInfo
-keep class com.reactnativecommunity.netinfo.** { *; }

# React Native Async Storage
-keep class com.reactnativecommunity.asyncstorage.** { *; }

# React Native Vector Icons
-keep class com.oblador.vectoricons.** { *; }

# ============================================================================
# Hermes JavaScript Engine
# ============================================================================
-keep class com.facebook.hermes.unicode.** { *; }
-keep class com.facebook.jni.** { *; }

# ============================================================================
# React Native Paper
# ============================================================================
-keep class com.reactnativepaper.** { *; }

# ============================================================================
# React Navigation
# ============================================================================
-keep class com.swmansion.gesturehandler.** { *; }
-keep class com.swmansion.reanimated.** { *; }
-keep class com.swmansion.rnscreens.** { *; }
-keep class com.th3rdwave.safeareacontext.** { *; }

# ============================================================================
# Expo Secure Store
# ============================================================================
-keep class expo.modules.securestore.** { *; }

# ============================================================================
# Debug/Logging (sera automatiquement retiré en production par R8)
# ============================================================================
-assumenosideeffects class android.util.Log {
    public static boolean isLoggable(java.lang.String, int);
    public static int v(...);
    public static int i(...);
    public static int w(...);
    public static int d(...);
    public static int e(...);
}

# ============================================================================
# Règles générales de sécurité
# ============================================================================
# Garder les noms de classes pour le debugging
-keepattributes SourceFile,LineNumberTable

# Garder les annotations
-keepattributes *Annotation*

# Garder les signatures pour la réflexion
-keepattributes Signature

# Garder les exceptions pour le debugging
-keepattributes Exceptions

# Garder les inner classes
-keepattributes InnerClasses

# ============================================================================
# Optimisations spécifiques Android
# ============================================================================
# Ne pas optimiser les classes qui utilisent la réflexion
-optimizations !code/simplification/arithmetic,!field/*,!class/merging/*

# Nombre de passes d'optimisation
-optimizationpasses 5

# Ne pas pré-vérifier (Android n'en a pas besoin)
-dontpreverify

# Permettre l'accès aux membres de classe
-allowaccessmodification

# ============================================================================
# Suppressions d'avertissements spécifiques
# ============================================================================
-dontwarn io.socket.**
-dontwarn okhttp3.**
-dontwarn okio.**
-dontwarn com.facebook.**
-dontwarn javax.annotation.**
-dontwarn org.conscrypt.**
-dontwarn com.swmansion.**
-dontwarn expo.modules.**`;

      // Vérifier si le fichier source existe
      if (fs.existsSync(sourcePath)) {
        // Copier le fichier existant
        const content = fs.readFileSync(sourcePath, "utf8");
        fs.writeFileSync(destPath, content, "utf8");
        console.log("✅ ProGuard rules copied from project root");
        console.log(`   From: ${sourcePath}`);
        console.log(`   To: ${destPath}`);
      } else {
        // Créer le fichier avec le contenu par défaut
        fs.writeFileSync(destPath, proguardContent, "utf8");
        console.log("✅ ProGuard rules created with Socket.io configuration");
        console.log(`   Created at: ${destPath}`);

        // Optionnellement, créer aussi le fichier source pour référence future
        fs.writeFileSync(sourcePath, proguardContent, "utf8");
        console.log(
          "✅ ProGuard rules template saved at project root for future modifications"
        );
      }

      return config;
    },
  ]);

  // Étape 2: Modifier build.gradle pour activer ProGuard/R8
  config = withAppBuildGradle(config, (config) => {
    let buildGradle = config.modResults.contents;

    // Vérifier si ProGuard est déjà configuré
    if (!buildGradle.includes("proguardFiles")) {
      console.log("🔧 Configuring ProGuard in build.gradle...");

      // Chercher la section buildTypes
      const buildTypesRegex = /buildTypes\s*{[\s\S]*?release\s*{([\s\S]*?)}/;
      const match = buildGradle.match(buildTypesRegex);

      if (match) {
        const releaseContent = match[1];

        // Vérifier si minifyEnabled existe déjà
        if (!releaseContent.includes("minifyEnabled")) {
          // Ajouter la configuration ProGuard
          const newReleaseContent = `
            minifyEnabled true
            shrinkResources true
            proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'
            ${releaseContent}`;

          buildGradle = buildGradle.replace(
            /release\s*{[\s\S]*?}/,
            `release {${newReleaseContent}}`
          );

          console.log("✅ ProGuard configuration added to build.gradle");
        } else {
          // Mettre à jour minifyEnabled si il est à false
          buildGradle = buildGradle.replace(
            /minifyEnabled\s+false/,
            "minifyEnabled true"
          );

          // S'assurer que proguardFiles est présent
          if (!releaseContent.includes("proguardFiles")) {
            buildGradle = buildGradle.replace(
              /minifyEnabled\s+true/,
              `minifyEnabled true
            shrinkResources true
            proguardFiles getDefaultProguardFile('proguard-android-optimize.txt'), 'proguard-rules.pro'`
            );
          }

          console.log("✅ ProGuard configuration updated in build.gradle");
        }
      } else {
        console.warn(
          "⚠️ Could not find buildTypes.release section in build.gradle"
        );
        console.warn("   ProGuard may need manual configuration");
      }
    } else {
      console.log("ℹ️ ProGuard already configured in build.gradle");

      // S'assurer que minifyEnabled est à true pour le release
      if (buildGradle.includes("minifyEnabled false")) {
        buildGradle = buildGradle.replace(
          /minifyEnabled\s+false/g,
          "minifyEnabled true"
        );
        console.log("✅ Enabled minifyEnabled in build.gradle");
      }
    }

    config.modResults.contents = buildGradle;
    return config;
  });

  return config;
};
