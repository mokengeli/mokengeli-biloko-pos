// src/services/SocketIOService.ts - VERSION CORRIGÉE
import { io, Socket } from 'socket.io-client';
import { Platform, AppState, AppStateStatus } from 'react-native';
import * as SecureStore from 'expo-secure-store';
import env from '../config/environment';
import { ConnectionManager } from './ConnectionManager';
import { NotificationHandler } from './NotificationHandler';
import {
  ConnectionStatus,
  OrderNotificationStatus,
  OrderNotification,
  SocketStats,
  EventCallback,
  StatusCallback
} from './types/WebSocketTypes';

// Export réexportés pour compatibilité
export {
  ConnectionStatus,
  OrderNotificationStatus,
  OrderNotification,
  SocketStats
} from './types/WebSocketTypes';

/**
 * Service Socket.io optimisé pour React Native
 * Gère la connexion, reconnexion, et distribution des messages
 */
class SocketIOService {
  private socket: Socket | null = null;
  private connectionManager: ConnectionManager;
  private notificationHandler: NotificationHandler;
  
  // État
  private currentStatus: ConnectionStatus = ConnectionStatus.DISCONNECTED;
  private currentTenantCode: string | null = null;
  private isAuthenticated: boolean = false;
  private appStateSubscription: any = null;
  
  // Callbacks
  private eventCallbacks: Map<string, Set<EventCallback>> = new Map();
  private statusCallbacks: Set<StatusCallback> = new Set();
  
  // Statistiques
  private stats: SocketStats = {
    isConnected: false,
    connectionStatus: ConnectionStatus.DISCONNECTED,
    reconnectAttempts: 0,
    lastConnectionTime: 0,
    lastDisconnectionTime: 0,
    messagesSent: 0,
    messagesReceived: 0,
    errors: 0,
    latency: 0,
    transport: null
  };
  
  // Configuration OPTIMISÉE pour éviter les timeouts intempestifs
  private readonly config = {
    maxReconnectAttempts: 10,
    reconnectInterval: 2000,
    reconnectMultiplier: 1.5,
    maxReconnectInterval: 60000,
    heartbeatInterval: 60000,
    heartbeatTimeout: 90000,
    pingInterval: 25000,
    pingTimeout: 60000,
    debug: env.environment !== 'production'
  };
  
  // Health check
  private healthCheckTimer: NodeJS.Timeout | null = null;
  private lastHealthCheck: number = Date.now();
  private lastPingTime: number = Date.now();
  private lastPongTime: number = Date.now();
  
  constructor() {
    this.connectionManager = new ConnectionManager();
    this.notificationHandler = new NotificationHandler();
    this.setupAppStateListener();
    this.log('SocketIO Service initialized with optimized timeouts');
  }
  
