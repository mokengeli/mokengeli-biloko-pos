//src/environment.ts

// Configurations pour différents environnements
const ENV = {
    dev: {
      apiUrl: 'https://hideously-smart-llama.ngrok-free.app',
      enableDebugTools: true,
    },
    staging: {
      apiUrl: 'https://staging-api.example.com',
      enableDebugTools: true,
    },
    prod: {
      apiUrl: 'https://api.example.com',
      enableDebugTools: false,
    }
  };
  
  // Par défaut, utiliser l'environnement de développement
  const getEnvVars = (env = process.env.NODE_ENV || 'development') => {
    if (env === 'development' || env === 'dev') {
      return ENV.dev;
    } else if (env === 'staging') {
      return ENV.staging;
    } else if (env === 'production' || env === 'prod') {
      return ENV.prod;
    }
    return ENV.dev;
  };
  
  export default getEnvVars();