// src/services/WebSocketService.ts
// =============================================================================
// WebSocketService.ts - VERSION OPTIMISÉE
// =============================================================================

import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import env from '../config/environment';
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

export type SubscriptionCallback = (notification: OrderNotification) => void;

export enum OrderNotificationStatus {
  NEW_ORDER = 'NEW_ORDER',
  DISH_UPDATE = 'DISH_UPDATE',
  PAYMENT_UPDATE = 'PAYMENT_UPDATE',
  TABLE_STATUS_UPDATE = 'TABLE_STATUS_UPDATE'
}

export interface OrderNotification {
  orderId: number;
  tableId: number;
  tenantCode: string;
  newState: string;
  previousState: string;
  tableState: 'FREE' | 'OCCUPIED' | 'RESERVED';
  orderStatus: OrderNotificationStatus;
  timestamp: string;
}

class WebSocketService {
  private client: Client | null = null;
  private subscriptions: Map<string, SubscriptionCallback[]> = new Map();
  private isConnected: boolean = false;
  
  // =============================================================================
  // RECONNEXION INTELLIGENTE - Backoff exponentiel
  // =============================================================================
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 8;            // Augmenté mais avec backoff
  private baseReconnectDelay: number = 1000;           // 1 seconde de base
  private maxReconnectDelay: number = 30000;           // Maximum 30 secondes
  private reconnectMultiplier: number = 1.5;           // Facteur de multiplication
  private lastDisconnectTime: number = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;
  
  // =============================================================================
  // LOGGING CONDITIONNEL
  // =============================================================================
  private isDevelopment: boolean = env.environment === 'development' || __DEV__;
  private isVerboseLogging: boolean = this.isDevelopment;
  
  // Méthodes de logging conditionnelles
  private debugLog(message: string, ...args: any[]) {
    if (this.isVerboseLogging) {
      console.log(`[WebSocket Debug] ${message}`, ...args);
    }
  }
  
  private infoLog(message: string, ...args: any[]) {
    console.log(`[WebSocket] ${message}`, ...args);
  }
  
  private errorLog(message: string, ...args: any[]) {
    console.error(`[WebSocket Error] ${message}`, ...args);
  }
  
  private warnLog(message: string, ...args: any[]) {
    console.warn(`[WebSocket Warning] ${message}`, ...args);
  }
  
