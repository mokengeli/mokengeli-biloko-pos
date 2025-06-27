// src/config/environment.ts
import Constants from "expo-constants";

declare const __DEV__: boolean;

export interface EnvConfig {
  apiUrl: string;
  apiTimeout: number;
  environment: "development" | "staging" | "production";
  enableDebugTools: boolean;
  wsUrl: string;
}

function loadConfig(): EnvConfig {
  const extra = Constants.expoConfig?.extra || {};
if (!extra.apiUrl) {
  throw new Error("❌ API_URL is not defined in expo.extra. Check your app.config.js and environment variables.");
}

  const apiUrl = extra.apiUrl;
  const apiTimeout = parseInt(extra.apiTimeout, 10);
  const environment = extra.environment ?? (__DEV__ ? "development" : "production");

  const enableDebugTools = environment !== "production";
  const wsUrl = apiUrl.startsWith("https")
  ? apiUrl.replace("https", "wss")
  : apiUrl.replace("http", "ws");

  return {
    apiUrl,
    apiTimeout,
    environment,
    enableDebugTools,
    wsUrl,
  };
}

const envConfig = loadConfig();
export default envConfig;