  /**
   * Connexion au serveur Socket.io
   */
  async connect(tenantCode: string): Promise<void> {
    // CORRECTION 1: Validation du tenantCode
    if (!tenantCode) {
      throw new Error('TenantCode is required for connection');
    }
    
    // Vérifier si déjà connecté au même tenant
    if (this.socket?.connected && this.currentTenantCode === tenantCode) {
      this.log('Already connected to the same tenant');
      return;
    }
    
    // Vérifier si une connexion est déjà en cours
    if (this.currentStatus === ConnectionStatus.CONNECTING) {
      this.log('Connection already in progress');
      return;
    }
    
    // Déconnecter si connecté à un autre tenant
    if (this.socket?.connected && this.currentTenantCode !== tenantCode) {
      this.log('Switching tenant, disconnecting first...');
      await this.disconnect();
    }
    
    // CORRECTION 2: Stocker le tenantCode AVANT la connexion
    this.currentTenantCode = tenantCode;
    this.setStatus(ConnectionStatus.CONNECTING);
    
    try {
      // Récupérer le token JWT
      const token = await this.getAuthToken();
      if (!token) {
        throw new Error('No authentication token available');
      }
      
      // Construire l'URL WebSocket
      const wsUrl = this.buildSocketUrl();
      
      this.log(`Connecting to ${wsUrl} for tenant ${tenantCode}`);
      
      // Options Socket.io optimisées pour React Native avec timeouts ajustés
      const socketOptions = {
        // Transport - Préférer websocket pour React Native
        transports: ['websocket', 'polling'],
        upgrade: true,
        
        // CORRECTION 3: S'assurer que le tenantCode est bien passé dans auth et query
        auth: {
          token: token,
          tenantCode: tenantCode, // Utiliser directement le paramètre
          platform: Platform.OS,
          appVersion: env.appVersion || '1.0.0'
        },
        
        query: {
          token: token,
          tenant: tenantCode, // Utiliser directement le paramètre
          tenantCode: tenantCode // Ajouter aussi avec le nom complet
        },
        
        // Reconnexion
        reconnection: true,
        reconnectionAttempts: this.config.maxReconnectAttempts,
        reconnectionDelay: this.config.reconnectInterval,
        reconnectionDelayMax: this.config.maxReconnectInterval,
        randomizationFactor: 0.5,
        
        // Timeouts
        timeout: 30000,
        ackTimeout: 15000,
        
        // Configuration des ping/pong
        pingInterval: this.config.pingInterval,
        pingTimeout: this.config.pingTimeout,
        
        // React Native Android specific
        ...(Platform.OS === 'android' && {
          forceBase64: true,
          jsonp: false,
          forceNew: true
        }),
        
        // Options supplémentaires
        autoConnect: false, // IMPORTANT: Ne pas auto-connecter, on veut contrôler le timing
        withCredentials: true,
        closeOnBeforeunload: false,
        path: '/socket.io/'
      };
      
      // Créer la connexion Socket.io
      this.socket = io(wsUrl, socketOptions);
      
      // Configurer les listeners AVANT de connecter
      this.setupSocketListeners();
      
      // Maintenant, connecter manuellement
      this.socket.connect();
      
      // Attendre la connexion
      await this.waitForConnection();
      
    } catch (error) {
      this.logError('Connection failed', error);
      this.setStatus(ConnectionStatus.FAILED);
      // CORRECTION 4: Ne pas effacer le tenantCode en cas d'échec pour permettre la reconnexion
      // this.currentTenantCode = null; // SUPPRIMÉ
      throw error;
    }
  }
  
