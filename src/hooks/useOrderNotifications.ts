// ============================================================================
// src/hooks/useOrderNotifications.ts
// ============================================================================

import { useEffect, useState, useCallback } from 'react';
import { socketIOService } from '../services/SocketIOService';
import { OrderNotification, OrderNotificationStatus } from '../services/types/WebSocketTypes';

export interface UseOrderNotificationsOptions {
  tableId?: number;
  orderId?: number;
  types?: OrderNotificationStatus[];
  onNotification?: (notification: OrderNotification) => void;
}

/**
 * Hook pour écouter les notifications de commande
 */
export function useOrderNotifications(options: UseOrderNotificationsOptions = {}) {
  const { tableId, orderId, types, onNotification } = options;
  
  const [notifications, setNotifications] = useState<OrderNotification[]>([]);
  const [lastNotification, setLastNotification] = useState<OrderNotification | null>(null);
  
  // S'abonner aux notifications
  useEffect(() => {
    const unsubscribe = socketIOService.on('order:notification', (notification: OrderNotification) => {
      // Filtrer par table si spécifié
      if (tableId && notification.tableId !== tableId) {
        return;
      }
      
      // Filtrer par commande si spécifié
      if (orderId && notification.orderId !== orderId) {
        return;
      }
      
      // Filtrer par type si spécifié
      if (types && types.length > 0 && !types.includes(notification.orderStatus)) {
        return;
      }
      
      // Ajouter à la liste
      setNotifications(prev => [...prev, notification]);
      setLastNotification(notification);
      
      // Callback personnalisé
      onNotification?.(notification);
    });
    
    return unsubscribe;
  }, [tableId, orderId, types, onNotification]);
  
  // Effacer les notifications
  const clearNotifications = useCallback(() => {
    setNotifications([]);
    setLastNotification(null);
  }, []);
  
  // Marquer comme lu
  const markAsRead = useCallback((notificationId: number) => {
    setNotifications(prev => 
      prev.map(n => 
        n.orderId === notificationId 
          ? { ...n, read: true } 
          : n
      )
    );
  }, []);
  
  return {
    notifications,
    lastNotification,
    clearNotifications,
    markAsRead,
    count: notifications.length
  };
}



