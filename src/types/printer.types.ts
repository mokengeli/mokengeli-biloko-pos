// src/types/printer.types.ts

/**
 * Types et interfaces pour le système d'impression
 * Conçu pour être indépendant de l'implémentation
 */

// Types de base
export type PrinterConnectionType = 'TCP' | 'BLUETOOTH' | 'USB';
export type PrinterProtocol = 'ESC_POS' | 'STAR_LINE' | 'CUSTOM';
export type PrinterBrand = 'EPSON' | 'STAR' | 'MUNBYN' | 'GENERIC';
export type PaperWidth = 58 | 80; // en mm

// Types de destinations d'impression
export enum PrintDestination {
  KITCHEN = 'KITCHEN',
  BAR = 'BAR',
  CASHIER = 'CASHIER',
  CUSTOMER = 'CUSTOMER',
  OFFICE = 'OFFICE'
}

// Types de documents
export enum DocumentType {
  RECEIPT = 'RECEIPT',
  KITCHEN_TICKET = 'KITCHEN_TICKET',
  BILL = 'BILL',
  INVOICE = 'INVOICE',
  REPORT = 'REPORT'
}

// Statuts
export enum PrinterStatus {
  CONNECTED = 'CONNECTED',
  DISCONNECTED = 'DISCONNECTED',
  CONNECTING = 'CONNECTING',
  ERROR = 'ERROR',
  UNKNOWN = 'UNKNOWN'
}

export enum PrintJobStatus {
  PENDING = 'PENDING',
  PRINTING = 'PRINTING',
  COMPLETED = 'COMPLETED',
  FAILED = 'FAILED',
  CANCELLED = 'CANCELLED'
}

// Priorités d'impression
export enum PrintPriority {
  LOW = 0,
  NORMAL = 1,
  HIGH = 2,
  URGENT = 3
}

// Configuration de destination
export interface PrinterDestinationConfig {
  destination: PrintDestination;
  enabled: boolean;
  autoPrint: boolean;
  copies: number;
  priority: PrintPriority;
}

// Configuration d'une imprimante
export interface PrinterConfig {
  id: string;
  name: string;
  description?: string;
  connectionType: PrinterConnectionType;
  protocol: PrinterProtocol;
  brand: PrinterBrand;
  
  // Paramètres de connexion
  connectionParams: {
    ip?: string;
    port?: number;
    macAddress?: string;
    deviceId?: string;
    timeout?: number;
  };
  
  // Paramètres d'impression
  printSettings: {
    paperWidth: PaperWidth;
    charset?: string;
    codepage?: number;
    density?: number;
    feedLines?: number;
  };
  
  // Destinations assignées
  destinations: PrinterDestinationConfig[];
  
  // Métadonnées
  isDefault: boolean;
  isActive: boolean;
  lastConnectedAt?: Date;
  createdAt: Date;
  updatedAt: Date;
}

// Job d'impression
export interface PrintJob {
  id: string;
  printerId: string;
  documentType: DocumentType;
  priority: PrintPriority;
  status: PrintJobStatus;
  
  // Contenu à imprimer
  content: PrintContent;
  
  // Métadonnées
  retryCount: number;
  maxRetries: number;
  createdAt: Date;
  startedAt?: Date;
  completedAt?: Date;
  error?: string;
  
  // Contexte métier
  metadata?: {
    orderId?: number;
    tableId?: number;
    tableName?: string;
    userId?: string;
    [key: string]: any;
  };
}

// Contenu à imprimer (abstrait)
export interface PrintContent {
  type: 'TEXT' | 'FORMATTED' | 'RAW';
  data: string | Buffer | FormattedDocument;
}

// Document formaté
export interface FormattedDocument {
  header?: DocumentSection;
  body: DocumentSection[];
  footer?: DocumentSection;
  settings?: {
    cutPaper?: boolean;
    openCashDrawer?: boolean;
    beep?: boolean;
  };
}

