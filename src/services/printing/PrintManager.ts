// src/services/printing/PrintManager.ts

import { EventEmitter } from 'react-native';
import { 
  PrinterConfig, 
  PrinterType, 
  PrintDocument, 
  DocumentType,
  PrintResult,
  PrintOptions,
  ConnectionStatus,
  PrintEvent,
  PrintEventCallback,
  ReceiptData,
  KitchenOrderData,
  BillData
} from './types';
import { PrinterStorage } from './PrinterStorage';
import { ConnectionManager } from './ConnectionManager';
import { PrintQueue } from './PrintQueue';
import { ReceiptTemplate } from './templates/ReceiptTemplate';
import { KitchenTemplate } from './templates/KitchenTemplate';
import { BillTemplate } from './templates/BillTemplate';

/**
 * Service principal d'impression
 * Gère l'orchestration de tout le système d'impression
 */
export class PrintManager {
  private static instance: PrintManager;
  private storage: PrinterStorage;
  private connectionManager: ConnectionManager;
  private queue: PrintQueue;
  private eventEmitter: EventEmitter;
  private initialized: boolean = false;
  private settings: any;
  
  // Map des catégories vers les types d'imprimantes
  private categoryMapping: Map<string, PrinterType> = new Map();
  
  private constructor() {
    this.storage = PrinterStorage.getInstance();
    this.connectionManager = ConnectionManager.getInstance();
    this.queue = PrintQueue.getInstance();
    this.eventEmitter = new EventEmitter();
  }
  
  /**
   * Obtenir l'instance singleton
   */
  static getInstance(): PrintManager {
    if (!PrintManager.instance) {
      PrintManager.instance = new PrintManager();
    }
    return PrintManager.instance;
  }
  
  /**
   * Initialiser le service d'impression
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    try {
      console.log('[PrintManager] Initializing...');
      
      // Initialiser les composants
      await this.storage.initialize();
      await this.queue.initialize();
      
      // Charger les paramètres
      this.settings = await this.storage.getSettings();
      await this.loadCategoryMapping();
      
      // Configurer les écouteurs de la file d'attente
      this.setupQueueListeners();
      
      // Health check initial si activé
      if (this.settings.enableHealthCheck) {
        this.performHealthCheck().catch(console.error);
      }
      
      this.initialized = true;
      console.log('[PrintManager] Initialized successfully');
      
      // Émettre l'événement d'initialisation
      this.emit(PrintEvent.QUEUE_UPDATED, { status: 'initialized' });
      
    } catch (error) {
      console.error('[PrintManager] Initialization error:', error);
      throw error;
    }
  }
  
  /**
   * Charger le mapping des catégories de plats vers les imprimantes
   */
  private async loadCategoryMapping(): Promise<void> {
    // Charger depuis le stockage ou utiliser la config par défaut
    const mappingData = this.settings.categoryMapping || {
      'Boissons': PrinterType.BAR,
      'Cocktails': PrinterType.BAR,
      'Vins': PrinterType.BAR,
      'Entrées': PrinterType.KITCHEN,
      'Plats': PrinterType.KITCHEN,
      'Desserts': PrinterType.KITCHEN,
      'Cafés': PrinterType.BAR
    };
    
    this.categoryMapping.clear();
    for (const [category, printerType] of Object.entries(mappingData)) {
      this.categoryMapping.set(category, printerType as PrinterType);
    }
  }
  
  /**
   * Configurer les écouteurs de la file d'attente
   */
  private setupQueueListeners(): void {
    // Écouter les changements de la file
    this.queue.on('jobAdded', (job) => {
      this.emit(PrintEvent.QUEUE_UPDATED, { job, action: 'added' });
    });
    
    this.queue.on('jobStarted', (job) => {
      this.emit(PrintEvent.PRINT_STARTED, job);
    });
    
    this.queue.on('jobCompleted', (job) => {
      this.emit(PrintEvent.PRINT_COMPLETED, job);
    });
    
    this.queue.on('jobFailed', (job, error) => {
      this.emit(PrintEvent.PRINT_FAILED, { job, error });
    });
    
    // Démarrer le traitement de la file
    this.queue.startProcessing();
  }
  
  // ============================================================================
  // MÉTHODES PUBLIQUES D'IMPRESSION
  // ============================================================================
  
