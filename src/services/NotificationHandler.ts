// src/services/NotificationHandler.ts
import { OrderNotification, OrderNotificationStatus } from './SocketIOService';

export interface NotificationQueue {
  pending: OrderNotification[];
  processed: OrderNotification[];
  failed: OrderNotification[];
}

export interface NotificationStats {
  totalReceived: number;
  totalProcessed: number;
  totalFailed: number;
  byType: Record<string, number>;
  lastProcessedAt: number;
}

type NotificationCallback = (notification: OrderNotification) => void;
type ErrorCallback = (error: Error, notification: OrderNotification) => void;

/**
 * Gestionnaire centralisé pour le traitement des notifications
 */
export class NotificationHandler {
  private queue: NotificationQueue = {
    pending: [],
    processed: [],
    failed: []
  };
  
  private stats: NotificationStats = {
    totalReceived: 0,
    totalProcessed: 0,
    totalFailed: 0,
    byType: {},
    lastProcessedAt: 0
  };
  
  private callbacks: Map<OrderNotificationStatus, Set<NotificationCallback>> = new Map();
  private globalCallbacks: Set<NotificationCallback> = new Set();
  private errorCallbacks: Set<ErrorCallback> = new Set();
  
  private isProcessing: boolean = false;
  private maxQueueSize: number = 100;
  private maxRetries: number = 3;
  
  constructor() {
    console.log('[NotificationHandler] Initialized');
  }
  
  /**
   * Traiter une notification entrante
   */
  async processNotification(notification: OrderNotification): Promise<void> {
    // Validation
    if (!this.validateNotification(notification)) {
      console.error('[NotificationHandler] Invalid notification:', notification);
      return;
    }
    
    // Enrichir avec timestamp si absent
    if (!notification.timestamp) {
      notification.timestamp = new Date().toISOString();
    }
    
    // Statistiques
    this.stats.totalReceived++;
    this.stats.byType[notification.orderStatus] = 
      (this.stats.byType[notification.orderStatus] || 0) + 1;
    
    // Ajouter à la queue
    this.addToQueue(notification);
    
    // Traiter immédiatement si possible
    if (!this.isProcessing) {
      await this.processQueue();
    }
  }
  
  /**
   * Valider une notification
   */
  private validateNotification(notification: any): notification is OrderNotification {
    if (!notification) return false;
    
    // Vérifier les champs requis
    const requiredFields = ['orderId', 'tableId', 'tenantCode', 'orderStatus'];
    for (const field of requiredFields) {
      if (notification[field] === undefined || notification[field] === null) {
        console.warn(`[NotificationHandler] Missing required field: ${field}`);
        return false;
      }
    }
    
    // Vérifier le type d'événement
    if (!Object.values(OrderNotificationStatus).includes(notification.orderStatus)) {
      console.warn(`[NotificationHandler] Unknown order status: ${notification.orderStatus}`);
      return false;
    }
    
    return true;
  }
  
  /**
   * Ajouter à la queue
   */
  private addToQueue(notification: OrderNotification): void {
    // Vérifier la taille de la queue
    if (this.queue.pending.length >= this.maxQueueSize) {
      console.warn('[NotificationHandler] Queue full, removing oldest notification');
      this.queue.pending.shift();
    }
    
    // Ajouter à la fin
    this.queue.pending.push(notification);
    
    console.log(`[NotificationHandler] Added to queue (size: ${this.queue.pending.length})`);
  }
  
  /**
   * Traiter la queue de notifications
   */
  private async processQueue(): Promise<void> {
    if (this.isProcessing || this.queue.pending.length === 0) {
      return;
    }
    
    this.isProcessing = true;
    
    while (this.queue.pending.length > 0) {
      const notification = this.queue.pending.shift()!;
      
      try {
        await this.handleNotification(notification);
        
        // Ajouter aux notifications traitées
        this.queue.processed.push(notification);
        if (this.queue.processed.length > this.maxQueueSize) {
          this.queue.processed.shift();
        }
        
        this.stats.totalProcessed++;
        this.stats.lastProcessedAt = Date.now();
        
      } catch (error: any) {
        console.error('[NotificationHandler] Error processing notification:', error);
        
        // Gérer les erreurs
        this.handleError(error, notification);
        
        // Ajouter aux notifications échouées
        this.queue.failed.push(notification);
        if (this.queue.failed.length > 50) {
          this.queue.failed.shift();
        }
        
        this.stats.totalFailed++;
      }
    }
    
    this.isProcessing = false;
  }
  