// Section d'un document
export interface DocumentSection {
  type: 'TEXT' | 'LINE' | 'BARCODE' | 'QRCODE' | 'IMAGE' | 'TABLE';
  alignment?: 'LEFT' | 'CENTER' | 'RIGHT';
  style?: {
    bold?: boolean;
    underline?: boolean;
    fontSize?: 'NORMAL' | 'SMALL' | 'LARGE' | 'EXTRA_LARGE';
    inverted?: boolean;
  };
  content: any;
}

// Résultat de scan réseau
export interface DiscoveredPrinter {
  ip: string;
  port: number;
  name?: string;
  manufacturer?: string;
  model?: string;
  protocol?: PrinterProtocol;
}

// Événements du système d'impression
export interface PrinterEvent {
  type: 'STATUS_CHANGED' | 'JOB_COMPLETED' | 'JOB_FAILED' | 'ERROR';
  printerId?: string;
  jobId?: string;
  data?: any;
  timestamp: Date;
}

// Callbacks
export type PrinterEventCallback = (event: PrinterEvent) => void;
export type PrintJobProgressCallback = (jobId: string, progress: number) => void;

// Interface pour un adaptateur de connexion (abstrait)
export interface IPrinterConnection {
  connect(params: any): Promise<boolean>;
  disconnect(): Promise<void>;
  isConnected(): boolean;
  send(data: Buffer | string): Promise<void>;
  getStatus(): Promise<PrinterStatus>;
  test(): Promise<boolean>;
}

// Interface pour un formateur de documents (abstrait)
export interface IDocumentFormatter {
  format(document: FormattedDocument, settings: any): Buffer | string;
  formatText(text: string, style?: any): Buffer | string;
  formatBarcode(data: string, type: string): Buffer | string;
  formatQRCode(data: string): Buffer | string;
}

// Interface pour le service d'impression (abstrait)
export interface IPrinterService {
  // Gestion des imprimantes
  addPrinter(config: PrinterConfig): Promise<string>;
  updatePrinter(id: string, config: Partial<PrinterConfig>): Promise<void>;
  removePrinter(id: string): Promise<void>;
  getPrinter(id: string): Promise<PrinterConfig | null>;
  getAllPrinters(): Promise<PrinterConfig[]>;
  
  // Connexion
  connectPrinter(id: string): Promise<boolean>;
  disconnectPrinter(id: string): Promise<void>;
  testPrinter(id: string): Promise<boolean>;
  getPrinterStatus(id: string): Promise<PrinterStatus>;
  
  // Impression
  print(printerId: string, content: PrintContent, options?: any): Promise<string>;
  printToDestination(destination: PrintDestination, content: PrintContent): Promise<string[]>;
  
  // File d'attente
  getQueue(): Promise<PrintJob[]>;
  cancelJob(jobId: string): Promise<void>;
  retryJob(jobId: string): Promise<void>;
  
  // Découverte
  discoverPrinters(): Promise<DiscoveredPrinter[]>;
  
  // Événements
  addEventListener(callback: PrinterEventCallback): () => void;
}

// Configuration par défaut
export const DEFAULT_PRINTER_SETTINGS = {
  paperWidth: 80 as PaperWidth,
  charset: 'UTF-8',
  codepage: 0,
  density: 8,
  feedLines: 3,
  timeout: 5000,
  port: 9100,
  maxRetries: 3
};

// Mapping des destinations vers les types de documents
export const DESTINATION_DOCUMENT_MAP: Record<PrintDestination, DocumentType[]> = {
  [PrintDestination.KITCHEN]: [DocumentType.KITCHEN_TICKET],
  [PrintDestination.BAR]: [DocumentType.KITCHEN_TICKET],
  [PrintDestination.CASHIER]: [DocumentType.RECEIPT, DocumentType.REPORT],
  [PrintDestination.CUSTOMER]: [DocumentType.BILL, DocumentType.INVOICE, DocumentType.RECEIPT],
  [PrintDestination.OFFICE]: [DocumentType.REPORT, DocumentType.INVOICE]
};