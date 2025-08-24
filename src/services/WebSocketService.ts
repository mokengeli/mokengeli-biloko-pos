// src/services/WebSocketService.ts
// =============================================================================
// WebSocketService.ts - VERSION CORRIGÉE POUR HTTPS/PRODUCTION
// =============================================================================

import { Client } from "@stomp/stompjs";
import SockJS from "sockjs-client";
import env from "../config/environment";
import { Platform } from "react-native";
import * as SecureStore from "expo-secure-store";
import api from "../api/apiConfig";
import {
  ConnectionStatus,
  OrderNotificationStatus,
  OrderNotification,
  SubscriptionCallback,
  ConnectionStatusCallback
} from './types/WebSocketTypes';

// Export réexportés pour compatibilité
export {
  ConnectionStatus,
  OrderNotificationStatus,
  OrderNotification
} from './types/WebSocketTypes';

export type { SubscriptionCallback, ConnectionStatusCallback } from './types/WebSocketTypes';

class WebSocketService {
  private client: Client | null = null;
  private subscriptions: Map<string, SubscriptionCallback[]> = new Map();
  private statusCallbacks: ConnectionStatusCallback[] = [];
  private isConnected: boolean = false;
  private currentStatus: ConnectionStatus = ConnectionStatus.DISCONNECTED;
  private currentTenantCode: string | null = null;

  // =============================================================================
  // RECONNEXION INTELLIGENTE
  // =============================================================================
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 10;
  private baseReconnectDelay: number = 1000;
  private maxReconnectDelay: number = 60000;
  private reconnectMultiplier: number = 1.5;
  private lastDisconnectTime: number = 0;
  private reconnectTimer: NodeJS.Timeout | null = null;

  // =============================================================================
  // DÉTECTION DE SANTÉ SERVEUR
  // =============================================================================
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private healthCheckIntervalMs: number = 30000;
  private isServerHealthy: boolean = true;
  private lastSuccessfulHealthCheck: number = Date.now();
  private healthCheckRetries: number = 0;
  private maxHealthCheckRetries: number = 3;

  // =============================================================================
  // HEARTBEAT INTELLIGENT
  // =============================================================================
  private missedHeartbeats: number = 0;
  private maxMissedHeartbeats: number = 3;
  private lastHeartbeatReceived: number = Date.now();
  private heartbeatCheckInterval: NodeJS.Timeout | null = null;

  // =============================================================================
  // LOGGING CONDITIONNEL
  // =============================================================================
  private isDevelopment: boolean = env.environment === "development" || __DEV__;
  private isVerboseLogging: boolean = this.isDevelopment;

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
  // GESTION D'ÉTAT
  // =============================================================================
  private setStatus(status: ConnectionStatus): void {
    if (this.currentStatus !== status) {
      this.currentStatus = status;
      this.infoLog(`Status changed to: ${status}`);
      this.statusCallbacks.forEach((callback) => {
        try {
          callback(status);
        } catch (error) {
          this.errorLog("Error in status callback:", error);
        }
      });
    }
  }

  // =============================================================================
  // SANTÉ SERVEUR
  // =============================================================================
  private async checkServerHealth(): Promise<boolean> {
    try {
      this.debugLog("Checking server health...");
      
      const response = await api.get("/actuator/health", { 
        timeout: 5000,
        validateStatus: (status) => status === 200 || status === 503
      });

      if (response.status === 200) {
        this.isServerHealthy = true;
        this.lastSuccessfulHealthCheck = Date.now();
        this.healthCheckRetries = 0;
        this.debugLog("✅ Server health check successful");
        return true;
      }

      throw new Error(`Health check failed with status: ${response.status}`);
    } catch (error: any) {
      this.healthCheckRetries++;
      this.warnLog(
        `❌ Server health check failed (attempt ${this.healthCheckRetries}):`,
        error.message
      );

      if (this.healthCheckRetries >= this.maxHealthCheckRetries) {
        this.isServerHealthy = false;
        this.setStatus(ConnectionStatus.SERVER_DOWN);
        this.infoLog(
          "🚨 Server marked as unhealthy after multiple failed health checks"
        );
      }

      return false;
    }
  }