  // =============================================================================
  // CONNEXION OPTIMISÉE
  // =============================================================================
  async connect(tenantCode: string): Promise<void> {
    return new Promise(async (resolve, reject) => {
      if (this.isConnected) {
        this.infoLog('Already connected, skipping connection attempt');
        resolve();
        return;
      }

      // Éviter les reconnexions trop rapides
      const timeSinceLastDisconnect = Date.now() - this.lastDisconnectTime;
      if (timeSinceLastDisconnect < 1000 && this.reconnectAttempts > 0) {
        this.warnLog('Connection attempt too soon after disconnect, waiting...');
        setTimeout(() => this.connect(tenantCode).then(resolve).catch(reject), 1000);
        return;
      }

      try {
        const authToken = await this.getAuthToken();
        if (!authToken) {
          reject(new Error('No authentication token available for WebSocket'));
          return;
        }

        this.infoLog(`Connection attempt ${this.reconnectAttempts + 1}/${this.maxReconnectAttempts}`);
        this.debugLog('Using token:', authToken.substring(0, 20) + '...');

        this.client = new Client({
          webSocketFactory: () => {
            const wsUrl = `${env.apiUrl}/api/order/ws`;
            const wsUrlWithToken = `${wsUrl}?token=${authToken}`;
            this.debugLog('Creating WebSocket connection to:', wsUrl);
            
            return new SockJS(wsUrlWithToken);
          },
          
          connectHeaders: {
            'Authorization': `Bearer ${authToken}`,
            'X-Client-Type': 'mobile',
            'X-Client-Platform': Platform.OS,
          },
          
          // =============================================================================
          // DEBUG CONDITIONNEL - La partie que vous vouliez améliorer !
          // =============================================================================
          debug: this.isVerboseLogging ? (str) => {
            this.debugLog('STOMP:', str);
          } : undefined,  // ✅ Pas de debug en production
          
          // Configuration des heartbeats (plus conservateurs en mobile)
          reconnectDelay: 0,  // On gère nous-mêmes les reconnexions
          heartbeatIncoming: 30000,  // 30 secondes - économie batterie
          heartbeatOutgoing: 30000,  // 30 secondes
          
          onConnect: (frame) => {
            this.infoLog('✅ Connected successfully after', this.reconnectAttempts, 'attempts');
            this.debugLog('Connection frame:', frame);
            
            this.isConnected = true;
            this.reconnectAttempts = 0;  // Reset du compteur
            this.clearReconnectTimer();
            
            this.subscribeToTopic(tenantCode);
            resolve();
          },
          
          onStompError: (frame) => {
            this.errorLog('STOMP error:', frame.headers?.message || 'Unknown error');
            this.isConnected = false;
            
            const errorMessage = frame.headers?.message || 'Unknown STOMP error';
            
            // Gestion spécialisée des erreurs
            if (errorMessage.includes('401') || errorMessage.includes('Unauthorized')) {
              this.errorLog('Authentication failed - stopping reconnection attempts');
              this.stopReconnection();
              reject(new Error('WebSocket authentication failed - Invalid token'));
            } else if (errorMessage.includes('403') || errorMessage.includes('Forbidden')) {
              this.errorLog('Access forbidden - stopping reconnection attempts');
              this.stopReconnection();
              reject(new Error('WebSocket access forbidden - Check permissions'));
            } else {
              // Erreur temporaire - continuer les reconnexions
              this.scheduleReconnection(tenantCode);
              reject(new Error(`WebSocket STOMP error: ${errorMessage}`));
            }
          },
          
          onWebSocketError: (error) => {
            this.errorLog('Connection error:', error);
            this.isConnected = false;
            this.scheduleReconnection(tenantCode);
            reject(new Error(`WebSocket connection error: ${error}`));
          },
          
          onWebSocketClose: (closeEvent) => {
            this.infoLog('Connection closed - Code:', closeEvent?.code, 'Reason:', closeEvent?.reason);
            this.isConnected = false;
            this.lastDisconnectTime = Date.now();
            
            // Analyser la raison de fermeture
            if (closeEvent?.code === 1000) {
              // Fermeture normale - ne pas reconnecter automatiquement
              this.infoLog('Connection closed normally - no reconnection needed');
              return;
            }
            
            this.scheduleReconnection(tenantCode);
          },
        });

        this.client.activate();

      } catch (error) {
        this.errorLog('Setup error:', error);
        reject(error);
      }
    });
  }