  /**
   * Traiter une notification spécifique
   */
  private async handleNotification(notification: OrderNotification): Promise<void> {
    console.log('[NotificationHandler] Processing notification:', notification.orderStatus);
    
    // Appeler les callbacks spécifiques au type
    const typeCallbacks = this.callbacks.get(notification.orderStatus);
    if (typeCallbacks) {
      for (const callback of typeCallbacks) {
        try {
          await Promise.resolve(callback(notification));
        } catch (error) {
          console.error('[NotificationHandler] Error in type callback:', error);
          throw error;
        }
      }
    }
    
    // Appeler les callbacks globaux
    for (const callback of this.globalCallbacks) {
      try {
        await Promise.resolve(callback(notification));
      } catch (error) {
        console.error('[NotificationHandler] Error in global callback:', error);
        throw error;
      }
    }
  }
  
  /**
   * Gérer les erreurs de traitement
   */
  private handleError(error: Error, notification: OrderNotification): void {
    // Notifier les callbacks d'erreur
    this.errorCallbacks.forEach(callback => {
      try {
        callback(error, notification);
      } catch (err) {
        console.error('[NotificationHandler] Error in error callback:', err);
      }
    });
  }
  
  /**
   * S'abonner à un type de notification spécifique
   */
  onNotificationType(
    type: OrderNotificationStatus, 
    callback: NotificationCallback
  ): () => void {
    if (!this.callbacks.has(type)) {
      this.callbacks.set(type, new Set());
    }
    
    this.callbacks.get(type)!.add(callback);
    
    console.log(`[NotificationHandler] Subscribed to ${type} notifications`);
    
    return () => {
      const callbacks = this.callbacks.get(type);
      if (callbacks) {
        callbacks.delete(callback);
      }
    };
  }
  
  /**
   * S'abonner à toutes les notifications
   */
  onAnyNotification(callback: NotificationCallback): () => void {
    this.globalCallbacks.add(callback);
    
    console.log('[NotificationHandler] Subscribed to all notifications');
    
    return () => {
      this.globalCallbacks.delete(callback);
    };
  }
  
  /**
   * S'abonner aux erreurs
   */
  onError(callback: ErrorCallback): () => void {
    this.errorCallbacks.add(callback);
    
    return () => {
      this.errorCallbacks.delete(callback);
    };
  }
  
  /**
   * Obtenir les notifications par type
   */
  getNotificationsByType(type: OrderNotificationStatus): OrderNotification[] {
    return [
      ...this.queue.pending,
      ...this.queue.processed
    ].filter(n => n.orderStatus === type);
  }
  
  /**
   * Obtenir les notifications pour une table
   */
  getNotificationsByTable(tableId: number): OrderNotification[] {
    return [
      ...this.queue.pending,
      ...this.queue.processed
    ].filter(n => n.tableId === tableId);
  }
  
  /**
   * Obtenir les notifications pour une commande
   */
  getNotificationsByOrder(orderId: number): OrderNotification[] {
    return [
      ...this.queue.pending,
      ...this.queue.processed
    ].filter(n => n.orderId === orderId);
  }
  
  /**
   * Obtenir les dernières notifications
   */
  getRecentNotifications(limit: number = 10): OrderNotification[] {
    const all = [...this.queue.processed].reverse();
    return all.slice(0, limit);
  }
  
  /**
   * Obtenir les statistiques
   */
  getStats(): NotificationStats {
    return { ...this.stats };
  }
  
  /**
   * Obtenir l'état de la queue
   */
  getQueueState(): {
    pending: number;
    processed: number;
    failed: number;
  } {
    return {
      pending: this.queue.pending.length,
      processed: this.queue.processed.length,
      failed: this.queue.failed.length
    };
  }
  
  /**
   * Vider la queue
   */
  clearQueue(): void {
    this.queue.pending = [];
    console.log('[NotificationHandler] Queue cleared');
  }
  
  /**
   * Vider l'historique
   */
  clearHistory(): void {
    this.queue.processed = [];
    this.queue.failed = [];
    console.log('[NotificationHandler] History cleared');
  }
  
  /**
   * Réinitialiser les statistiques
   */
  resetStats(): void {
    this.stats = {
      totalReceived: 0,
      totalProcessed: 0,
      totalFailed: 0,
      byType: {},
      lastProcessedAt: 0
    };
    console.log('[NotificationHandler] Stats reset');
  }
  
  /**
   * Nettoyer les ressources
   */
  destroy(): void {
    this.clearQueue();
    this.clearHistory();
    this.callbacks.clear();
    this.globalCallbacks.clear();
    this.errorCallbacks.clear();
    console.log('[NotificationHandler] Destroyed');
  }
}