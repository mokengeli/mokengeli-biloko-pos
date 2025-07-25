// src/api/apiConfig.ts


import axios from 'axios';
import env from '../config/environment';
import { EventRegister } from 'react-native-event-listeners';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

export const FORCE_LOGOUT_EVENT = 'FORCE_LOGOUT_EVENT';

const isWeb = Platform.OS === 'web';
const isMobile = Platform.OS === 'ios' || Platform.OS === 'android';

// =============================================================================
// SYSTÈME DE LOGGING CONDITIONNEL
// =============================================================================

class ApiLogger {
  private static isDevelopment: boolean = env.environment === 'development' || __DEV__;
  private static isVerboseLogging: boolean = this.isDevelopment;
  
  // Méthodes de logging conditionnelles
  static debug(message: string, ...args: any[]): void {
    if (this.isVerboseLogging) {
      console.log(`[API Debug] ${message}`, ...args);
    }
  }
  
  static info(message: string, ...args: any[]): void {
    if (this.isDevelopment) {
      console.log(`[API] ${message}`, ...args);
    }
  }
  
  static warn(message: string, ...args: any[]): void {
    console.warn(`[API Warning] ${message}`, ...args);
  }
  
  static error(message: string, ...args: any[]): void {
    console.error(`[API Error] ${message}`, ...args);
  }
  
  // Logging spécialisé pour les requêtes (plus détaillé)
  static request(message: string, data: any): void {
    if (this.isVerboseLogging) {
      console.log(`[API Request] ${message}`, data);
    } else if (this.isDevelopment) {
      // En dev normal, juste l'URL et la méthode
      console.log(`[API Request] ${data.method?.toUpperCase()} ${data.url}`);
    }
  }
  
  static response(message: string, data: any): void {
    if (this.isVerboseLogging) {
      console.log(`[API Response] ${message}`, data);
    } else if (this.isDevelopment) {
      // En dev normal, juste le statut
      console.log(`[API Response] ${data.status} ${data.url}`);
    }
  }
  
  // Méthodes pour contrôler le niveau de logging
  static setVerboseLogging(enabled: boolean): void {
    this.isVerboseLogging = enabled;
    console.log(`[API Logger] Verbose logging ${enabled ? 'enabled' : 'disabled'}`);
  }
  
  static getLoggingInfo(): object {
    return {
      isDevelopment: this.isDevelopment,
      isVerboseLogging: this.isVerboseLogging,
      platform: Platform.OS,
      environment: env.environment
    };
  }
}

// Exposer la configuration du logger
export const setApiVerboseLogging = (enabled: boolean) => ApiLogger.setVerboseLogging(enabled);
export const getApiLoggingInfo = () => ApiLogger.getLoggingInfo();

// =============================================================================
// GESTIONNAIRE DE TOKENS AVEC LOGGING CONDITIONNEL
// =============================================================================

class MobileTokenManager {
  private static readonly TOKEN_KEY = 'auth_token';
  private static readonly REFRESH_TOKEN_KEY = 'refresh_token';
  
  static async getToken(): Promise<string | null> {
    try {
      if (isMobile) {
        const token = await SecureStore.getItemAsync(this.TOKEN_KEY);
        if (token) {
          ApiLogger.debug('Token found in SecureStore');
          return token;
        } else {
          ApiLogger.debug('No token found in SecureStore');
          return null;
        }
      } else {
        // Pour le web, utiliser les cookies normalement
        ApiLogger.debug('Web platform - tokens managed by cookies');
        return null;
      }
    } catch (error) {
      ApiLogger.error('Error getting token:', error);
      return null;
    }
  }
  
  static async setToken(token: string): Promise<void> {
    try {
      if (isMobile) {
        await SecureStore.setItemAsync(this.TOKEN_KEY, token);
        ApiLogger.info('Token saved securely');
        ApiLogger.debug('Token details:', { length: token.length, prefix: token.substring(0, 10) + '...' });
      }
    } catch (error) {
      ApiLogger.error('Error saving token:', error);
    }
  }
  
