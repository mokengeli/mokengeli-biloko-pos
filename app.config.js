import "dotenv/config";

// Fonction pour extraire le domaine de l'URL
const extractDomain = (url) => {
  if (!url) return null;
  try {
    const urlObj = new URL(url);
    return urlObj.hostname;
  } catch {
    // Si ce n'est pas une URL valide, retourner tel quel
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
    // CONFIGURATION IOS DYNAMIQUE
    // =============================================================================
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.mokengelibiloko.pos",
      infoPlist: {
        NSAppTransportSecurity: config.useSecure
          ? {
              // En HTTPS, on peut être plus restrictif
              NSAllowsArbitraryLoads: false,
              NSExceptionDomains: {
                [config.domain]: {
                  NSExceptionAllowsInsecureHTTPLoads: false,
                  NSRequiresCertificateTransparency: true,
                  NSIncludesSubdomains: true,
                },
              },
            }
          : {
              // En développement ou HTTP, plus permissif
              NSAllowsArbitraryLoads: true,
              NSExceptionDomains: {
                localhost: {
                  NSExceptionAllowsInsecureHTTPLoads: true,
                  NSIncludesSubdomains: true,
                },
                "10.0.2.2": {
                  NSExceptionAllowsInsecureHTTPLoads: true,
                  NSIncludesSubdomains: true,
                },
                ...(config.domain && config.domain !== "localhost"
                  ? {
                      [config.domain]: {
                        NSExceptionAllowsInsecureHTTPLoads: true,
                        NSExceptionMinimumTLSVersion: "1.0",
                        NSIncludesSubdomains: true,
                      },
                    }
                  : {}),
              },
            },
      },
    },

    // =============================================================================
    // CONFIGURATION ANDROID DYNAMIQUE
    // =============================================================================
    android: {
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#ffffff",
      },
      package: "com.mokengelibiloko.pos",
      config: {
        // En développement ou HTTP, permettre cleartext
        usesCleartextTraffic: !config.useSecure,
      },
      permissions: ["INTERNET", "ACCESS_NETWORK_STATE", "ACCESS_WIFI_STATE"],
    },

    web: {
      favicon: "./assets/favicon.png",
    },

    // =============================================================================
    // VARIABLES D'ENVIRONNEMENT EXPOSÉES
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

    updates: {
      url: "https://u.expo.dev/fcbb5cd1-b336-4cc9-a89b-4e5135ae678d",
    },
    runtimeVersion: {
      policy: "appVersion",
    },

    plugins: [
      "expo-updates",
      [
        "expo-build-properties",
        {
          android: {
            usesCleartextTraffic: !config.useSecure,
            // Un seul fichier de configuration réseau pour tous les environnements
            networkSecurityConfig: "./network_security_config.xml",
          },
          ios: {
            // Configurations iOS supplémentaires si nécessaire
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
});
