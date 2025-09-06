// Config Plugin pour l'intégration des imprimantes thermiques ESC/POS avec react-native-esc-pos-printer
// Ce plugin complète withPrinterPermissions pour ajouter le support spécifique ESC/POS

const { withAndroidManifest, withInfoPlist } = require('@expo/config-plugins');

/**
 * Plugin pour configurer react-native-esc-pos-printer
 * Complète withPrinterPermissions qui gère déjà les permissions de base
 */
function withThermalPrinter(config, props = {}) {
  const {
    enableBluetooth = true,
    enableNetwork = true,
    enableUSB = true,
  } = props;

  console.log("🖨️ Applying ESC/POS thermal printer plugin...");

  // Configuration Android spécifique pour ESC/POS
  config = withAndroidManifest(config, (config) => {
    const androidManifest = config.modResults;
    
    // Ajouter les features USB si nécessaire (non gérées par withPrinterPermissions)
    if (enableUSB) {
      const features = androidManifest.manifest['uses-feature'] || [];
      
      if (!features.find(f => f.$ && f.$['android:name'] === 'android.hardware.usb.host')) {
        features.push({
          $: { 
            'android:name': 'android.hardware.usb.host',
            'android:required': 'false'
          }
        });
        console.log("  ✅ Added USB host feature for ESC/POS printers");
      }

      androidManifest.manifest['uses-feature'] = features;
      
      // Permission USB (spécifique aux imprimantes USB)
      const permissions = androidManifest.manifest['uses-permission'] || [];
      if (!permissions.find(p => p.$ && p.$['android:name'] === 'android.permission.USB_PERMISSION')) {
        permissions.push({
          $: { 'android:name': 'android.permission.USB_PERMISSION' }
        });
        console.log("  ✅ Added USB permission for ESC/POS printers");
      }
      androidManifest.manifest['uses-permission'] = permissions;
    }

    return config;
  });

  // Configuration iOS - Note: les permissions sont déjà dans app.config.js
  // On s'assure juste que les protocoles ESC/POS sont là
  config = withInfoPlist(config, (config) => {
    // Les protocoles ESC/POS sont déjà ajoutés dans app.config.js
    // On vérifie juste qu'ils sont bien présents
    if (!config.modResults.UISupportedExternalAccessoryProtocols) {
      config.modResults.UISupportedExternalAccessoryProtocols = [
        'com.epson.escpos',
        'jp.star-m.starpro',
        'com.bixolon.protocol'
      ];
      console.log("  ✅ Added ESC/POS protocols for iOS");
    }

    return config;
  });

  console.log("✅ ESC/POS thermal printer plugin applied successfully");
  return config;
}

module.exports = withThermalPrinter;