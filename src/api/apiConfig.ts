// src/api/apiConfig.ts

import axios from 'axios';
import env from '../config/environment';
import { EventRegister } from 'react-native-event-listeners';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

export const FORCE_LOGOUT_EVENT = 'FORCE_LOGOUT_EVENT';

const isWeb = Platform.OS === 'web';
const isMobile = Platform.OS === 'ios' || Platform.OS === 'android';

// Gestionnaire de tokens sécurisé pour mobile
class MobileTokenManager {
  private static readonly TOKEN_KEY = 'auth_token';
  private static readonly REFRESH_TOKEN_KEY = 'refresh_token';
  
  static async getToken(): Promise<string | null> {
    try {
      if (isMobile) {
        return await SecureStore.getItemAsync(this.TOKEN_KEY);
      } else {
        // Pour le web, utiliser les cookies normalement
        return null;
      }
    } catch (error) {
      console.error('[TokenManager] Error getting token:', error);
      return null;
    }
  }
  
  static async setToken(token: string): Promise<void> {
    try {
      if (isMobile) {
        await SecureStore.setItemAsync(this.TOKEN_KEY, token);
        console.log('[TokenManager] Token saved securely');
      }
    } catch (error) {
      console.error('[TokenManager] Error saving token:', error);
    }
  }
  
  static async clearToken(): Promise<void> {
    try {
      if (isMobile) {
        await SecureStore.deleteItemAsync(this.TOKEN_KEY);
        await SecureStore.deleteItemAsync(this.REFRESH_TOKEN_KEY);
        console.log('[TokenManager] Tokens cleared');
      }
    } catch (error) {
      console.error('[TokenManager] Error clearing tokens:', error);
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
          console.log('[TokenManager] Token extracted from Set-Cookie header');
          break;
        }
      }
    }
  }
}

// Configuration API avec authentification hybride
const api = axios.create({
  baseURL: env.apiUrl,
  timeout: 20000, // Augmenté pour les connexions réseau mobiles
  withCredentials: isWeb, // True pour web, False pour mobile
  headers: {
    'Content-Type': 'application/json',
    'Accept': 'application/json',
    'X-Client-Type': isMobile ? 'mobile' : 'web',
    'X-Client-Platform': Platform.OS,
    // Headers spécifiques pour Expo
    'User-Agent': isMobile ? 'MokengeliBiloko/1.0.0 (Expo)' : undefined,
  }
});

console.log('[Mobile API Config]', {
  url: env.apiUrl,
  platform: Platform.OS,
  isMobile,
  timeout: 20000
});

// Intercepteur pour ajouter l'authentification
api.interceptors.request.use(
  async (config) => {
    if (isMobile) {
      // Sur mobile, utiliser Bearer token
      const token = await MobileTokenManager.getToken();
      if (token) {
        config.headers.Authorization = `Bearer ${token}`;
        console.log('[Mobile API] Bearer token added to request');
      }
    }
    // Sur web, les cookies sont gérés automatiquement
    
    console.log('[Mobile API Request]', {
      url: config.url,
      method: config.method,
      hasAuth: !!config.headers.Authorization
    });
    
    return config;
  },
  (error) => Promise.reject(error)
);

// Flag pour éviter les boucles infinies
let isHandlingForceLogout = false;

// Intercepteur pour gérer les réponses
api.interceptors.response.use(
  async (response) => {
    console.log('[Mobile API Response]', {
      url: response.config.url,
      status: response.status
    });
    
    // Sur mobile, extraire le token des cookies si présent
    if (isMobile) {
      const setCookieHeader = response.headers['set-cookie'];
      if (setCookieHeader) {
        await MobileTokenManager.extractTokenFromCookies(setCookieHeader);
      }
    }
    
    return response;
  },
  async (error) => {
    console.error('[Mobile API Error]', {
      message: error.message,
      code: error.code,
      url: error.config?.url,
      response: error.response ? {
        status: error.response.status,
        data: error.response.data,
      } : null,
    });
    
    const statusCode = error.response?.status;
    
    // Gestion des erreurs d'authentification
    if ((statusCode === 401 || statusCode === 429) && !isHandlingForceLogout) {
      isHandlingForceLogout = true;
      
      const message = statusCode === 401 
        ? 'Votre session a expiré. Veuillez vous reconnecter.'
        : 'Vous avez atteint le nombre maximum de sessions actives. Veuillez vous reconnecter.';
      
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

// Fonction pour nettoyer l'authentification
export const clearAuthTokens = async () => {
  await MobileTokenManager.clearToken();
  console.log('[Mobile API] All tokens cleared');
};

// Fonction pour sauvegarder manuellement un token (après login)
export const saveAuthToken = async (token: string) => {
  await MobileTokenManager.setToken(token);
};

// Fonction de test de connexion améliorée
export const testConnection = async () => {
  try {
    console.log('[Mobile API] Testing connection to:', env.apiUrl);
    const response = await api.get('/actuator/health');
    console.log('[Mobile API] Connection test successful:', response.data);
    return true;
  } catch (error) {
    console.error('[Mobile API] Connection test failed:', error);
    
    // Diagnostic détaillé pour mobile
    if (isMobile && error.code === 'NETWORK_ERROR') {
      console.error('[Mobile API] Network diagnostic:', {
        baseURL: env.apiUrl,
        timeout: 20000,
        platform: Platform.OS,
        suggestion: 'Vérifiez que le serveur est accessible depuis le réseau mobile'
      });
    }
    
    return false;
  }
};

export default api;