  /**
   * Configuration des listeners Socket.io
   */
  private setupSocketListeners(): void {
    if (!this.socket) return;
    
    // Connexion établie
    this.socket.on('connect', () => {
      this.log(`Connected with socket ID: ${this.socket?.id}`);
      this.stats.isConnected = true;
      this.stats.lastConnectionTime = Date.now();
      this.stats.reconnectAttempts = 0;
      this.stats.transport = this.socket?.io.engine.transport.name || null;
      
      // Réinitialiser les compteurs de santé
      this.lastHealthCheck = Date.now();
      this.lastPingTime = Date.now();
      this.lastPongTime = Date.now();
      
      this.setStatus(ConnectionStatus.CONNECTED);
      
      // CORRECTION 5: S'authentifier après un court délai pour s'assurer que la connexion est stable
      setTimeout(() => {
        if (this.socket?.connected) {
          this.authenticate();
        }
      }, 100);
      
      this.startHealthCheck();
    });
    
    // Authentification réussie
    this.socket.on('authenticated', (data: any) => {
      this.log('Authentication successful', data);
      this.isAuthenticated = true;
      this.setStatus(ConnectionStatus.AUTHENTICATED);
      
      // CORRECTION 6: Rejoindre la room du tenant avec validation
      if (this.currentTenantCode) {
        this.log(`Joining room for tenant: ${this.currentTenantCode}`);
        this.joinTenantRoom(this.currentTenantCode);
      } else {
        this.logError('No tenant code available after authentication');
      }
    });
    
    // Erreur d'authentification
    this.socket.on('unauthorized', (error: any) => {
      this.logError('Authentication failed', error);
      this.isAuthenticated = false;
      this.setStatus(ConnectionStatus.ERROR);
      this.handleAuthError(error);
    });
    
    // Déconnexion
    this.socket.on('disconnect', (reason: string) => {
      this.log(`Disconnected: ${reason}`);
      this.stats.isConnected = false;
      this.stats.lastDisconnectionTime = Date.now();
      this.isAuthenticated = false;
      
      this.setStatus(ConnectionStatus.DISCONNECTED);
      this.stopHealthCheck();
      
      // CORRECTION 7: Ne pas effacer le tenantCode lors de la déconnexion
      // this.currentTenantCode = null; // SUPPRIMÉ
      
      // Gérer la reconnexion selon la raison
      if (reason === 'io server disconnect') {
        this.logError('Server forced disconnect');
      } else if (reason === 'transport close' || reason === 'transport error') {
        this.setStatus(ConnectionStatus.RECONNECTING);
      }
    });
    
    // Tentative de reconnexion
    this.socket.on('reconnect_attempt', (attemptNumber: number) => {
      this.log(`Reconnection attempt ${attemptNumber}`);
      this.stats.reconnectAttempts = attemptNumber;
      this.setStatus(ConnectionStatus.RECONNECTING);
    });
    
    // Reconnexion réussie
    this.socket.on('reconnect', (attemptNumber: number) => {
      this.log(`Reconnected after ${attemptNumber} attempts`);
      this.stats.reconnectAttempts = 0;
      this.lastHealthCheck = Date.now();
      // CORRECTION 8: S'authentifier après reconnexion
      this.authenticate();
    });
    
    // Échec de reconnexion
    this.socket.on('reconnect_failed', () => {
      this.logError('Reconnection failed after maximum attempts');
      this.setStatus(ConnectionStatus.FAILED);
    });
    
    // Erreur de connexion
    this.socket.on('connect_error', (error: Error) => {
      this.logError('Connection error', error);
      this.stats.errors++;
      
      if (error.message?.includes('401') || error.message?.includes('Unauthorized')) {
        this.handleAuthError(error);
      }
    });
    
    // Gestion du ping/pong
    this.socket.on('ping', () => {
      this.debugLog('Ping sent');
      this.lastPingTime = Date.now();
    });
    
    this.socket.on('pong', (latency?: number) => {
      this.debugLog(`Pong received, latency: ${latency || Date.now() - this.lastPingTime}ms`);
      this.lastPongTime = Date.now();
      this.stats.latency = latency || (Date.now() - this.lastPingTime);
      this.lastHealthCheck = Date.now();
    });
    
    // CORRECTION 9: Listener pour la confirmation de jointure de room
    this.socket.on('joined:tenant', (data: any) => {
      this.log(`Successfully joined tenant room: ${data.tenantCode || data.tenant || 'unknown'}`);
    });
    
    this.socket.on('join:error', (error: any) => {
      this.logError('Failed to join tenant room', error);
    });
    
    // Notifications métier
    this.setupBusinessEventListeners();
  }
  
  /**
   * Configuration des listeners pour les événements métier
   */
  private setupBusinessEventListeners(): void {
    if (!this.socket) return;
    
    // Notification de commande
    this.socket.on('order:notification', (notification: OrderNotification) => {
      this.log('Order notification received', notification);
      this.stats.messagesReceived++;
      this.lastHealthCheck = Date.now();
      
      // Traiter via le handler
      this.notificationHandler.processNotification(notification);
      
      // Distribuer aux callbacks
      this.emitEvent('order:notification', notification);
    });
    
    // Mise à jour de table
    this.socket.on('table:update', (data: any) => {
      this.log('Table update received', data);
      this.stats.messagesReceived++;
      this.lastHealthCheck = Date.now();
      this.emitEvent('table:update', data);
    });
    
    // Plat prêt
    this.socket.on('dish:ready', (data: any) => {
      this.log('Dish ready notification', data);
      this.stats.messagesReceived++;
      this.lastHealthCheck = Date.now();
      this.emitEvent('dish:ready', data);
    });
    
    // Demande de validation
    this.socket.on('validation:required', (data: any) => {
      this.log('Validation required', data);
      this.stats.messagesReceived++;
      this.lastHealthCheck = Date.now();
      this.emitEvent('validation:required', data);
    });
    
    // Message broadcast du tenant
    this.socket.on('tenant:broadcast', (data: any) => {
      this.log('Tenant broadcast received', data);
      this.stats.messagesReceived++;
      this.lastHealthCheck = Date.now();
      this.emitEvent('tenant:broadcast', data);
    });
  }
  
