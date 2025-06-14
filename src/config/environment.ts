// src/config/environment.ts
import Constants from 'expo-constants';

// Déclaration de la variable globale __DEV__ pour TypeScript
declare const __DEV__: boolean;

// Interface pour la configuration d'environnement
interface EnvConfig {
  apiUrl: string;
  enableDebugTools: boolean;
  environment: 'development' | 'staging' | 'production';
  wsUrl?: string;
  apiTimeout: number;
}

// Configurations pour différents environnements
const ENV_CONFIGS: Record<string, EnvConfig> = {
  development: {
    apiUrl: 'https://hideously-smart-llama.ngrok-free.app',
    enableDebugTools: true,
    environment: 'development',
    apiTimeout: 10000,
  },
  staging: {
    apiUrl: 'http://104.248.206.121:8080',
    enableDebugTools: true,
    environment: 'staging',
    apiTimeout: 15000,
  },
  production: {
    apiUrl: 'https://api.mokengeli-biloko.com',
    enableDebugTools: false,
    environment: 'production',
    apiTimeout: 20000,
  }
};

// Fonction pour obtenir la configuration d'environnement
const getEnvVars = (): EnvConfig => {
  // 1. Vérifier les variables d'environnement Expo
  const expoConfig = Constants.expoConfig;
  const manifest = Constants.manifest2 || Constants.manifest;
  
  // 2. Déterminer l'environnement
  let environment: string;
  
  // Vérifier d'abord si on a une variable d'environnement explicite
  if (expoConfig?.extra?.environment && expoConfig.extra.environment in ENV_CONFIGS) {
    environment = expoConfig.extra.environment;
  } else if (manifest?.extra?.environment && manifest.extra.environment in ENV_CONFIGS) {
    environment = manifest.extra.environment;
  } else if (__DEV__) {
    environment = 'development';
  } else {
    // En production, vérifier le releaseChannel pour différencier staging et production
    const releaseChannel = manifest?.releaseChannel || expoConfig?.extra?.releaseChannel;
    
    if (releaseChannel === 'staging') {
      environment = 'staging';
    } else {
      environment = 'production';
    }
  }
  
  // 3. Charger la configuration de base
  const config = { ...ENV_CONFIGS[environment] };
  
  // 4. Override avec les variables d'environnement si disponibles
  if (expoConfig?.extra?.apiUrl) {
    config.apiUrl = expoConfig.extra.apiUrl;
  }
  
  if (expoConfig?.extra?.apiTimeout) {
    config.apiTimeout = parseInt(expoConfig.extra.apiTimeout, 10);
  }
  
  // 5. Support pour une URL WebSocket personnalisée si différente de l'API
  if (expoConfig?.extra?.wsUrl) {
    config.wsUrl = expoConfig.extra.wsUrl;
  } else if (!config.wsUrl) {
    // Si pas d'URL WebSocket spécifiée, la dériver de l'URL API
    config.wsUrl = config.apiUrl;
  }
  
  // 6. Log de la configuration (seulement en développement)
  if (__DEV__) {
    console.log('🔧 Configuration loaded:', {
      environment,
      apiUrl: config.apiUrl,
      wsUrl: config.wsUrl,
      isDev: __DEV__,
      releaseChannel: manifest?.releaseChannel || 'default'
    });
  }
  
  return config;
};

// Exporter une instance unique de la configuration
const envConfig = getEnvVars();

export default envConfig;

// Exporter également la fonction pour des tests ou des besoins spécifiques
export { getEnvVars, ENV_CONFIGS };