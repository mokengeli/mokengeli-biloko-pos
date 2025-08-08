// src/config/environment.ts
import Constants from "expo-constants";
import { Platform } from "react-native";

declare const __DEV__: boolean;

export interface EnvConfig {
  apiUrl: string;
  apiTimeout: number;
  environment: "development" | "staging" | "production";
  enableDebugTools: boolean;
  wsUrl: string;
  useSecureConnection: boolean;
  apiDomain: string;
}

// URLs par défaut pour chaque environnement
const DEFAULT_URLS = {
  development: "http://localhost:8081",
  staging: "https://api.preprod.pos.mokengeli-biloko.com",
  production: "https://api.pos.mokengeli-biloko.com"
};

// Détection automatique de l'URL locale pour le développement
function getLocalDevUrl(): string {
  // Pour le développement local, essayer de détecter l'IP locale
  if (Platform.OS === "android") {
    // Android emulator
    return "http://10.0.2.2:8081";
  } else if (Platform.OS === "ios") {
    // iOS simulator peut utiliser localhost
    return "http://localhost:8081";
  } else {
    // Web ou autre
    return "http://localhost:8081";
  }
}

function loadConfig(): EnvConfig {
  const extra = Constants.expoConfig?.extra || {};
  
  // Déterminer l'environnement
  const environment = extra.environment || (__DEV__ ? "development" : "production");
  
  // Déterminer l'URL de l'API
  let apiUrl = extra.apiUrl;
  
  if (!apiUrl) {
    // Si pas d'URL définie, utiliser les valeurs par défaut
    if (__DEV__ && environment === "development") {
      apiUrl = getLocalDevUrl();
      console.warn(`[Environment] No API_URL defined, using local dev URL: ${apiUrl}`);
    } else {
      apiUrl = DEFAULT_URLS[environment];
      console.warn(`[Environment] No API_URL defined, using default for ${environment}: ${apiUrl}`);
    }
  }
  
  // Extraire le domaine de l'URL
  let apiDomain = "localhost";
  try {
    const url = new URL(apiUrl);
    apiDomain = url.hostname;
  } catch (e) {
    console.error("[Environment] Invalid API URL:", apiUrl);
  }
  
  // Déterminer si on utilise HTTPS
  const useSecureConnection = apiUrl.startsWith("https://") || 
                              extra.useSecureConnection === true ||
                              extra.useSecureConnection === "true";
  
  // Timeout
  const apiTimeout = parseInt(extra.apiTimeout || "20000", 10);
  
  // Debug tools activés sauf en production
  const enableDebugTools = environment !== "production";
  
  // WebSocket URL (ws ou wss selon HTTPS)
  const wsUrl = apiUrl
    .replace("https://", "wss://")
    .replace("http://", "ws://");
  
  const config = {
    apiUrl,
    apiTimeout,
    environment,
    enableDebugTools,
    wsUrl,
    useSecureConnection,
    apiDomain
  };
  
  // Log de la configuration chargée
  console.log("[Environment] Configuration loaded:", {
    ...config,
    platform: Platform.OS,
    isDev: __DEV__
  });
  
  return config;
}

// Fonction pour obtenir l'URL de l'API selon le contexte
export function getApiUrl(): string {
  const config = loadConfig();
  
  // En développement avec Expo Go, on peut avoir besoin d'ajuster l'URL
  if (__DEV__ && config.environment === "development") {
    // Si on est sur un device physique, on ne peut pas utiliser localhost
    if (Platform.OS !== "web" && !Constants.isDevice) {
      // Simulateur/Emulateur
      return config.apiUrl;
    } else if (Constants.isDevice) {
      // Device physique - nécessite l'IP du serveur
      console.warn("[Environment] Running on physical device. Make sure API_URL points to your machine's IP address");
      return config.apiUrl;
    }
  }
  
  return config.apiUrl;
}

// Fonction pour vérifier si on est en mode sécurisé
export function isSecureConnection(): boolean {
  const config = loadConfig();
  return config.useSecureConnection;
}

// Export de la configuration
const envConfig = loadConfig();
export default envConfig;

// Helpers pour différents environnements
export const isDevelopment = () => envConfig.environment === "development";
export const isStaging = () => envConfig.environment === "staging";
export const isProduction = () => envConfig.environment === "production";
export const isDebugEnabled = () => envConfig.enableDebugTools;

// Helper pour obtenir les headers CORS appropriés
export function getCorsHeaders() {
  return {
    'X-Client-Type': 'mobile',
    'X-Client-Platform': Platform.OS,
    'X-Client-Version': Constants.expoConfig?.version || '1.0.0',
  };
}