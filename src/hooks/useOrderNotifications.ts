// ============================================================================
// src/hooks/useOrderNotifications.ts
// ============================================================================

import { useEffect, useState, useCallback, useRef } from 'react';
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
  
  // ✅ CORRECTION RACE CONDITION: Stabiliser onNotification avec useRef
  const onNotificationRef = useRef(onNotification);
  onNotificationRef.current = onNotification;
  
  // Callback stable qui ne change jamais
  const stableOnNotification = useCallback((notification: OrderNotification) => {
    if (onNotificationRef.current) {
      onNotificationRef.current(notification);
    }
  }, []); // ✅ Pas de dépendances = callback stable
  
  // S'abonner aux notifications avec robustesse
  useEffect(() => {
    const unsubscribe = socketIOService.on('order:notification', (notification: OrderNotification) => {
      try {
        // ✅ VALIDATION: Vérifier que la notification est valide
        if (!notification) {
          console.warn('[useOrderNotifications] Received null/undefined notification');
          return;
        }
        
        // Validation des champs critiques
        if (typeof notification.orderId !== 'number' || notification.orderId <= 0) {
          console.warn('[useOrderNotifications] Invalid orderId:', notification);
          return;
        }
        
        if (!notification.orderStatus) {
          console.warn('[useOrderNotifications] Missing orderStatus:', notification);
          return;
        }
        
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
        
        // Ajouter à la liste avec protection
        setNotifications(prev => {
          try {
            return [...prev, notification];
          } catch (error) {
            console.error('[useOrderNotifications] Error updating notifications list:', error);
            return prev; // Garder l'ancienne liste si erreur
          }
        });
        
        setLastNotification(notification);
        
        // ✅ CORRECTION: Utiliser le callback stable
        try {
          stableOnNotification(notification);
        } catch (error) {
          console.error('[useOrderNotifications] Error in onNotification callback:', error, notification);
          // Ne pas faire planter l'app, juste logger l'erreur
        }
        
      } catch (error) {
        console.error('[useOrderNotifications] Critical error handling notification:', error, notification);
        // En cas d'erreur critique, ne pas faire planter l'app
      }
    });
    
    return unsubscribe;
  }, [tableId, orderId, types, stableOnNotification]); // ✅ CORRECTION: stableOnNotification ne change jamais
  
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