  /**
   * Authentification après connexion
   */
  private async authenticate(): Promise<void> {
    if (!this.socket?.connected) {
      this.logError('Cannot authenticate - socket not connected');
      return;
    }
    
    // CORRECTION 10: Validation du tenantCode avant l'authentification
    if (!this.currentTenantCode) {
      this.logError('Cannot authenticate - no tenant code available');
      return;
    }
    
    try {
      const token = await this.getAuthToken();
      if (!token) {
        throw new Error('No token for authentication');
      }
      
      this.log(`Authenticating with tenant: ${this.currentTenantCode}`);
      
      // Envoyer l'authentification avec le tenantCode
      this.socket.emit('authenticate', {
        token: token,
        tenantCode: this.currentTenantCode,
        tenant: this.currentTenantCode, // Compatibilité avec différentes implémentations serveur
        platform: Platform.OS
      });
      
    } catch (error) {
      this.logError('Authentication error', error);
      this.setStatus(ConnectionStatus.ERROR);
    }
  }
  
  /**
   * Rejoindre la room du tenant
   */
  private joinTenantRoom(tenantCode: string): void {
    // CORRECTION 11: Validation stricte avant de rejoindre la room
    if (!this.socket?.connected) {
      this.logError('Cannot join room - socket not connected');
      return;
    }
    
    if (!this.isAuthenticated) {
      this.logError('Cannot join room - not authenticated');
      return;
    }
    
    if (!tenantCode) {
      this.logError('Cannot join room - tenantCode is undefined or empty');
      return;
    }
    
    this.log(`Joining tenant room: ${tenantCode}`);
    
    // CORRECTION 12: Utiliser différents formats pour la compatibilité
    this.socket.emit('join:tenant', {
      tenantCode: tenantCode,
      tenant: tenantCode // Compatibilité avec différentes implémentations
    }, (response: any) => {
      if (response?.success) {
        this.log('Successfully joined tenant room');
      } else if (response?.error) {
        this.logError('Failed to join tenant room', response.error);
      } else {
        // Si pas de callback, le serveur peut envoyer un événement séparé
        this.log('Join request sent, waiting for confirmation');
      }
    });
    
    // Alternative: essayer aussi avec l'événement 'join:room' si le serveur l'utilise
    this.socket.emit('join:room', `tenant:${tenantCode}`);
  }
  
  /**
   * Health check périodique OPTIMISÉ
   */
  private startHealthCheck(): void {
    this.stopHealthCheck();
    
    this.healthCheckTimer = setInterval(() => {
      if (this.socket?.connected) {
        const now = Date.now();
        
        const timeSinceLastActivity = Math.min(
          now - this.lastHealthCheck,
          now - this.lastPongTime,
          now - (this.stats.lastConnectionTime || 0)
        );
        
        if (timeSinceLastActivity > this.config.heartbeatTimeout) {
          this.logError(`Health check timeout - no activity for ${Math.round(timeSinceLastActivity / 1000)}s`);
          
          if (this.socket?.connected) {
            this.socket.emit('ping');
            
            setTimeout(() => {
              const checkTime = Date.now();
              if (checkTime - this.lastPongTime > this.config.heartbeatTimeout) {
                this.logError('No pong response - connection is stale, reconnecting...');
                this.reconnect();
              } else {
                this.debugLog('Connection is still alive after manual ping');
              }
            }, 5000);
          } else {
            this.reconnect();
          }
        } else {
          this.debugLog(`Health check OK - last activity ${Math.round(timeSinceLastActivity / 1000)}s ago`);
        }
      }
    }, this.config.heartbeatInterval);
  }
  
  private stopHealthCheck(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
  }
  