  /**
   * Imprimer un reçu de paiement
   */
  async printReceipt(
    data: ReceiptData, 
    options?: PrintOptions
  ): Promise<PrintResult> {
    console.log('[PrintManager] Printing receipt for order', data.orderId);
    
    const document: PrintDocument = {
      id: this.generateDocumentId(),
      type: DocumentType.RECEIPT,
      targetPrinterType: PrinterType.CASHIER,
      priority: 'high',
      data,
      metadata: {
        orderId: data.orderId,
        tableName: data.tableName,
        serverName: data.serverName,
        timestamp: new Date().toISOString()
      }
    };
    
    return this.print(document, options);
  }
  
  /**
   * Imprimer une commande cuisine
   * Avec routage automatique selon les catégories
   */
  async printKitchenOrder(
    data: KitchenOrderData,
    options?: PrintOptions
  ): Promise<PrintResult[]> {
    console.log('[PrintManager] Printing kitchen order', data.orderId);
    
    // Grouper les items par type d'imprimante selon leurs catégories
    const itemsByPrinter = new Map<PrinterType, typeof data.items>();
    
    for (const item of data.items) {
      const printerType = this.getPrinterTypeForCategory(item.category);
      
      if (!itemsByPrinter.has(printerType)) {
        itemsByPrinter.set(printerType, []);
      }
      
      itemsByPrinter.get(printerType)!.push(item);
    }
    
    // Créer un document pour chaque imprimante
    const results: PrintResult[] = [];
    
    for (const [printerType, items] of itemsByPrinter) {
      const document: PrintDocument = {
        id: this.generateDocumentId(),
        type: DocumentType.KITCHEN_ORDER,
        targetPrinterType: printerType,
        priority: data.priority === 'rush' ? 'urgent' : 'normal',
        data: { ...data, items }, // Copier les données avec seulement les items concernés
        metadata: {
          orderId: data.orderId,
          tableId: data.tableId,
          tableName: data.tableName,
          serverName: data.serverName,
          timestamp: new Date().toISOString()
        }
      };
      
      const result = await this.print(document, options);
      results.push(result);
    }
    
    return results;
  }
  
  /**
   * Imprimer une addition
   */
  async printBill(
    data: BillData,
    options?: PrintOptions
  ): Promise<PrintResult> {
    console.log('[PrintManager] Printing bill for order', data.orderId);
    
    const document: PrintDocument = {
      id: this.generateDocumentId(),
      type: DocumentType.BILL,
      targetPrinterType: PrinterType.CASHIER,
      priority: 'normal',
      data,
      metadata: {
        orderId: data.orderId,
        tableName: data.tableName,
        serverName: data.serverName,
        timestamp: new Date().toISOString()
      }
    };
    
    return this.print(document, options);
  }
  
  /**
   * Méthode générique d'impression
   */
  private async print(
    document: PrintDocument,
    options?: PrintOptions
  ): Promise<PrintResult> {
    try {
      // Vérifier l'initialisation
      if (!this.initialized) {
        await this.initialize();
      }
      
      // Obtenir l'imprimante cible
      const printer = await this.storage.getDefaultPrinter(document.targetPrinterType);
      
      if (!printer || !printer.isEnabled) {
        throw new Error(`Aucune imprimante ${document.targetPrinterType} disponible`);
      }
      
      // Si impression forcée, bypasser la file d'attente
      if (options?.forcePrint) {
        return await this.printDirect(document, printer);
      }
      
      // Ajouter à la file d'attente
      const jobId = await this.queue.addJob(document, printer.id);
      
      // Si on doit attendre la fin
      if (options?.waitForCompletion) {
        return await this.waitForJobCompletion(jobId, options.timeout);
      }
      
      return {
        success: true,
        jobId,
        printerId: printer.id,
        timestamp: new Date().toISOString(),
        details: { queued: true }
      };
      
    } catch (error: any) {
      console.error('[PrintManager] Print error:', error);
      
      return {
        success: false,
        timestamp: new Date().toISOString(),
        error: error.message || 'Erreur d\'impression inconnue'
      };
    }
  }
  
  /**
   * Impression directe (bypass de la file)
   */
  private async printDirect(
    document: PrintDocument,
    printer: PrinterConfig
  ): Promise<PrintResult> {
    try {
      // Générer le contenu selon le type
      const content = await this.generateContent(document, printer);
      
      // Envoyer à l'imprimante
      await this.connectionManager.sendData(printer, content);
      
      // Marquer l'imprimante comme utilisée
      await this.storage.markPrinterUsed(printer.id);
      
      return {
        success: true,
        printerId: printer.id,
        timestamp: new Date().toISOString()
      };
      
    } catch (error: any) {
      throw new Error(`Échec de l'impression directe: ${error.message}`);
    }
  }
  
