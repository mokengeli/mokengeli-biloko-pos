// src/config/environment.ts
import Constants from 'expo-constants';

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
  
  if (__DEV__) {
    environment = 'development';
  } else {
    // En production, utiliser la configuration par défaut
    environment = 'production';
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
  
  // 5. Log de la configuration (seulement en développement)
  if (__DEV__) {
    console.log('🔧 Configuration loaded:', {
      environment,
      apiUrl: config.apiUrl,
      isDev: __DEV__
    });
  }
  
  return config;
};

export default getEnvVars();