  // =============================================================================
  // RECONNEXION INTELLIGENTE AVEC BACKOFF EXPONENTIEL
  // =============================================================================
  private scheduleReconnection(tenantCode: string): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.errorLog(`Maximum reconnection attempts (${this.maxReconnectAttempts}) reached - giving up`);
      return;
    }
    
    if (this.reconnectTimer) {
      this.clearReconnectTimer();
    }
    
    // Calcul du délai avec backoff exponentiel
    const delay = Math.min(
      this.baseReconnectDelay * Math.pow(this.reconnectMultiplier, this.reconnectAttempts),
      this.maxReconnectDelay
    );
    
    this.reconnectAttempts++;
    this.infoLog(`Scheduling reconnection attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts} in ${delay}ms`);
    
    this.reconnectTimer = setTimeout(() => {
      this.infoLog(`Attempting reconnection ${this.reconnectAttempts}/${this.maxReconnectAttempts}...`);
      this.connect(tenantCode).catch(error => {
        this.warnLog('Reconnection failed:', error.message);
        // La prochaine tentative sera programmée par les gestionnaires d'erreur
      });
    }, delay);
  }
  
  private clearReconnectTimer(): void {
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
  }
  
  private stopReconnection(): void {
    this.clearReconnectTimer();
    this.reconnectAttempts = this.maxReconnectAttempts; // Empêcher les futures tentatives
  }

  // =============================================================================
  // MÉTHODES UTILITAIRES
  // =============================================================================
  private async getAuthToken(): Promise<string | null> {
    try {
      if (Platform.OS === 'ios' || Platform.OS === 'android') {
        const token = await SecureStore.getItemAsync('auth_token');
        if (token) {
          this.debugLog('Token found in SecureStore');
          return token;
        } else {
          this.warnLog('No token in SecureStore');
        }
      }
      return null;
    } catch (error) {
      this.errorLog('Error retrieving auth token:', error);
      return null;
    }
  }
  
  private subscribeToTopic(tenantCode: string): void {
    if (!this.client || !this.isConnected) {
      this.warnLog('Cannot subscribe - not connected');
      return;
    }
    
    const destination = `/topic/orders/${tenantCode}`;
    this.infoLog('Subscribing to:', destination);
    
    this.client.subscribe(destination, (message) => {
      try {
        const notification: OrderNotification = JSON.parse(message.body);
        this.infoLog('✅ Received notification for order:', notification.orderId);
        this.debugLog('Full notification:', notification);
        
        const callbacks = this.subscriptions.get(tenantCode) || [];
        callbacks.forEach(callback => {
          try {
            callback(notification);
          } catch (callbackError) {
            this.errorLog('Error in notification callback:', callbackError);
          }
        });
      } catch (err) {
        this.errorLog('Error processing message:', err);
      }
    });
    
    this.infoLog(`Successfully subscribed to notifications for tenant: ${tenantCode}`);
  }
  
  // =============================================================================
  // API PUBLIQUE
  // =============================================================================
  addSubscription(tenantCode: string, callback: SubscriptionCallback): () => void {
    if (!this.subscriptions.has(tenantCode)) {
      this.subscriptions.set(tenantCode, []);
    }
    
    const callbacks = this.subscriptions.get(tenantCode)!;
    callbacks.push(callback);
    
    this.debugLog(`Added subscription for tenant: ${tenantCode} (total: ${callbacks.length})`);
    
    return () => {
      const index = callbacks.indexOf(callback);
      if (index !== -1) {
        callbacks.splice(index, 1);
        this.debugLog(`Removed subscription for tenant: ${tenantCode} (remaining: ${callbacks.length})`);
      }
    };
  }
  
  disconnect(): void {
    this.infoLog('Manually disconnecting WebSocket...');
    this.stopReconnection();
    
    if (this.client && this.isConnected) {
      this.client.deactivate();
      this.isConnected = false;
      this.subscriptions.clear();
      this.reconnectAttempts = 0;
      this.infoLog('WebSocket disconnected successfully');
    }
  }

  isConnectionActive(): boolean {
    return this.isConnected && this.client?.connected === true;
  }
  
  // Nouvelle méthode pour forcer une reconnexion manuelle
  forceReconnect(tenantCode: string): Promise<void> {
    this.infoLog('Force reconnection requested');
    this.disconnect();
    this.reconnectAttempts = 0; // Reset pour permettre une nouvelle série de tentatives
    return this.connect(tenantCode);
  }
  
  // Activer/désactiver les logs verbeux à la volée
  setVerboseLogging(enabled: boolean): void {
    this.isVerboseLogging = enabled;
    this.infoLog('Verbose logging', enabled ? 'enabled' : 'disabled');
  }
  
  // Obtenir des statistiques de connexion
  getConnectionStats(): object {
    return {
      isConnected: this.isConnected,
      reconnectAttempts: this.reconnectAttempts,
      maxReconnectAttempts: this.maxReconnectAttempts,
      subscriptionsCount: this.subscriptions.size,
      clientState: this.client?.connected || false,
      verboseLogging: this.isVerboseLogging,
      lastDisconnectTime: this.lastDisconnectTime,
      timeSinceLastDisconnect: this.lastDisconnectTime ? Date.now() - this.lastDisconnectTime : 0
    };
  }
}

export const webSocketService = new WebSocketService();

// =============================================================================
// CONFIGURATION DE LOGGING EXTERNE (optionnel)
// =============================================================================

// Vous pouvez ajuster le niveau de logging depuis votre app :
/*
// Dans votre composant principal ou service d'initialisation :
import { webSocketService } from './services/WebSocketService';

// Activer les logs détaillés en développement
if (__DEV__) {
  webSocketService.setVerboseLogging(true);
} else {
  webSocketService.setVerboseLogging(false);
}

// Ou basé sur une variable d'environnement
webSocketService.setVerboseLogging(env.environment === 'development');
*/