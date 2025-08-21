// src/hooks/useSocketConnection.ts
import { useEffect, useState, useCallback, useRef } from 'react';
import { socketIOService, ConnectionStatus } from '../services/SocketIOService';
import { useAuth } from '../contexts/AuthContext';
import { Snackbar } from 'react-native-paper';

export interface UseSocketConnectionOptions {
  autoConnect?: boolean;
  showStatusNotifications?: boolean;
  reconnectOnFocus?: boolean;
}

export interface SocketConnectionState {
  status: ConnectionStatus;
  isConnected: boolean;
  isAuthenticated: boolean;
  socketId?: string;
  error?: Error;
  stats: any;
}

/**
 * Hook pour gérer la connexion Socket.io
 */
export function useSocketConnection(options: UseSocketConnectionOptions = {}) {
  const {
    autoConnect = true,
    showStatusNotifications = true,
    reconnectOnFocus = true
  } = options;
  
  const { user } = useAuth();
  const [state, setState] = useState<SocketConnectionState>({
    status: ConnectionStatus.DISCONNECTED,
    isConnected: false,
    isAuthenticated: false,
    stats: {}
  });
  
  const [notification, setNotification] = useState<{
    visible: boolean;
    message: string;
    type: 'info' | 'error' | 'success';
  }>({
    visible: false,
    message: '',
    type: 'info'
  });
  
  const isConnecting = useRef(false);
  
  // Connexion
  const connect = useCallback(async () => {
    if (!user?.tenantCode || isConnecting.current) {
      console.log('[useSocketConnection] Cannot connect - no tenant or already connecting');
      return;
    }
    
    isConnecting.current = true;
    
    try {
      await socketIOService.connect(user.tenantCode);
      
      setState(prev => ({
        ...prev,
        isConnected: true,
        socketId: socketIOService.getSocketId(),
        error: undefined
      }));
      
      if (showStatusNotifications) {
        setNotification({
          visible: true,
          message: 'Connecté au serveur',
          type: 'success'
        });
      }
      
    } catch (error: any) {
      console.error('[useSocketConnection] Connection error:', error);
      
      setState(prev => ({
        ...prev,
        isConnected: false,
        error
      }));
      
      if (showStatusNotifications) {
        setNotification({
          visible: true,
          message: `Erreur de connexion: ${error.message}`,
          type: 'error'
        });
      }
    } finally {
      isConnecting.current = false;
    }
  }, [user?.tenantCode, showStatusNotifications]);
  
  // Déconnexion
  const disconnect = useCallback(async () => {
    await socketIOService.disconnect();
    
    setState(prev => ({
      ...prev,
      status: ConnectionStatus.DISCONNECTED,
      isConnected: false,
      isAuthenticated: false,
      socketId: undefined
    }));
    
    if (showStatusNotifications) {
      setNotification({
        visible: true,
        message: 'Déconnecté',
        type: 'info'
      });
    }
  }, [showStatusNotifications]);
  
  // Reconnexion
  const reconnect = useCallback(async () => {
    await socketIOService.reconnect();
  }, []);
  
  // Écouter les changements de statut
  useEffect(() => {
    const unsubscribe = socketIOService.onStatusChange((status) => {
      setState(prev => ({
        ...prev,
        status,
        isConnected: status === ConnectionStatus.CONNECTED || status === ConnectionStatus.AUTHENTICATED,
        isAuthenticated: status === ConnectionStatus.AUTHENTICATED
      }));
      
      // Notifications de statut
      if (showStatusNotifications) {
        switch (status) {
          case ConnectionStatus.RECONNECTING:
            setNotification({
              visible: true,
              message: 'Reconnexion en cours...',
              type: 'info'
            });
            break;
          case ConnectionStatus.FAILED:
            setNotification({
              visible: true,
              message: 'Connexion échouée',
              type: 'error'
            });
            break;
        }
      }
    });
    
    return unsubscribe;
  }, [showStatusNotifications]);
  
  // Mise à jour des statistiques
  useEffect(() => {
    const interval = setInterval(() => {
      setState(prev => ({
        ...prev,
        stats: socketIOService.getStats()
      }));
    }, 5000);
    
    return () => clearInterval(interval);
  }, []);
  
  // Auto-connexion
  useEffect(() => {
    if (autoConnect && user?.tenantCode && !isConnecting.current) {
      connect();
    }
    
    return () => {
      if (autoConnect) {
        disconnect();
      }
    };
  }, [autoConnect, user?.tenantCode]);
  
  // Émission d'événements
  const emit = useCallback((event: string, data: any, callback?: (response: any) => void) => {
    socketIOService.emit(event, data, callback);
  }, []);
  
  return {
    ...state,
    connect,
    disconnect,
    reconnect,
    emit,
    notification,
    dismissNotification: () => setNotification(prev => ({ ...prev, visible: false }))
  };
}

// ============================================================================
// src/hooks/useOrderNotifications.ts
// ============================================================================

import { useEffect, useState, useCallback } from 'react';
import { socketIOService, OrderNotification, OrderNotificationStatus } from '../services/SocketIOService';

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

// ============================================================================
// src/hooks/useSocketEvent.ts
// ============================================================================

import { useEffect, useRef } from 'react';
import { socketIOService } from '../services/SocketIOService';

/**
 * Hook pour écouter un événement Socket.io spécifique
 */
export function useSocketEvent<T = any>(
  eventName: string,
  callback: (data: T) => void,
  deps: any[] = []
) {
  const callbackRef = useRef(callback);
  
  // Mettre à jour la référence du callback
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);
  
  useEffect(() => {
    const unsubscribe = socketIOService.on(eventName, (data: T) => {
      callbackRef.current(data);
    });
    
    return unsubscribe;
  }, [eventName, ...deps]);
}

// ============================================================================
// src/hooks/useSocketEmit.ts
// ============================================================================

import { useCallback } from 'react';
import { socketIOService } from '../services/SocketIOService';

/**
 * Hook pour émettre des événements Socket.io
 */
export function useSocketEmit() {
  const emit = useCallback((event: string, data: any): Promise<any> => {
    return new Promise((resolve, reject) => {
      socketIOService.emit(event, data, (response: any) => {
        if (response?.error) {
          reject(new Error(response.error));
        } else {
          resolve(response);
        }
      });
    });
  }, []);
  
  const emitAsync = useCallback(async (event: string, data: any): Promise<any> => {
    return emit(event, data);
  }, [emit]);
  
  return {
    emit,
    emitAsync
  };
}