  static async clearToken(): Promise<void> {
    try {
      if (isMobile) {
        await SecureStore.deleteItemAsync(this.TOKEN_KEY);
        await SecureStore.deleteItemAsync(this.REFRESH_TOKEN_KEY);
        ApiLogger.info('Tokens cleared');
      }
    } catch (error) {
      ApiLogger.error('Error clearing tokens:', error);
    }
  }
  
  static async extractTokenFromCookies(setCookieHeader: string | string[]): Promise<void> {
    if (!isMobile) return;
    
    const headers = Array.isArray(setCookieHeader) ? setCookieHeader : [setCookieHeader];
    
    for (const header of headers) {
      if (header.includes('accessToken=')) {
        const match = header.match(/accessToken=([^;]+)/);
        if (match) {
          const token = match[1];
          await this.setToken(token);
          ApiLogger.info('Token extracted from Set-Cookie header');
          ApiLogger.debug('Extracted token from header:', header.substring(0, 50) + '...');
          break;
        }
      }
    }
  }
}

// =============================================================================
// CONFIGURATION AXIOS AVEC LOGGING CONDITIONNEL
// =============================================================================

const api = axios.create({
  baseURL: env.apiUrl,
  timeout: 20000,
  withCredentials: isWeb,
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'X-Client-Type': isMobile ? 'mobile' : 'web',
    'X-Client-Platform': Platform.OS,
    'User-Agent': isMobile ? 'MokengeliBiloko/1.0.0 (Expo)' : undefined,
  }
});

// Log de configuration initiale (toujours affiché)
console.log('[API Config]', {
  url: env.apiUrl,
  platform: Platform.OS,
  isMobile,
  environment: env.environment,
  timeout: 20000,
  loggingLevel: ApiLogger.getLoggingInfo()
});

// =============================================================================
// INTERCEPTEURS AVEC LOGGING CONDITIONNEL
// =============================================================================

// Intercepteur de requête
api.interceptors.request.use(
  async (config) => {
    if (isMobile) {
      const token = await MobileTokenManager.getToken();
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
        ApiLogger.debug('Bearer token added to request');
      }
    }
    
    // Logging conditionnel des requêtes
    ApiLogger.request('Outgoing request', {
      url: config.url,
      method: config.method,
      hasAuth: !!config.headers.Authorization,
      headers: ApiLogger.getLoggingInfo().isVerboseLogging ? config.headers : undefined,
      data: ApiLogger.getLoggingInfo().isVerboseLogging ? config.data : undefined
    });
    
    return config;
  },
  (error) => {
    ApiLogger.error('Request interceptor error:', error);
    return Promise.reject(error);
  }
);

// Flag pour éviter les boucles infinies
let isHandlingForceLogout = false;

