// src/services/index.ts
/**
 * Export centralisé de tous les services
 * Facilite les imports et évite les dépendances circulaires
 */

// Types partagés
export {
  ConnectionStatus,
  OrderNotificationStatus,
  OrderNotification,
  SocketStats,
  WebSocketStats,
  EventCallback,
  StatusCallback,
  SubscriptionCallback,
  ConnectionStatusCallback,
  NotificationCallback,
  ErrorCallback
} from './types/WebSocketTypes';

// Services Socket.io (principal)
export { socketIOService } from './SocketIOService';

// Gestionnaires
export { ConnectionManager } from './ConnectionManager';
export type { ConnectionConfig, ConnectionState } from './ConnectionManager';

export { NotificationHandler } from './NotificationHandler';
export type { NotificationQueue, NotificationStats } from './NotificationHandler';

// ⚠️ WebSocketService est déprécié - utilisez SocketIOService