  /**
   * Gestion de l'état de l'application
   */
  private setupAppStateListener(): void {
    this.appStateSubscription = AppState.addEventListener(
      'change',
      this.handleAppStateChange
    );
  }
  
  private handleAppStateChange = (nextAppState: AppStateStatus): void => {
    this.log(`App state changed to: ${nextAppState}`);
    
    if (nextAppState === 'active') {
      if (!this.socket?.connected && this.currentTenantCode) {
        this.log('App became active, reconnecting...');
        this.reconnect();
      } else if (this.socket?.connected) {
        this.lastHealthCheck = Date.now();
        this.lastPingTime = Date.now();
        this.lastPongTime = Date.now();
        this.startHealthCheck();
      }
    } else if (nextAppState === 'background') {
      this.stopHealthCheck();
    }
  };
  
  /**
   * Reconnexion manuelle
   */
  async reconnect(): Promise<void> {
    if (!this.currentTenantCode) {
      this.logError('Cannot reconnect without tenant code');
      return;
    }
    
    this.log(`Manual reconnection triggered for tenant: ${this.currentTenantCode}`);
    
    // CORRECTION 13: Ne pas appeler disconnect qui efface le tenantCode
    if (this.socket) {
      // Stocker le tenantCode temporairement
      const savedTenantCode = this.currentTenantCode;
      
      // Nettoyer la connexion existante sans effacer le tenantCode
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
      
      // Restaurer le tenantCode
      this.currentTenantCode = savedTenantCode;
    }
    
    // Petit délai pour s'assurer que la déconnexion est complète
    await new Promise(resolve => setTimeout(resolve, 500));
    
    // Reconnecter avec le tenantCode existant
    await this.connect(this.currentTenantCode);
  }
  
  /**
   * Déconnexion
   */
  async disconnect(): Promise<void> {
    this.log('Disconnecting...');
    
    this.stopHealthCheck();
    
    if (this.socket) {
      this.socket.removeAllListeners();
      this.socket.disconnect();
      this.socket = null;
    }
    
    this.isAuthenticated = false;
    // CORRECTION 14: Effacer le tenantCode seulement lors d'une déconnexion explicite
    this.currentTenantCode = null;
    this.setStatus(ConnectionStatus.DISCONNECTED);
    
    this.stats = {
      ...this.stats,
      isConnected: false,
      connectionStatus: ConnectionStatus.DISCONNECTED,
      reconnectAttempts: 0
    };
  }
  
  /**
   * Envoi d'événements
   */
  emit(event: string, data: any, callback?: (response: any) => void): void {
    if (!this.socket?.connected) {
      this.logError(`Cannot emit ${event} - not connected`);
      callback?.({ error: 'Not connected' });
      return;
    }
    
    this.log(`Emitting ${event}`, data);
    this.stats.messagesSent++;
    this.lastHealthCheck = Date.now();
    
    if (callback) {
      this.socket.emit(event, data, callback);
    } else {
      this.socket.emit(event, data);
    }
  }
  
  /**
   * Abonnement aux événements
   */
  on(event: string, callback: EventCallback): () => void {
    if (!this.eventCallbacks.has(event)) {
      this.eventCallbacks.set(event, new Set());
    }
    
    this.eventCallbacks.get(event)!.add(callback);
    this.log(`Subscribed to event: ${event}`);
    
    return () => {
      this.off(event, callback);
    };
  }
  
  /**
   * Désabonnement aux événements
   */
  off(event: string, callback: EventCallback): void {
    const callbacks = this.eventCallbacks.get(event);
    if (callbacks) {
      callbacks.delete(callback);
      if (callbacks.size === 0) {
        this.eventCallbacks.delete(event);
      }
      this.log(`Unsubscribed from event: ${event}`);
    }
  }
  
  /**
   * Abonnement aux changements de statut
   */
  onStatusChange(callback: StatusCallback): () => void {
    this.statusCallbacks.add(callback);
    callback(this.currentStatus);
    
    return () => {
      this.statusCallbacks.delete(callback);
    };
  }
  