// Intercepteur de réponse
api.interceptors.response.use(
  async (response) => {
    // Logging conditionnel des réponses
    ApiLogger.response('Incoming response', {
      url: response.config.url,
      status: response.status,
      statusText: response.statusText,
      headers: ApiLogger.getLoggingInfo().isVerboseLogging ? response.headers : undefined,
      data: ApiLogger.getLoggingInfo().isVerboseLogging ? response.data : undefined
    });
    
    // Sur mobile, extraire le token des cookies si présent
    if (isMobile) {
      const setCookieHeader = response.headers['set-cookie'];
      if (setCookieHeader) {
        ApiLogger.debug('Set-Cookie header detected, extracting token...');
        await MobileTokenManager.extractTokenFromCookies(setCookieHeader);
      }
    }
    
    return response;
  },
  async (error) => {
    // Logging détaillé des erreurs (toujours en développement, erreurs critiques en production)
    const errorDetails = {
      message: error.message,
      code: error.code,
      url: error.config?.url,
      method: error.config?.method,
      response: error.response ? {
        status: error.response.status,
        statusText: error.response.statusText,
        data: error.response.data,
      } : null,
    };
    
    const statusCode = error.response?.status;
    
    // Erreurs critiques (toujours loggées)
    if (statusCode === 401 || statusCode === 403 || statusCode === 429 || statusCode >= 500) {
      ApiLogger.error('Critical API error:', errorDetails);
    } else {
      // Autres erreurs (seulement en développement)
      ApiLogger.info('API error:', errorDetails);
    }
    
    // Gestion des erreurs d'authentification
    if ((statusCode === 401 || statusCode === 429) && !isHandlingForceLogout) {
      isHandlingForceLogout = true;
      
      const message = statusCode === 401 
        ? 'Votre session a expiré. Veuillez vous reconnecter.'
        : 'Vous avez atteint le nombre maximum de sessions actives. Veuillez vous reconnecter.';
      
      ApiLogger.warn('Authentication error detected, forcing logout:', { statusCode, message });
      
      // Nettoyer les tokens
      await MobileTokenManager.clearToken();
      
      EventRegister.emit(FORCE_LOGOUT_EVENT, {
        code: statusCode,
        message: message
      });
      
      setTimeout(() => {
        isHandlingForceLogout = false;
      }, 2000);
    }
    
    return Promise.reject(error);
  }
);

// =============================================================================
// FONCTIONS UTILITAIRES AVEC LOGGING CONDITIONNEL
// =============================================================================

export const clearAuthTokens = async () => {
  ApiLogger.info('Clearing all authentication tokens...');
  await MobileTokenManager.clearToken();
  ApiLogger.info('All tokens cleared successfully');
};

export const saveAuthToken = async (token: string) => {
  ApiLogger.info('Saving authentication token...');
  await MobileTokenManager.setToken(token);
  ApiLogger.info('Authentication token saved successfully');
};

export const testConnection = async (): Promise<boolean> => {
  try {
    ApiLogger.info('Testing connection to:', env.apiUrl);
    
    const startTime = Date.now();
    const response = await api.get('/actuator/health');
    const duration = Date.now() - startTime;
    
    ApiLogger.info('Connection test successful:', {
      status: response.status,
      duration: `${duration}ms`,
      data: response.data
    });
    
    return true;
  } catch (error) {
    ApiLogger.error('Connection test failed:', error);
    
    // Diagnostic détaillé pour mobile (seulement en développement)
    if (isMobile && error.code === 'NETWORK_ERROR') {
      ApiLogger.debug('Network diagnostic:', {
        baseURL: env.apiUrl,
        timeout: 20000,
        platform: Platform.OS,
        suggestion: 'Vérifiez que le serveur est accessible depuis le réseau mobile'
      });
    }
    
    return false;
  }
};

// =============================================================================
// FONCTIONS DE DIAGNOSTIC ET DEBUG
// =============================================================================

export const getApiStats = () => {
  const interceptors = {
    requestInterceptors: api.interceptors.request.handlers.length,
    responseInterceptors: api.interceptors.response.handlers.length
  };
  
  const config = {
    baseURL: api.defaults.baseURL,
    timeout: api.defaults.timeout,
    withCredentials: api.defaults.withCredentials
  };
  
  return {
    ...config,
    ...interceptors,
    ...ApiLogger.getLoggingInfo(),
    isHandlingForceLogout
  };
};

export const debugApiCall = async (url: string, options?: any) => {
  ApiLogger.warn('Debug API call initiated:', { url, options });
  
  try {
    const response = await api.get(url, options);
    ApiLogger.info('Debug API call successful:', {
      status: response.status,
      headers: response.headers,
      data: response.data
    });
    return response;
  } catch (error) {
    ApiLogger.error('Debug API call failed:', error);
    throw error;
  }
};

export default api;