  private startHealthCheck(): void {
    this.stopHealthCheck();

    this.healthCheckInterval = setInterval(async () => {
      if (
        this.currentStatus === ConnectionStatus.CONNECTED ||
        this.currentStatus === ConnectionStatus.RECONNECTING
      ) {
        await this.checkServerHealth();

        if (!this.isServerHealthy && this.isConnected) {
          this.warnLog(
            "Server unhealthy but WebSocket still connected - forcing reconnection"
          );
          this.forceDisconnectAndReconnect();
        }
      }
    }, this.healthCheckIntervalMs);

    this.debugLog("Health check monitoring started");
  }

  private stopHealthCheck(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
      this.debugLog("Health check monitoring stopped");
    }
  }

  // =============================================================================
  // HEARTBEAT MONITORING
  // =============================================================================
  private startHeartbeatMonitoring(): void {
    this.stopHeartbeatMonitoring();

    this.heartbeatCheckInterval = setInterval(() => {
      const timeSinceLastHeartbeat = Date.now() - this.lastHeartbeatReceived;
      const heartbeatTimeout = 45000;

      if (timeSinceLastHeartbeat > heartbeatTimeout) {
        this.missedHeartbeats++;
        this.warnLog(
          `Missed heartbeat ${this.missedHeartbeats}/${
            this.maxMissedHeartbeats
          } (${Math.round(timeSinceLastHeartbeat / 1000)}s ago)`
        );

        if (this.missedHeartbeats >= this.maxMissedHeartbeats) {
          this.warnLog(
            "Too many missed heartbeats - connection may be stale, reconnecting..."
          );
          this.forceDisconnectAndReconnect();
        }
      }
    }, 15000);

    this.debugLog("Heartbeat monitoring started");
  }

  private stopHeartbeatMonitoring(): void {
    if (this.heartbeatCheckInterval) {
      clearInterval(this.heartbeatCheckInterval);
      this.heartbeatCheckInterval = null;
      this.debugLog("Heartbeat monitoring stopped");
    }
  }

  private resetHeartbeat(): void {
    this.lastHeartbeatReceived = Date.now();
    this.missedHeartbeats = 0;
  }

  // =============================================================================
  // CONNEXION PRINCIPALE - CORRIGÉE POUR HTTPS
  // =============================================================================
  async connect(tenantCode: string): Promise<void> {
    return new Promise(async (resolve, reject) => {
      // Vérifications préliminaires
      if (this.isConnected && this.currentTenantCode === tenantCode) {
        this.infoLog("Already connected to the same tenant, skipping");
        resolve();
        return;
      }

      // Si connecté à un autre tenant, déconnecter d'abord
      if (this.isConnected && this.currentTenantCode !== tenantCode) {
        this.infoLog("Switching tenant, disconnecting first...");
        this.disconnect();
      }

      this.currentTenantCode = tenantCode;
      this.setStatus(ConnectionStatus.CONNECTING);

      // Vérifier la santé du serveur
      const serverHealthy = await this.checkServerHealth();
      if (!serverHealthy && this.reconnectAttempts === 0) {
        this.setStatus(ConnectionStatus.SERVER_DOWN);
        reject(new Error("Server is not responding to health checks"));
        return;
      }

      // Éviter les reconnexions trop rapides
      const timeSinceLastDisconnect = Date.now() - this.lastDisconnectTime;
      if (timeSinceLastDisconnect < 2000 && this.reconnectAttempts > 0) {
        this.warnLog("Connection attempt too soon after disconnect, waiting...");
        setTimeout(
          () => this.connect(tenantCode).then(resolve).catch(reject),
          2000
        );
        return;
      }

      try {
        // Récupérer le token
        const authToken = await this.getAuthToken();
        if (!authToken) {
          this.setStatus(ConnectionStatus.FAILED);
          reject(new Error("No authentication token available for WebSocket"));
          return;
        }

        this.infoLog(
          `🔌 Connection attempt ${this.reconnectAttempts + 1}/${
            this.maxReconnectAttempts
          } for tenant: ${tenantCode}`
        );
        this.debugLog("Token available:", authToken.substring(0, 20) + "...");

        // Construction de l'URL WebSocket
        const wsUrl = this.buildWebSocketUrl();
        this.infoLog(`🔌 WebSocket URL: ${wsUrl}`);

        // Créer le client STOMP
        this.client = new Client({
          webSocketFactory: () => {
            // IMPORTANT: Ajouter le token dans l'URL pour SockJS
            const wsUrlWithToken = `${wsUrl}?token=${encodeURIComponent(authToken)}`;
            
            this.debugLog("Creating SockJS connection to:", wsUrl);
            this.debugLog("With token parameter in URL");

            try {
              // Options SockJS optimisées pour mobile et HTTPS
              const socket = new SockJS(wsUrlWithToken, null, {
                // Transports autorisés (ordre de préférence)
                transports: ["websocket", "xhr-streaming", "xhr-polling"],
                // Timeout de connexion
                timeout: 15000,
                // IMPORTANT: Ne pas envoyer de cookies en cross-origin
                withCredentials: false,
                // Options de debug
                debug: this.isVerboseLogging,
                // Headers supplémentaires (si supporté)
                headers: {
                  'Authorization': `Bearer ${authToken}`,
                  'X-Client-Type': 'mobile',
                  'X-Client-Platform': Platform.OS
                }
              });

              this.debugLog("SockJS socket created successfully");
              return socket;
            } catch (error) {
              this.errorLog("Failed to create SockJS socket:", error);
              throw error;
            }
          },

          // Headers STOMP
          connectHeaders: {
            'Authorization': `Bearer ${authToken}`,
            'X-Client-Type': 'mobile',
            'X-Client-Platform': Platform.OS,
            'X-Tenant-Code': tenantCode,
            'X-Connection-Attempt': String(this.reconnectAttempts + 1),
          },

          // Debug STOMP
          debug: this.isVerboseLogging
            ? (str) => {
                this.debugLog("STOMP:", str);
                // Détecter les heartbeats
                if (str.includes("PING") || str.includes("PONG") || str.includes("heartbeat")) {
                  this.resetHeartbeat();
                }
              }
            : undefined,

          // Configuration des heartbeats
          reconnectDelay: 0, // On gère nous-mêmes la reconnexion
          heartbeatIncoming: 30000, // 30 secondes
          heartbeatOutgoing: 30000, // 30 secondes

          // Callbacks
          onConnect: (frame) => {
            this.infoLog(`✅ Connected successfully after ${this.reconnectAttempts} attempts`);
            this.debugLog("Connection frame:", frame);

            this.isConnected = true;
            this.setStatus(ConnectionStatus.CONNECTED);
            this.reconnectAttempts = 0;
            this.isServerHealthy = true;
            this.clearReconnectTimer();
            this.resetHeartbeat();

            // Démarrer les monitoring
            this.startHealthCheck();
            this.startHeartbeatMonitoring();

            // S'abonner au topic
            this.subscribeToTopic(tenantCode);
            
            resolve();
          },

          onStompError: (frame) => {
            this.errorLog("❌ STOMP error:", frame.headers?.message || "Unknown error");
            this.debugLog("STOMP error frame:", frame);
            
            this.isConnected = false;
            this.setStatus(ConnectionStatus.FAILED);

            const errorMessage = frame.headers?.message || "Unknown STOMP error";

            // Gestion des erreurs d'authentification
            if (errorMessage.includes("401") || errorMessage.includes("Unauthorized")) {
              this.errorLog("🔐 Authentication failed - stopping reconnection attempts");
              this.stopReconnection();
              reject(new Error("WebSocket authentication failed - Invalid token"));
            } else if (errorMessage.includes("403") || errorMessage.includes("Forbidden")) {
              this.errorLog("🚫 Access forbidden - stopping reconnection attempts");
              this.stopReconnection();
              reject(new Error("WebSocket access forbidden - Check permissions"));
            } else {
              // Autres erreurs - tenter la reconnexion
              this.scheduleReconnection(tenantCode);
              reject(new Error(`WebSocket STOMP error: ${errorMessage}`));
            }
          },

          onWebSocketError: (error) => {
            this.errorLog("❌ WebSocket error:", error);
            this.isConnected = false;
            this.setStatus(ConnectionStatus.DISCONNECTED);
            this.scheduleReconnection(tenantCode);
            reject(new Error(`WebSocket connection error: ${error}`));
          },

          onWebSocketClose: (closeEvent) => {
            this.infoLog(
              `🔌 Connection closed - Code: ${closeEvent?.code}, Reason: ${
                closeEvent?.reason || "Unknown"
              }`
            );
            this.isConnected = false;
            this.lastDisconnectTime = Date.now();
            this.stopHeartbeatMonitoring();

            // Analyser le code de fermeture
            if (closeEvent?.code === 1000) {
              // Fermeture normale
              this.infoLog("✅ Connection closed normally");
              this.setStatus(ConnectionStatus.DISCONNECTED);
              return;
            }

            // Codes indiquant un problème temporaire
            if (closeEvent?.code === 1001 || closeEvent?.code === 1006 || !closeEvent?.code) {
              this.infoLog("🔄 Connection lost - will attempt reconnection");
              this.setStatus(ConnectionStatus.RECONNECTING);
              this.scheduleReconnection(tenantCode);
            } else {
              // Autres codes d'erreur
              this.warnLog(`Connection closed with code ${closeEvent?.code}`);
              this.setStatus(ConnectionStatus.DISCONNECTED);
              this.scheduleReconnection(tenantCode);
            }
          },
        });

        // Activer la connexion
        this.client.activate();

      } catch (error: any) {
        this.errorLog("Setup error:", error);
        this.setStatus(ConnectionStatus.FAILED);
        reject(error);
      }
    });
  }

  // =============================================================================
  // CONSTRUCTION URL WEBSOCKET - IMPORTANT POUR HTTPS
  // =============================================================================
  private buildWebSocketUrl(): string {
    // Toujours utiliser HTTPS/HTTP pour SockJS (pas WSS/WS)
    const baseUrl = env.apiUrl;
    const wsPath = "/api/order/ws";
    
    // S'assurer que l'URL est correcte
    const url = baseUrl.endsWith('/') 
      ? `${baseUrl.slice(0, -1)}${wsPath}`
      : `${baseUrl}${wsPath}`;
    
    this.debugLog("Built WebSocket URL:", url);
    return url;
  }

  // =============================================================================
  // RÉCUPÉRATION TOKEN
  // =============================================================================
  private async getAuthToken(): Promise<string | null> {
    try {
      if (Platform.OS === "ios" || Platform.OS === "android") {
        const token = await SecureStore.getItemAsync("auth_token");
        if (token) {
          this.debugLog("Token found in SecureStore");
          return token;
        } else {
          this.warnLog("No token in SecureStore");
        }
      }
      return null;
    } catch (error) {
      this.errorLog("Error retrieving auth token:", error);
      return null;
    }
  }

  // =============================================================================
  // SOUSCRIPTION AU TOPIC
  // =============================================================================
  private subscribeToTopic(tenantCode: string): void {
    if (!this.client || !this.isConnected) {
      this.warnLog("Cannot subscribe - not connected");
      return;
    }

    const destination = `/topic/orders/${tenantCode}`;
    this.infoLog(`📡 Subscribing to: ${destination}`);

    try {
      const subscription = this.client.subscribe(destination, (message) => {
        try {
          // Reset heartbeat à chaque message
          this.resetHeartbeat();

          const notification: OrderNotification = JSON.parse(message.body);
          this.infoLog(`✅ Notification received for order #${notification.orderId}`);
          this.debugLog("Full notification:", notification);

          // Appeler tous les callbacks pour ce tenant
          const callbacks = this.subscriptions.get(tenantCode) || [];
          callbacks.forEach((callback) => {
            try {
              callback(notification);
            } catch (callbackError) {
              this.errorLog("Error in notification callback:", callbackError);
            }
          });
        } catch (err) {
          this.errorLog("Error processing message:", err);
        }
      });

      this.infoLog(`✅ Successfully subscribed to notifications for tenant: ${tenantCode}`);
      this.debugLog("Subscription ID:", subscription.id);
      
    } catch (error) {
      this.errorLog("Failed to subscribe to topic:", error);
      throw error;
    }
  }

  // =============================================================================
  // RECONNEXION INTELLIGENTE
  // =============================================================================
  private scheduleReconnection(tenantCode: string): void {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      this.errorLog(
        `❌ Maximum reconnection attempts (${this.maxReconnectAttempts}) reached`
      );
      this.setStatus(ConnectionStatus.FAILED);
      return;
    }

    if (this.reconnectTimer) {
      this.clearReconnectTimer();
    }

    // Délai adaptatif
    let baseDelay = this.baseReconnectDelay;
    if (!this.isServerHealthy) {
      baseDelay = baseDelay * 2;
      this.infoLog("🔄 Server unhealthy - using longer reconnection delays");
    }

    const delay = Math.min(
      baseDelay * Math.pow(this.reconnectMultiplier, this.reconnectAttempts),
      this.maxReconnectDelay
    );

    this.reconnectAttempts++;
    this.setStatus(ConnectionStatus.RECONNECTING);
    this.infoLog(
      `🔄 Scheduling reconnection ${this.reconnectAttempts}/${
        this.maxReconnectAttempts
      } in ${Math.round(delay / 1000)}s`
    );

    this.reconnectTimer = setTimeout(async () => {
      this.infoLog(`🔄 Attempting reconnection ${this.reconnectAttempts}/${this.maxReconnectAttempts}...`);

      try {
        await this.connect(tenantCode);
      } catch (error: any) {
        this.warnLog("Reconnection failed:", error.message);
      }
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
    this.stopHealthCheck();
    this.stopHeartbeatMonitoring();
    this.reconnectAttempts = this.maxReconnectAttempts;
  }

  private forceDisconnectAndReconnect(): void {
    this.infoLog("🔄 Forcing disconnect and reconnect...");

    if (this.client && this.isConnected) {
      this.client.deactivate();
    }

    this.isConnected = false;
    this.lastDisconnectTime = Date.now();

    // Reconnecter avec le tenant actuel
    if (this.currentTenantCode) {
      this.scheduleReconnection(this.currentTenantCode);
    }
  }

  // =============================================================================
  // API PUBLIQUE
  // =============================================================================
  addSubscription(
    tenantCode: string,
    callback: SubscriptionCallback
  ): () => void {
    if (!this.subscriptions.has(tenantCode)) {
      this.subscriptions.set(tenantCode, []);
    }

    const callbacks = this.subscriptions.get(tenantCode)!;
    callbacks.push(callback);

    this.debugLog(
      `Added subscription for tenant: ${tenantCode} (total: ${callbacks.length})`
    );

    return () => {
      const index = callbacks.indexOf(callback);
      if (index !== -1) {
        callbacks.splice(index, 1);
        this.debugLog(
          `Removed subscription for tenant: ${tenantCode} (remaining: ${callbacks.length})`
        );
      }
    };
  }

  addStatusCallback(callback: ConnectionStatusCallback): () => void {
    this.statusCallbacks.push(callback);
    callback(this.currentStatus);

    return () => {
      const index = this.statusCallbacks.indexOf(callback);
      if (index !== -1) {
        this.statusCallbacks.splice(index, 1);
      }
    };
  }

  disconnect(): void {
    this.infoLog("🔌 Manually disconnecting WebSocket...");
    this.stopReconnection();

    if (this.client) {
      try {
        this.client.deactivate();
      } catch (error) {
        this.errorLog("Error during deactivation:", error);
      }
    }

    this.isConnected = false;
    this.currentTenantCode = null;
    this.subscriptions.clear();
    this.reconnectAttempts = 0;
    this.setStatus(ConnectionStatus.DISCONNECTED);
    this.infoLog("✅ WebSocket disconnected successfully");
  }

  isConnectionActive(): boolean {
    return this.isConnected && this.client?.connected === true;
  }

  getCurrentStatus(): ConnectionStatus {
    return this.currentStatus;
  }

  forceReconnect(tenantCode: string): Promise<void> {
    this.infoLog("🔄 Force reconnection requested");
    this.disconnect();
    this.reconnectAttempts = 0;
    this.isServerHealthy = true;
    return this.connect(tenantCode);
  }

  setVerboseLogging(enabled: boolean): void {
    this.isVerboseLogging = enabled;
    this.infoLog("Verbose logging", enabled ? "enabled" : "disabled");
  }

  getConnectionStats(): object {
    return {
      isConnected: this.isConnected,
      currentStatus: this.currentStatus,
      currentTenant: this.currentTenantCode,
      reconnectAttempts: this.reconnectAttempts,
      maxReconnectAttempts: this.maxReconnectAttempts,
      subscriptionsCount: this.subscriptions.size,
      clientState: this.client?.connected || false,
      verboseLogging: this.isVerboseLogging,
      lastDisconnectTime: this.lastDisconnectTime,
      timeSinceLastDisconnect: this.lastDisconnectTime
        ? Date.now() - this.lastDisconnectTime
        : 0,
      isServerHealthy: this.isServerHealthy,
      lastSuccessfulHealthCheck: this.lastSuccessfulHealthCheck,
      timeSinceLastHealthCheck: Date.now() - this.lastSuccessfulHealthCheck,
      missedHeartbeats: this.missedHeartbeats,
      lastHeartbeatReceived: this.lastHeartbeatReceived,
      timeSinceLastHeartbeat: Date.now() - this.lastHeartbeatReceived,
    };
  }
}

export const webSocketService = new WebSocketService();