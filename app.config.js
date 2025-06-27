// app.config.js
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
    ios: {
      supportsTablet: true,
      bundleIdentifier: "com.mokengelibiloko.pos",
    },
    android: {
      adaptiveIcon: {
        foregroundImage: "./assets/adaptive-icon.png",
        backgroundColor: "#ffffff",
      },
      package: "com.mokengelibiloko.pos",
    },
    web: {
      favicon: "./assets/favicon.png",
    },
    extra: {
      // Variables d'environnement accessibles dans l'app
      apiUrl: process.env.API_URL,
      apiTimeout: process.env.API_TIMEOUT || "15000",
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
    plugins: ["expo-updates"],
  },
};
