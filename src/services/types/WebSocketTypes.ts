// src/services/types/WebSocketTypes.ts
/**
 * Types partagés pour les services WebSocket et Socket.io
 * Ce fichier évite les dépendances circulaires en centralisant les types
 */

// ============================================================================
// ENUMS
// ============================================================================

export enum ConnectionStatus {
  CONNECTING = "CONNECTING",
  CONNECTED = "CONNECTED",
  DISCONNECTED = "DISCONNECTED",
  RECONNECTING = "RECONNECTING",
  FAILED = "FAILED",
  AUTHENTICATED = "AUTHENTICATED",
  ERROR = "ERROR",
  SERVER_DOWN = "SERVER_DOWN"
}

export enum OrderNotificationStatus {
  NEW_ORDER = "NEW_ORDER",
  DISH_UPDATE = "DISH_UPDATE",
  PAYMENT_UPDATE = "PAYMENT_UPDATE",
  TABLE_STATUS_UPDATE = "TABLE_STATUS_UPDATE",
  DEBT_VALIDATION_REQUEST = "DEBT_VALIDATION_REQUEST",
  DEBT_VALIDATION_APPROVED = "DEBT_VALIDATION_APPROVED",
  DEBT_VALIDATION_REJECTED = "DEBT_VALIDATION_REJECTED",
  ORDER_CLOSED_WITH_DEBT = "ORDER_CLOSED_WITH_DEBT"
}

// ============================================================================
// INTERFACES
// ============================================================================

export interface OrderNotification {
  orderId: number;
  tableId: number;
  tenantCode: string;
  newState: string;
  previousState: string;
  tableState: "FREE" | "OCCUPIED" | "RESERVED";
  orderStatus: OrderNotificationStatus;
  timestamp: string;
  itemId?: number;
  metadata?: Record<string, any>;
}

export interface SocketStats {
  isConnected: boolean;
  connectionStatus: ConnectionStatus;
  reconnectAttempts: number;
  lastConnectionTime: number;
  lastDisconnectionTime: number;
  messagesSent: number;
  messagesReceived: number;
  errors: number;
  latency: number;
  transport: string | null;
}

export interface WebSocketStats {
  isConnected: boolean;
  currentStatus: ConnectionStatus;
  currentTenant: string | null;
  reconnectAttempts: number;
  maxReconnectAttempts: number;
  subscriptionsCount: number;
  clientState: boolean;
  verboseLogging: boolean;
  lastDisconnectTime: number;
  timeSinceLastDisconnect: number;
  isServerHealthy: boolean;
  lastSuccessfulHealthCheck: number;
  timeSinceLastHealthCheck: number;
  missedHeartbeats: number;
  lastHeartbeatReceived: number;
  timeSinceLastHeartbeat: number;
}

// ============================================================================
// TYPE ALIASES
// ============================================================================

export type EventCallback = (data: any) => void;
export type StatusCallback = (status: ConnectionStatus) => void;
export type SubscriptionCallback = (notification: OrderNotification) => void;
export type ConnectionStatusCallback = (status: ConnectionStatus) => void;
export type NotificationCallback = (notification: OrderNotification) => void;
export type ErrorCallback = (error: Error, notification: OrderNotification) => void;