  /**
   * Générer le contenu à imprimer selon le type de document
   */
  async generateContent(
    document: PrintDocument,
    printer: PrinterConfig
  ): Promise<Buffer> {
    switch (document.type) {
      case DocumentType.RECEIPT:
        const receiptTemplate = new ReceiptTemplate(printer);
        return receiptTemplate.generate(document.data as ReceiptData);
        
      case DocumentType.KITCHEN_ORDER:
        const kitchenTemplate = new KitchenTemplate(printer);
        return kitchenTemplate.generate(document.data as KitchenOrderData);
        
      case DocumentType.BILL:
        const billTemplate = new BillTemplate(printer);
        return billTemplate.generate(document.data as BillData);
        
      default:
        throw new Error(`Type de document non supporté: ${document.type}`);
    }
  }
  
  /**
   * Attendre la fin d'un job
   */
  private async waitForJobCompletion(
    jobId: string,
    timeout: number = 30000
  ): Promise<PrintResult> {
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        reject(new Error('Timeout en attente de l\'impression'));
      }, timeout);
      
      const checkJob = async () => {
        const job = await this.queue.getJob(jobId);
        
        if (!job) {
          clearTimeout(timer);
          reject(new Error('Job introuvable'));
          return;
        }
        
        if (job.status === 'completed') {
          clearTimeout(timer);
          resolve({
            success: true,
            jobId,
            printerId: job.printerId,
            timestamp: job.completedAt || new Date().toISOString()
          });
        } else if (job.status === 'failed') {
          clearTimeout(timer);
          resolve({
            success: false,
            jobId,
            timestamp: new Date().toISOString(),
            error: job.error || 'Échec de l\'impression'
          });
        } else {
          // Vérifier à nouveau dans 500ms
          setTimeout(checkJob, 500);
        }
      };
      
      checkJob();
    });
  }
  
  // ============================================================================
  // GESTION DES IMPRIMANTES
  // ============================================================================
  
  /**
   * Ajouter une nouvelle imprimante
   */
  async addPrinter(config: PrinterConfig): Promise<void> {
    await this.storage.savePrinter(config);
    
    // Tester la connexion
    const isOnline = await this.connectionManager.testConnection(config);
    await this.storage.updatePrinterStatus(
      config.id,
      isOnline ? ConnectionStatus.CONNECTED : ConnectionStatus.DISCONNECTED
    );
    
    this.emit(PrintEvent.PRINTER_CONNECTED, config);
  }
  
  /**
   * Supprimer une imprimante
   */
  async removePrinter(printerId: string): Promise<void> {
    // Fermer la connexion si elle existe
    this.connectionManager.closeConnection(printerId);
    
    // Supprimer du stockage
    await this.storage.deletePrinter(printerId);
    
    this.emit(PrintEvent.PRINTER_DISCONNECTED, { printerId });
  }
  
  /**
   * Obtenir toutes les imprimantes
   */
  async getPrinters(): Promise<PrinterConfig[]> {
    return this.storage.getAllPrinters();
  }
  
  /**
   * Obtenir une imprimante par ID
   */
  async getPrinter(printerId: string): Promise<PrinterConfig | null> {
    return this.storage.getPrinter(printerId);
  }
  
  /**
   * Mettre à jour une imprimante
   */
  async updatePrinter(config: PrinterConfig): Promise<void> {
    await this.storage.savePrinter(config);
  }
  
  /**
   * Définir l'imprimante par défaut pour un type
   */
  async setDefaultPrinter(printerId: string, type: PrinterType): Promise<void> {
    const printers = await this.storage.getPrintersByType(type);
    
    for (const printer of printers) {
      printer.isDefault = printer.id === printerId;
      await this.storage.savePrinter(printer);
    }
  }
  
  // ============================================================================
  // GESTION DES CATÉGORIES
  // ============================================================================
  
  /**
   * Obtenir le type d'imprimante pour une catégorie
   */
  private getPrinterTypeForCategory(category?: string): PrinterType {
    if (!category) return PrinterType.KITCHEN;
    
    // Vérifier le mapping personnalisé
    const mappedType = this.categoryMapping.get(category);
    if (mappedType) return mappedType;
    
    // Logique par défaut basée sur des mots-clés
    const lowerCategory = category.toLowerCase();
    
    if (lowerCategory.includes('boisson') || 
        lowerCategory.includes('cocktail') ||
        lowerCategory.includes('bière') ||
        lowerCategory.includes('vin') ||
        lowerCategory.includes('café')) {
      return PrinterType.BAR;
    }
    
    return PrinterType.KITCHEN;
  }
  
  /**
   * Configurer le mapping des catégories
   */
  async setCategoryMapping(mapping: Record<string, PrinterType>): Promise<void> {
    this.categoryMapping.clear();
    
    for (const [category, printerType] of Object.entries(mapping)) {
      this.categoryMapping.set(category, printerType);
    }
    
    // Sauvegarder dans les paramètres
    this.settings.categoryMapping = mapping;
    await this.storage.saveSettings(this.settings);
  }
  
  /**
   * Obtenir le mapping actuel des catégories
   */
  getCategoryMapping(): Record<string, PrinterType> {
    const mapping: Record<string, PrinterType> = {};
    
    for (const [category, printerType] of this.categoryMapping) {
      mapping[category] = printerType;
    }
    
    return mapping;
  }
  
  // ============================================================================
  // UTILITAIRES
  // ============================================================================
  
  /**
   * Tester une imprimante
   */
  async testPrinter(printerId: string): Promise<boolean> {
    try {
      const printer = await this.storage.getPrinter(printerId);
      if (!printer) throw new Error('Imprimante introuvable');
      
      const isOnline = await this.connectionManager.testConnection(printer);
      
      await this.storage.updatePrinterStatus(
        printerId,
        isOnline ? ConnectionStatus.CONNECTED : ConnectionStatus.DISCONNECTED
      );
      
      if (isOnline && printer.beepAfterPrint) {
        // Faire un beep de test
        const beepCommand = Buffer.from([0x1B, 0x42, 0x01, 0x01]);
        await this.connectionManager.sendData(printer, beepCommand);
      }
      
      return isOnline;
      
    } catch (error) {
      console.error('[PrintManager] Test printer error:', error);
      return false;
    }
  }
  
  /**
   * Health check de toutes les imprimantes
   */
  async performHealthCheck(): Promise<Map<string, boolean>> {
    console.log('[PrintManager] Performing health check...');
    const results = await this.connectionManager.healthCheck();
    
    // Émettre les événements pour les changements de statut
    for (const [printerId, isOnline] of results) {
      const printer = await this.storage.getPrinter(printerId);
      if (printer) {
        const event = isOnline ? PrintEvent.PRINTER_CONNECTED : PrintEvent.PRINTER_DISCONNECTED;
        this.emit(event, { printerId, printer });
      }
    }
    
    return results;
  }
  
  /**
   * Obtenir le statut de la file d'attente
   */
  async getQueueStatus(): Promise<any> {
    return this.queue.getStatus();
  }
  
  /**
   * Vider la file d'attente
   */
  async clearQueue(): Promise<void> {
    await this.queue.clear();
    this.emit(PrintEvent.QUEUE_UPDATED, { action: 'cleared' });
  }
  
  /**
   * Réessayer un job échoué
   */
  async retryJob(jobId: string): Promise<void> {
    await this.queue.retryJob(jobId);
  }
  
  /**
   * Annuler un job
   */
  async cancelJob(jobId: string): Promise<void> {
    await this.queue.cancelJob(jobId);
  }
  
  /**
   * Générer un ID unique pour un document
   */
  private generateDocumentId(): string {
    return `doc_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  // ============================================================================
  // GESTION DES ÉVÉNEMENTS
  // ============================================================================
  
  /**
   * S'abonner à un événement
   */
  on(event: PrintEvent, callback: PrintEventCallback): void {
    this.eventEmitter.addListener(event.toString(), callback);
  }
  
  /**
   * Se désabonner d'un événement
   */
  off(event: PrintEvent, callback: PrintEventCallback): void {
    this.eventEmitter.removeListener(event.toString(), callback);
  }
  
  /**
   * Émettre un événement
   */
  private emit(event: PrintEvent, data?: any): void {
    this.eventEmitter.emit(event.toString(), event, data);
  }
  
  /**
   * Nettoyer les ressources
   */
  async cleanup(): Promise<void> {
    console.log('[PrintManager] Cleaning up...');
    
    // Arrêter le traitement de la file
    this.queue.stopProcessing();
    
    // Fermer toutes les connexions
    this.connectionManager.closeAllConnections();
    
    // Supprimer tous les écouteurs
    this.eventEmitter.removeAllListeners();
    
    this.initialized = false;
  }
  
  /**
   * Obtenir les paramètres actuels
   */
  getSettings(): any {
    return this.settings;
  }
  
  /**
   * Mettre à jour les paramètres
   */
  async updateSettings(settings: any): Promise<void> {
    this.settings = { ...this.settings, ...settings };
    await this.storage.saveSettings(this.settings);
    
    // Recharger le mapping si nécessaire
    if (settings.categoryMapping) {
      await this.loadCategoryMapping();
    }
  }
}