// plugins/withPrinterPermissions.js

const { withAndroidManifest } = require("@expo/config-plugins");

module.exports = function withPrinterPermissions(config) {
  return withAndroidManifest(config, async (config) => {
    const manifest = config.modResults;

    // Vérifier que le manifest existe
    if (!manifest.manifest) {
      console.warn("⚠️ No manifest found");
      return config;
    }

    console.log("🔧 Applying printer permissions plugin...");

    // =============================================================================
    // AJOUT DES FEATURES OPTIONNELLES
    // =============================================================================
    if (!manifest.manifest["uses-feature"]) {
      manifest.manifest["uses-feature"] = [];
    }

    const features = [
      // Features réseau pour les imprimantes WiFi
      { name: "android.hardware.wifi", required: "false" },
      { name: "android.hardware.ethernet", required: "false" },

      // Features Bluetooth pour futures imprimantes Bluetooth
      { name: "android.hardware.bluetooth", required: "false" },
      { name: "android.hardware.bluetooth_le", required: "false" },

      // Features de localisation pour le scan WiFi
      { name: "android.hardware.location", required: "false" },
      { name: "android.hardware.location.network", required: "false" },
    ];

    features.forEach((feature) => {
      const exists = manifest.manifest["uses-feature"].find(
        (f) => f.$ && f.$["android:name"] === feature.name
      );

      if (!exists) {
        manifest.manifest["uses-feature"].push({
          $: {
            "android:name": feature.name,
            "android:required": feature.required,
          },
        });
        console.log(`  ✅ Added feature: ${feature.name}`);
      }
    });

    // =============================================================================
    // CONFIGURATION DE L'APPLICATION
    // =============================================================================
    const application = manifest.manifest.application[0];

    if (application && application.$) {
      // S'assurer que ces attributs sont définis
      application.$["android:supportsRtl"] = "true";
      application.$["android:usesCleartextTraffic"] = "true";
      application.$["android:largeHeap"] = "true";
      application.$["android:networkSecurityConfig"] =
        "@xml/network_security_config";

      console.log("  ✅ Application attributes configured");
    }

    console.log("✅ Printer permissions plugin applied successfully");

    return config;
  });
};
