// src/services/WebSocketService.ts
import { Client } from '@stomp/stompjs';
import SockJS from 'sockjs-client';
import env from '../config/environment';

// Type des abonnements
export type SubscriptionCallback = (notification: OrderNotification) => void;

// Interface pour les notifications d'ordre
export interface OrderNotification {
  tenantCode: string;
  orderId: number;
  newState: string;
  previousState: string;
}

class WebSocketService {
  private client: Client | null = null;
  private subscriptions: Map<string, SubscriptionCallback[]> = new Map();
  private isConnected: boolean = false;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 5;
  private reconnectDelay: number = 3000; // 3 secondes
  
  // Initialiser la connexion WebSocket
  connect(tenantCode: string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (this.isConnected) {
        resolve();
        return;
      }
      
      this.client = new Client({
        webSocketFactory: () => {
            const socket = new SockJS(`${env.apiUrl}/api/order/ws`);
            // S'assurer que les informations d'authentification sont envoyées
            socket.withCredentials = true;
            return socket;
          },
        debug: function(str) {
          console.log('STOMP: ' + str);
        },
        reconnectDelay: this.reconnectDelay,
        heartbeatIncoming: 4000,
        heartbeatOutgoing: 4000,
        
        onConnect: () => {
          console.log('WebSocket connected');
          this.isConnected = true;
          this.reconnectAttempts = 0;
          
          // S'abonner au sujet pour ce tenant
          this.subscribeToTopic(tenantCode);
          
          resolve();
        },
        
        onStompError: (frame) => {
          console.error('STOMP error:', frame);
          this.isConnected = false;
          reject(new Error(`WebSocket connection error: ${frame.headers?.message || 'Unknown error'}`));
        },
        
        onWebSocketClose: () => {
          console.log('WebSocket closed');
          this.isConnected = false;
          
          // Gérer les reconnexions
          if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            console.log(`Attempting to reconnect (${this.reconnectAttempts}/${this.maxReconnectAttempts})...`);
          }
        },
      });
      
      this.client.activate();
    });
  }
  
  // S'abonner au sujet spécifique au tenant
  private subscribeToTopic(tenantCode: string): void {
    if (!this.client || !this.isConnected) return;
    
    const destination = `/topic/orders/${tenantCode}`;
    
    this.client.subscribe(destination, (message) => {
      try {
        const notification: OrderNotification = JSON.parse(message.body);
        console.log('Received notification:', notification);
        
        // Appeler tous les callbacks enregistrés pour ce tenant
        const callbacks = this.subscriptions.get(tenantCode) || [];
        callbacks.forEach(callback => callback(notification));
      } catch (err) {
        console.error('Error processing WebSocket message:', err);
      }
    });
  }
  
  // Ajouter un callback pour les notifications
  addSubscription(tenantCode: string, callback: SubscriptionCallback): () => void {
    // Créer l'entrée pour ce tenant si elle n'existe pas
    if (!this.subscriptions.has(tenantCode)) {
      this.subscriptions.set(tenantCode, []);
    }
    
    // Ajouter le callback
    const callbacks = this.subscriptions.get(tenantCode)!;
    callbacks.push(callback);
    
    // Retourner une fonction pour se désabonner
    return () => {
      const index = callbacks.indexOf(callback);
      if (index !== -1) {
        callbacks.splice(index, 1);
      }
    };
  }
  
  // Déconnecter le client WebSocket
  disconnect(): void {
    if (this.client && this.isConnected) {
      this.client.deactivate();
      this.isConnected = false;
      this.subscriptions.clear();
      console.log('WebSocket disconnected');
    }
  }
}

// Singleton pour être utilisé dans toute l'application
export const webSocketService = new WebSocketService();