  /**
   * Émettre un événement aux listeners locaux
   */
  private emitEvent(event: string, data: any): void {
    const callbacks = this.eventCallbacks.get(event);
    if (callbacks) {
      callbacks.forEach(callback => {
        try {
          callback(data);
        } catch (error) {
          this.logError(`Error in event callback for ${event}`, error);
        }
      });
    }
  }
  
  /**
   * Mise à jour du statut
   */
  private setStatus(status: ConnectionStatus): void {
    if (this.currentStatus !== status) {
      this.currentStatus = status;
      this.stats.connectionStatus = status;
      
      this.log(`Status changed to: ${status}`);
      
      this.statusCallbacks.forEach(callback => {
        try {
          callback(status);
        } catch (error) {
          this.logError('Error in status callback', error);
        }
      });
    }
  }
  
  /**
   * Gestion des erreurs d'authentification
   */
  private async handleAuthError(error: any): Promise<void> {
    this.logError('Authentication error - attempting token refresh', error);
    
    try {
      // TODO: Implémenter la logique de refresh token
      await this.disconnect();
    } catch (refreshError) {
      this.logError('Token refresh failed', refreshError);
      await this.disconnect();
    }
  }
  
  /**
   * Récupération du token JWT
   */
  private async getAuthToken(): Promise<string | null> {
    try {
      const token = await SecureStore.getItemAsync('auth_token');
      return token;
    } catch (error) {
      this.logError('Failed to get auth token', error);
      return null;
    }
  }
  
  /**
   * Construction de l'URL Socket.io
   */
  private buildSocketUrl(): string {
    return env.socketioUrl || env.apiUrl;
  }
  
  /**
   * Attendre la connexion
   */
  private waitForConnection(): Promise<void> {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.logError('Connection timeout after 30s');
        reject(new Error('Connection timeout'));
      }, 30000);
      
      let resolved = false;
      
      // Écouter directement l'événement connect pour résoudre la promesse
      const handleConnect = () => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          this.log('Connection established in waitForConnection');
          resolve();
        }
      };
      
      // Écouter l'événement d'erreur
      const handleError = (error: any) => {
        if (!resolved) {
          resolved = true;
          clearTimeout(timeout);
          this.logError('Connection error in waitForConnection', error);
          reject(error);
        }
      };
      
      // Si déjà connecté (cas rare), résoudre immédiatement
      if (this.socket?.connected) {
        resolved = true;
        clearTimeout(timeout);
        resolve();
        return;
      }
      
      // Ajouter les listeners temporaires
      this.socket?.once('connect', handleConnect);
      this.socket?.once('connect_error', handleError);
      
      // Nettoyer les listeners si timeout
      const originalTimeout = timeout;
      setTimeout(() => {
        if (!resolved) {
          this.socket?.off('connect', handleConnect);
          this.socket?.off('connect_error', handleError);
        }
      }, 30000);
    });
  }
  
  /**
   * Logging avec niveaux
   */
  private log(...args: any[]): void {
    if (this.config.debug) {
      console.log('[SocketIO]', ...args);
    }
  }
  
  private debugLog(...args: any[]): void {
    if (this.config.debug && env.environment === 'development') {
      console.log('[SocketIO Debug]', ...args);
    }
  }
  
  private logError(...args: any[]): void {
    console.error('[SocketIO Error]', ...args);
  }
  
  /**
   * Getters publics
   */
  getStatus(): ConnectionStatus {
    return this.currentStatus;
  }
  
  getStats(): SocketStats {
    return { ...this.stats };
  }
  
  isConnected(): boolean {
    return this.socket?.connected || false;
  }
  
  getSocketId(): string | undefined {
    return this.socket?.id;
  }
  
  getTenantCode(): string | null {
    return this.currentTenantCode;
  }
  
  /**
   * Nettoyage
   */
  destroy(): void {
    this.log('Destroying SocketIO Service');
    
    if (this.appStateSubscription) {
      this.appStateSubscription.remove();
    }
    
    this.disconnect();
    this.eventCallbacks.clear();
    this.statusCallbacks.clear();
  }
}

// Export singleton
export const socketIOService = new SocketIOService();