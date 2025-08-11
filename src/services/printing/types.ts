// src/services/printing/types.ts

/**
 * Types et interfaces pour le module d'impression
 */

// Types d'imprimantes
export enum PrinterType {
  KITCHEN = 'KITCHEN',
  CASHIER = 'CASHIER',
  BAR = 'BAR',
  GENERAL = 'GENERAL'
}

// État de connexion
export enum ConnectionStatus {
  CONNECTED = 'CONNECTED',
  DISCONNECTED = 'DISCONNECTED',
  CONNECTING = 'CONNECTING',
  ERROR = 'ERROR'
}

// Type de document à imprimer
export enum DocumentType {
  RECEIPT = 'RECEIPT',        // Reçu de paiement
  KITCHEN_ORDER = 'KITCHEN_ORDER', // Commande cuisine
  BILL = 'BILL',              // Addition
  INVOICE = 'INVOICE',        // Facture
  REPORT = 'REPORT'           // Rapport
}

// Configuration d'une imprimante
export interface PrinterConfig {
  id: string;
  name: string;
  displayName: string;
  ipAddress: string;
  port: number;
  macAddress?: string;
  type: PrinterType;
  isDefault: boolean;
  isEnabled: boolean;
  
  // Paramètres de connexion
  connectionType: 'TCP' | 'BLUETOOTH';
  timeout: number; // en ms
  maxRetries: number;
  
  // Paramètres d'impression
  paperWidth: 58 | 80; // en mm
  charset: 'UTF-8' | 'CP437' | 'CP850' | 'CP860' | 'CP863';
  fontSize: 'small' | 'normal' | 'large';
  cutPaper: boolean;
  openCashDrawer: boolean;
  beepAfterPrint: boolean;
  
  // Métadonnées
  createdAt: string;
  updatedAt: string;
  lastSeenAt?: string;
  lastPrintAt?: string;
  
  // Statut
  status: ConnectionStatus;
  errorMessage?: string;
}

// Document à imprimer
export interface PrintDocument {
  id: string;
  type: DocumentType;
  targetPrinterType: PrinterType;
  priority: 'low' | 'normal' | 'high' | 'urgent';
  data: any; // Données spécifiques selon le type
  metadata: {
    orderId?: number;
    tableId?: number;
    tableName?: string;
    serverName?: string;
    timestamp: string;
  };
  retryCount?: number;
  maxRetries?: number;
}

// Job d'impression dans la file d'attente
export interface PrintJob {
  id: string;
  document: PrintDocument;
  printerId: string;
  status: 'pending' | 'printing' | 'completed' | 'failed' | 'cancelled';
  createdAt: string;
  startedAt?: string;
  completedAt?: string;
  error?: string;
  retryCount: number;
}

// Données pour un reçu
export interface ReceiptData {
  orderId: number;
  tableName: string;
  items: Array<{
    quantity: number;
    name: string;
    unitPrice: number;
    totalPrice: number;
    notes?: string;
  }>;
  subtotal: number;
  tax: number;
  discount?: number;
  total: number;
  paidAmount: number;
  change: number;
  paymentMethod: string;
  serverName: string;
  customerName?: string;
  restaurantInfo: {
    name: string;
    address?: string;
    phone?: string;
    taxId?: string;
  };
}

// Données pour une commande cuisine
export interface KitchenOrderData {
  orderId: number;
  tableId: number;
  tableName: string;
  items: Array<{
    quantity: number;
    name: string;
    notes?: string;
    category?: string;
    preparationTime?: number;
  }>;
  serverName: string;
  orderTime: string;
  priority?: 'normal' | 'rush';
  specialInstructions?: string;
}

// Données pour une addition
export interface BillData {
  orderId: number;
  tableName: string;
  items: Array<{
    quantity: number;
    name: string;
    unitPrice: number;
    totalPrice: number;
  }>;
  subtotal: number;
  tax: number;
  serviceCharge?: number;
  total: number;
  currency: string;
  serverName: string;
  covers?: number; // Nombre de couverts
}

// Résultat de découverte d'imprimante
export interface DiscoveredPrinter {
  ipAddress: string;
  port: number;
  hostname?: string;
  macAddress?: string;
  manufacturer?: string;
  model?: string;
  isResponding: boolean;
}

// Options de découverte
export interface DiscoveryOptions {
  timeout: number;
  ports: number[];
  subnet?: string;
  concurrent: number; // Nombre de requêtes simultanées
}

// Réponse d'impression
export interface PrintResult {
  success: boolean;
  jobId?: string;
  printerId?: string;
  timestamp: string;
  error?: string;
  details?: any;
}

// Événements du système d'impression
export enum PrintEvent {
  PRINTER_CONNECTED = 'PRINTER_CONNECTED',
  PRINTER_DISCONNECTED = 'PRINTER_DISCONNECTED',
  PRINT_STARTED = 'PRINT_STARTED',
  PRINT_COMPLETED = 'PRINT_COMPLETED',
  PRINT_FAILED = 'PRINT_FAILED',
  QUEUE_UPDATED = 'QUEUE_UPDATED',
  DISCOVERY_STARTED = 'DISCOVERY_STARTED',
  DISCOVERY_COMPLETED = 'DISCOVERY_COMPLETED',
  PRINTER_FOUND = 'PRINTER_FOUND'
}

// Callback pour les événements
export type PrintEventCallback = (event: PrintEvent, data?: any) => void;

// Options d'impression
export interface PrintOptions {
  copies?: number;
  preview?: boolean;
  forcePrint?: boolean; // Ignorer la file d'attente
  waitForCompletion?: boolean;
  timeout?: number;
}

// Configuration du module d'impression
export interface PrintModuleConfig {
  enableQueue: boolean;
  enableAutoDiscovery: boolean;
  enableHealthCheck: boolean;
  healthCheckInterval: number; // en secondes
  maxQueueSize: number;
  defaultTimeout: number;
  defaultCharset: string;
  logLevel: 'none' | 'error' | 'warn' | 'info' | 'debug';
}