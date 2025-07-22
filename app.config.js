import "dotenv/config";

export default {
  expo: {
    name: "Mokengeli Biloko POS",
    slug: "mokengeli-biloko-pos",
    version: "1.0.0",
    orientation: "portrait",
    icon: "./assets/icon.png",
    userInterfaceStyle: "light",
    newArchEnabled: true,
    splash: {
      image: "./assets/splash-icon.png",
      resizeMode: "contain",
      backgroundColor: "#ffffff",
    },
    assetBundlePatterns: ["**/*"],

    // =============================================================================
    // CONFIGURATION IOS : Autoriser HTTP
    // =============================================================================
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.mokengelibiloko.pos",
      // Autoriser les connexions HTTP non sécurisées
      infoPlist: {
        NSAppTransportSecurity: {
          NSAllowsArbitraryLoads: true,
          // Ou plus spécifique pour votre IP :
          NSExceptionDomains: {
            "104.248.206.121": {
              NSExceptionAllowsInsecureHTTPLoads: true,
              NSExceptionMinimumTLSVersion: "1.0",
              NSIncludesSubdomains: true,
            },
          },
        },
      },
    },

    // =============================================================================
    // CONFIGURATION ANDROID : Autoriser HTTP
    // =============================================================================
    android: {
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#ffffff",
      },
      package: "com.mokengelibiloko.pos",
      // Autoriser les connexions HTTP non sécurisées
      config: {
        // Permet le trafic HTTP en texte clair
        usesCleartextTraffic: true,
      },
      // Permissions réseau (ajoutées automatiquement mais explicites)
      permissions: ["INTERNET", "ACCESS_NETWORK_STATE", "ACCESS_WIFI_STATE"],
    },

    web: {
      favicon: "./assets/favicon.png",
    },
    extra: {
      apiUrl: process.env.API_URL,
      apiTimeout: process.env.API_TIMEOUT || "20000",
      environment: process.env.NODE_ENV,
      eas: {
        projectId: "fcbb5cd1-b336-4cc9-a89b-4e5135ae678d",
      },
    },
    updates: {
      url: "https://u.expo.dev/fcbb5cd1-b336-4cc9-a89b-4e5135ae678d",
    },
    runtimeVersion: {
      policy: "appVersion",
    },
    plugins: [
      "expo-updates",
      // Plugin pour gérer les permissions réseau avancées
      [
        "expo-build-properties",
        {
          android: {
            usesCleartextTraffic: true,
            // Configuration réseau pour Android
            networkSecurityConfig: "./network_security_config.xml",
          },
          ios: {
            // Configuration pour iOS si nécessaire
          },
        },
      ],
    ],
  },
};
