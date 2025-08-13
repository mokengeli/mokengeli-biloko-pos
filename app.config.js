import "dotenv/config";

// Fonction pour extraire le domaine de l'URL
const extractDomain = (url) => {
  if (!url) return null;
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch {
    return url;
  }
};

// Déterminer l'environnement et l'URL de l'API
const getApiConfig = () => {
  const apiUrl =
    process.env.API_URL || "https://api.preprod.pos.mokengeli-biloko.com";
  const environment = process.env.NODE_ENV || "production";
  const useSecure = process.env.USE_SECURE_CONNECTION === "true";

  return {
    apiUrl,
    environment,
    useSecure,
    domain: extractDomain(apiUrl),
  };
};

const config = getApiConfig();

export default {
  expo: {
    name: "Mokengeli Biloko POS",
    slug: "mokengeli-biloko-pos",
    scheme: "mokengeli-biloko-pos",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/img/icon.png",
    userInterfaceStyle: "light",
    newArchEnabled: true,
    splash: {
      image: "./assets/img/splash-icon.png",
      resizeMode: "contain",
      backgroundColor: "#ffffff",
    },
    assetBundlePatterns: ["**/*"],

    // =============================================================================
    // CONFIGURATION IOS
    // =============================================================================
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.mokengelibiloko.pos",
      infoPlist: {
        NSAppTransportSecurity: {
          NSAllowsArbitraryLoads: true,
          NSExceptionDomains: {
            localhost: {
              NSExceptionAllowsInsecureHTTPLoads: true,
              NSIncludesSubdomains: true,
            },
            "192.168.0.0": {
              NSExceptionAllowsInsecureHTTPLoads: true,
              NSIncludesSubdomains: true,
            },
            "192.168.1.0": {
              NSExceptionAllowsInsecureHTTPLoads: true,
              NSIncludesSubdomains: true,
            },
            "10.0.0.0": {
              NSExceptionAllowsInsecureHTTPLoads: true,
              NSIncludesSubdomains: true,
            },
          },
        },
        // Permissions iOS pour l'impression
        NSLocalNetworkUsageDescription:
          "Cette application a besoin d'accéder au réseau local pour communiquer avec les imprimantes.",
        NSBluetoothAlwaysUsageDescription:
          "Cette application utilise le Bluetooth pour se connecter aux imprimantes.",
        NSLocationWhenInUseUsageDescription:
          "Cette application utilise votre localisation pour scanner les réseaux WiFi locaux.",
      },
    },

    // =============================================================================
    // CONFIGURATION ANDROID
    // =============================================================================
    android: {
      adaptiveIcon: {
        foregroundImage: "./assets/img/adaptive-icon.png",
        backgroundColor: "#ffffff",
      },
      package: "com.mokengelibiloko.pos",

      // Autoriser HTTP (imprimantes / préprod)
      usesCleartextTraffic: true,

      // Permissions Android complètes
      permissions: [
        // Réseau
        "INTERNET",
        "ACCESS_NETWORK_STATE",
        "ACCESS_WIFI_STATE",
        // Stockage
        "READ_EXTERNAL_STORAGE",
        "WRITE_EXTERNAL_STORAGE",
        // Système
        "SYSTEM_ALERT_WINDOW",
        "VIBRATE",
        // Impression / réseau local
        "CHANGE_WIFI_STATE",
        "CHANGE_WIFI_MULTICAST_STATE",
        "ACCESS_FINE_LOCATION",
        "ACCESS_COARSE_LOCATION",
        // Bluetooth (imprimantes)
        "BLUETOOTH",
        "BLUETOOTH_ADMIN",
        "BLUETOOTH_CONNECT",
        "BLUETOOTH_SCAN",
        // Divers
        "WAKE_LOCK",
        "POST_NOTIFICATIONS",
      ],
    },

    web: {
      favicon: "./assets/favicon.png",
    },

    // =============================================================================
    // VARIABLES D'ENVIRONNEMENT
    // =============================================================================
    extra: {
      apiUrl: config.apiUrl,
      apiTimeout: process.env.API_TIMEOUT || "20000",
      environment: config.environment,
      useSecureConnection: config.useSecure,
      apiDomain: config.domain,
      eas: {
        projectId: "fcbb5cd1-b336-4cc9-a89b-4e5135ae678d",
      },
    },

    // Configuration des mises à jour OTA
    updates: {
      url: "https://u.expo.dev/fcbb5cd1-b336-4cc9-a89b-4e5135ae678d",
    },
    runtimeVersion: "1.0.0",

    // =============================================================================
    // PLUGINS
    // =============================================================================
    plugins: [
      // OTA
      "expo-updates",

      // Config réseau (si tu gardes ce plugin custom)
      "./plugins/withNetworkSecurity",

      // Permissions d'impression (plugin custom)
      "./plugins/withPrinterPermissions",

      // Propriétés de build
      [
        "expo-build-properties",
        {
          android: {
            // Monter le SDK pour satisfaire Room/DataStore/AppCompat et AGP 8.8.2
            compileSdkVersion: 35,
            targetSdkVersion: 35,
            minSdkVersion: 24,
            // Ne pas définir buildToolsVersion : AGP choisira 35.0.0
          },
          ios: {
            deploymentTarget: "15.1",
          },
        },
      ],
    ],
  },
};

// Log de la configuration pour debug
console.log("[App Config] Loaded configuration:", {
  apiUrl: config.apiUrl,
  environment: config.environment,
  useSecure: config.useSecure,
  domain: config.domain,
  cleartext: true,
});
