// src/services/PrinterService.ts
import AsyncStorage from '@react-native-async-storage/async-storage';
import { AppState, AppStateStatus } from 'react-native';
import { DomainOrder } from '../api/orderService';
import { ThermalPrinterService } from './ThermalPrinterService';

// Import conditionnel et sécurisé du service d'impression natif
import { NativePrinterService } from './NativePrinterService';
import { ThermalReceiptPrinterService } from './ThermalReceiptPrinterService';
import { printerConnectionManager } from './PrinterConnectionManager';

export interface PrinterConfig {
  id: string;
  name: string;
  tenantCode: string;
  connection: {
    ip: string;
    port: number;
  };
  isDefault: boolean;
  isActive: boolean;
  createdAt: Date;
  lastConnected?: Date;
  status: 'online' | 'offline' | 'unknown';
}

interface PrinterStorage {
  printers: PrinterConfig[];
  defaultPrinterId?: string;
}

class PrinterService {
  private static instance: PrinterService;
  private printers: Map<string, PrinterConfig> = new Map();
  private defaultPrinterId?: string;
  private appStateSubscription: any = null;

  private constructor() {
    this.setupAppStateListener();
  }

  static getInstance(): PrinterService {
    if (!PrinterService.instance) {
      PrinterService.instance = new PrinterService();
    }
    return PrinterService.instance;
  }

  // ============================================================================
  // GESTION DU STOCKAGE LOCAL
  // ============================================================================
  
  private getStorageKey(tenantCode: string): string {
    return `printers_${tenantCode}`;
  }

  async loadPrinters(tenantCode: string): Promise<PrinterConfig[]> {
    try {
      const key = this.getStorageKey(tenantCode);
      const data = await AsyncStorage.getItem(key);
      
      if (data) {
        const storage: PrinterStorage = JSON.parse(data);
        
        // Reconstituer les dates
        storage.printers = storage.printers.map(printer => ({
          ...printer,
          createdAt: new Date(printer.createdAt),
          lastConnected: printer.lastConnected ? new Date(printer.lastConnected) : undefined
        }));
        
        // Mettre à jour le cache local
        this.printers.clear();
        storage.printers.forEach(printer => {
          this.printers.set(printer.id, printer);
        });
        
        this.defaultPrinterId = storage.defaultPrinterId;
        return storage.printers;
      }
      
      return [];
    } catch (error) {
      console.error('Error loading printers:', error);
      return [];
    }
  }

  async savePrinters(tenantCode: string): Promise<void> {
    try {
      const key = this.getStorageKey(tenantCode);
      const printersArray = Array.from(this.printers.values())
        .filter(printer => printer.tenantCode === tenantCode);
      
      const storage: PrinterStorage = {
        printers: printersArray,
        defaultPrinterId: this.defaultPrinterId
      };
      
      await AsyncStorage.setItem(key, JSON.stringify(storage));
    } catch (error) {
      console.error('Error saving printers:', error);
      throw new Error('Impossible de sauvegarder la configuration des imprimantes');
    }
  }

  // ============================================================================
  // CRUD IMPRIMANTES
  // ============================================================================

  getPrinters(tenantCode: string): PrinterConfig[] {
    return Array.from(this.printers.values())
      .filter(printer => printer.tenantCode === tenantCode)
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }

  getPrinter(printerId: string): PrinterConfig | undefined {
    return this.printers.get(printerId);
  }

  getDefaultPrinter(tenantCode: string): PrinterConfig | undefined {
    if (this.defaultPrinterId) {
      const printer = this.printers.get(this.defaultPrinterId);
      if (printer && printer.tenantCode === tenantCode) {
        return printer;
      }
    }
    
    // Fallback: première imprimante active
    const printers = this.getPrinters(tenantCode);
    return printers.find(p => p.isActive) || printers[0];
  }

  async addPrinter(config: Omit<PrinterConfig, 'id' | 'createdAt' | 'status'>): Promise<PrinterConfig> {
    const printer: PrinterConfig = {
      ...config,
      id: `printer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      createdAt: new Date(),
      status: 'unknown'
    };

    // Si c'est la première imprimante ou marquée par défaut, la définir comme défaut
    const existingPrinters = this.getPrinters(config.tenantCode);
    if (existingPrinters.length === 0 || printer.isDefault) {
      this.defaultPrinterId = printer.id;
      
      // S'assurer qu'une seule imprimante est définie par défaut
      existingPrinters.forEach(p => {
        if (p.isDefault && p.id !== printer.id) {
          p.isDefault = false;
          this.printers.set(p.id, p);
        }
      });
    }

    this.printers.set(printer.id, printer);
    await this.savePrinters(config.tenantCode);
    
    return printer;
  }

  async updatePrinter(printerId: string, updates: Partial<PrinterConfig>): Promise<PrinterConfig> {
    const printer = this.printers.get(printerId);
    if (!printer) {
      throw new Error('Imprimante introuvable');
    }

    const updatedPrinter = { ...printer, ...updates };
    
    // Gestion du défaut
    if (updates.isDefault) {
      this.defaultPrinterId = printerId;
      
      // Retirer le défaut des autres imprimantes
      this.printers.forEach((p, id) => {
        if (id !== printerId && p.tenantCode === printer.tenantCode) {
          p.isDefault = false;
        }
      });
    }

    this.printers.set(printerId, updatedPrinter);
    await this.savePrinters(printer.tenantCode);
    
    return updatedPrinter;
  }

  async deletePrinter(printerId: string): Promise<void> {
    const printer = this.printers.get(printerId);
    if (!printer) {
      throw new Error('Imprimante introuvable');
    }

    this.printers.delete(printerId);
    
    // Si c'était l'imprimante par défaut, choisir une autre
    if (this.defaultPrinterId === printerId) {
      const remaining = this.getPrinters(printer.tenantCode);
      this.defaultPrinterId = remaining[0]?.id;
    }
    
    await this.savePrinters(printer.tenantCode);
  }

  async setDefaultPrinter(printerId: string): Promise<void> {
    const printer = this.printers.get(printerId);
    if (!printer) {
      throw new Error('Imprimante introuvable');
    }

    // Retirer le défaut des autres imprimantes du même tenant
    this.printers.forEach(p => {
      if (p.tenantCode === printer.tenantCode) {
        p.isDefault = p.id === printerId;
      }
    });

    this.defaultPrinterId = printerId;
    await this.savePrinters(printer.tenantCode);
  }

  // ============================================================================
  // GESTION APPSTATE POUR RECONNEXION APRÈS VEILLE
  // ============================================================================
  
  private setupAppStateListener(): void {
    this.appStateSubscription = AppState.addEventListener(
      'change',
      this.handleAppStateChange
    );
  }

  private handleAppStateChange = async (nextAppState: AppStateStatus): Promise<void> => {
    console.log(`[PrinterService] App state changed to: ${nextAppState}`);
    
    if (nextAppState === 'active') {
      // App devient active après veille - valider les connexions imprimantes
      console.log('[PrinterService] App became active, validating printer connections...');
      await this.validateActivePrinters();
    } else if (nextAppState === 'background') {
      // App passe en arrière-plan - nettoyer les connexions si nécessaire
      console.log('[PrinterService] App going to background, cleaning up printer connections...');
      await this.cleanupConnections();
    }
  };

  private async validateActivePrinters(): Promise<void> {
    try {
      const activePrinters = Array.from(this.printers.values()).filter(p => p.isActive);
      
      for (const printer of activePrinters) {
        try {
          console.log(`[PrinterService] Testing connection to ${printer.name} (${printer.connection.ip}:${printer.connection.port})`);
          
          const isOnline = await this.pingPrinter(
            printer.connection.ip, 
            printer.connection.port,
            3000 // Timeout réduit pour test rapide
          );
          
          if (isOnline && printer.status === 'offline') {
            // Imprimante revenue en ligne
            const updatedPrinter = { 
              ...printer, 
              status: 'online' as const, 
              lastConnected: new Date() 
            };
            this.printers.set(printer.id, updatedPrinter);
            console.log(`[PrinterService] ✅ ${printer.name} is back online`);
          } else if (!isOnline && printer.status === 'online') {
            // Imprimante perdue
            const updatedPrinter = { ...printer, status: 'offline' as const };
            this.printers.set(printer.id, updatedPrinter);
            console.log(`[PrinterService] ❌ ${printer.name} went offline`);
          }
        } catch (error) {
          console.error(`[PrinterService] Error validating printer ${printer.name}:`, error);
          const updatedPrinter = { ...printer, status: 'unknown' as const };
          this.printers.set(printer.id, updatedPrinter);
        }
      }
      
      // Sauvegarder les changements de statut
      if (activePrinters.length > 0) {
        await this.savePrinters(activePrinters[0].tenantCode);
      }
      
    } catch (error) {
      console.error('[PrinterService] Error during printer validation:', error);
    }
  }

  private async cleanupConnections(): Promise<void> {
    try {
      // Déconnecter explicitement les services d'impression
      if (ThermalReceiptPrinterService.isModuleAvailable()) {
        await ThermalReceiptPrinterService.disconnect();
        console.log('[PrinterService] ThermalReceiptPrinterService disconnected');
      }
    } catch (error) {
      console.error('[PrinterService] Error during cleanup:', error);
    }
  }

  // ============================================================================
  // CONNEXION ET TESTS
  // ============================================================================

  async testConnection(printerId: string): Promise<boolean> {
    const printer = this.printers.get(printerId);
    if (!printer) {
      throw new Error('Imprimante introuvable');
    }

    try {
      // Test de connexion via socket TCP
      const isConnected = await this.pingPrinter(printer.connection.ip, printer.connection.port);
      
      // Mettre à jour le statut
      const updatedPrinter = {
        ...printer,
        status: isConnected ? 'online' as const : 'offline' as const,
        lastConnected: isConnected ? new Date() : printer.lastConnected
      };
      
      this.printers.set(printerId, updatedPrinter);
      await this.savePrinters(printer.tenantCode);
      
      return isConnected;
    } catch (error) {
      console.error('Error testing printer connection:', error);
      
      // Marquer comme offline en cas d'erreur
      const updatedPrinter = { ...printer, status: 'offline' as const };
      this.printers.set(printerId, updatedPrinter);
      await this.savePrinters(printer.tenantCode);
      
      return false;
    }
  }

  private async pingPrinter(ip: string, port: number, timeout: number = 5000): Promise<boolean> {
    try {
      // Essayer d'abord la nouvelle librairie thermal-receipt-printer
      if (ThermalReceiptPrinterService.isModuleAvailable()) {
        return await ThermalReceiptPrinterService.testConnection(ip, port);
      }
      
      // Fallback vers l'ancien service si nécessaire
      return await ThermalPrinterService.testConnection(ip, port);
    } catch (error) {
      console.error('Error in pingPrinter:', error);
      return false;
    }
  }

  // ============================================================================
  // IMPRESSION
  // ============================================================================

  // Vérifier si le service d'impression thermique est disponible
  isPrinterLibraryAvailable(): boolean {
    // Privilégier la nouvelle librairie
    return ThermalReceiptPrinterService.isModuleAvailable() || NativePrinterService.isNativeModuleAvailable();
  }

  // Vérifier si la bibliothèque native est disponible (pour compatibilité UI)
  isExternalLibraryAvailable(): boolean {
    // Privilégier la nouvelle librairie
    return ThermalReceiptPrinterService.isModuleAvailable() || NativePrinterService.isNativeModuleAvailable();
  }

  async printTicket(order: DomainOrder, printerId?: string, establishmentName?: string): Promise<void> {
    let printer: PrinterConfig | undefined;
    
    if (printerId) {
      printer = this.getPrinter(printerId);
    } else {
      printer = this.getDefaultPrinter(order.tenantCode);
    }

    if (!printer) {
      throw new Error('Aucune imprimante configurée');
    }

    if (!printer.isActive) {
      throw new Error('L\'imprimante sélectionnée est désactivée');
    }

    // Utiliser la nouvelle méthode avec retry
    await this.printWithRetry(printer, order, establishmentName);
  }

  // ============================================================================
  // IMPRESSION AVEC RETRY ET BACKOFF EXPONENTIEL
  // ============================================================================

  private async printWithRetry(
    printer: PrinterConfig, 
    order: DomainOrder, 
    establishmentName?: string,
    maxRetries: number = 3
  ): Promise<void> {
    let lastError: Error | null = null;
    let attemptNumber = 0;

    for (attemptNumber = 1; attemptNumber <= maxRetries; attemptNumber++) {
      try {
        console.log(`[PrinterService] Print attempt ${attemptNumber}/${maxRetries} for ${printer.name}`);
        
        // Première tentative ou reconnexion avant retry
        if (attemptNumber > 1) {
          console.log(`[PrinterService] Attempting reconnection before retry ${attemptNumber}`);
          await this.reconnectPrinter(printer);
        }
        
        // Tentative d'impression
        await this.printToThermalPrinter(printer, order, establishmentName);
        
        // Succès - mettre à jour le statut
        const updatedPrinter = {
          ...printer,
          status: 'online' as const,
          lastConnected: new Date()
        };
        this.printers.set(printer.id, updatedPrinter);
        await this.savePrinters(printer.tenantCode);
        
        console.log(`[PrinterService] ✅ Print successful on attempt ${attemptNumber}`);
        return; // Succès, sortir de la boucle
        
      } catch (error) {
        lastError = error as Error;
        console.error(`[PrinterService] Print attempt ${attemptNumber} failed:`, error);
        
        // Si ce n'est pas la dernière tentative, attendre avec backoff exponentiel
        if (attemptNumber < maxRetries) {
          const delay = this.calculateBackoffDelay(attemptNumber);
          console.log(`[PrinterService] Waiting ${delay}ms before retry ${attemptNumber + 1}`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    
    // Toutes les tentatives ont échoué
    console.error(`[PrinterService] ❌ All ${maxRetries} print attempts failed`);
    
    // Marquer comme offline
    const updatedPrinter = { ...printer, status: 'offline' as const };
    this.printers.set(printer.id, updatedPrinter);
    await this.savePrinters(printer.tenantCode);
    
    throw new Error(
      `Impossible d'imprimer sur ${printer.name} après ${maxRetries} tentatives. ` +
      `Dernière erreur: ${lastError?.message || 'Erreur inconnue'}`
    );
  }

  private calculateBackoffDelay(attemptNumber: number): number {
    // Backoff exponentiel : 1s, 2s, 4s, 8s, max 10s
    const baseDelay = 1000; // 1 seconde
    const maxDelay = 10000; // 10 secondes max
    const delay = Math.min(baseDelay * Math.pow(2, attemptNumber - 1), maxDelay);
    
    // Ajouter un jitter pour éviter la synchronisation
    const jitter = Math.random() * 0.1 * delay; // ±10% de variation
    return Math.floor(delay + jitter);
  }

  private async reconnectPrinter(printer: PrinterConfig): Promise<void> {
    try {
      console.log(`[PrinterService] Attempting to reconnect ${printer.name}...`);
      
      // Déconnecter d'abord si connecté
      if (ThermalReceiptPrinterService.isModuleAvailable()) {
        await ThermalReceiptPrinterService.disconnect();
        console.log('[PrinterService] Previous connection disconnected');
      }
      
      // Petit délai pour s'assurer que la déconnexion est complète
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Tenter la reconnexion
      const connected = await ThermalReceiptPrinterService.connectToPrinter(
        printer.connection.ip,
        printer.connection.port,
        8000 // Timeout légèrement plus long pour reconnexion
      );
      
      if (connected) {
        console.log(`[PrinterService] ✅ Successfully reconnected to ${printer.name}`);
      } else {
        throw new Error('Reconnection failed');
      }
      
    } catch (error) {
      console.error(`[PrinterService] ❌ Failed to reconnect to ${printer.name}:`, error);
      throw new Error(`Reconnection failed: ${error}`);
    }
  }

  private async printToThermalPrinter(printer: PrinterConfig, order: DomainOrder, establishmentName?: string): Promise<void> {
    // Utiliser le gestionnaire de connexions centralisé pour maintenir les connexions persistantes
    if (ThermalReceiptPrinterService.isModuleAvailable()) {
      console.log(`[PrinterService] Using centralized connection manager for ${printer.name}`);
      
      // Obtenir une connexion persistante du pool
      const connection = await printerConnectionManager.getConnection(printer);
      
      // Utiliser la connexion pour l'impression
      await this.printWithManagedConnection(printer, order, establishmentName);
    } else {
      // Fallback vers l'ancien service
      await this.printWithNativeImplementation(printer, order, establishmentName);
    }
  }

  private async printWithManagedConnection(printer: PrinterConfig, order: DomainOrder, establishmentName?: string): Promise<void> {
    try {
      // Le gestionnaire de connexions s'occupe de maintenir la connexion
      await ThermalReceiptPrinterService.printTicket(
        printer.name,
        printer.connection.ip,
        printer.connection.port,
        order,
        establishmentName
      );
      
      console.log(`[PrinterService] ✅ Successfully printed using managed connection for ${printer.name}`);
    } catch (error) {
      console.error(`[PrinterService] ❌ Print failed with managed connection for ${printer.name}:`, error);
      
      // En cas d'erreur, forcer une reconnexion via le gestionnaire
      const reconnected = await printerConnectionManager.forceReconnect(printer);
      if (reconnected) {
        // Retry une fois après reconnexion
        await ThermalReceiptPrinterService.printTicket(
          printer.name,
          printer.connection.ip,
          printer.connection.port,
          order,
          establishmentName
        );
      } else {
        throw error;
      }
    }
  }

  private async printWithThermalReceiptPrinter(printer: PrinterConfig, order: DomainOrder, establishmentName?: string): Promise<void> {
    try {
      console.log('Using react-native-thermal-receipt-printer implementation');
      await ThermalReceiptPrinterService.printTicket(
        printer.name,
        printer.connection.ip, 
        printer.connection.port, 
        order,
        establishmentName
      );
    } catch (error) {
      console.error('Thermal receipt printer error:', error);
      throw new Error(`Erreur d'impression sur ${printer.name}: ${error instanceof Error ? error.message : 'Erreur inconnue'}`);
    }
  }

  private async printWithNativeImplementation(printer: PrinterConfig, order: DomainOrder, establishmentName?: string): Promise<void> {
    try {
      console.log('Using native thermal printer implementation (fallback)');
      await NativePrinterService.printTicket(
        printer.name,
        printer.connection.ip, 
        printer.connection.port, 
        order,
        establishmentName
      );
    } catch (error) {
      console.error('Native thermal printer error:', error);
      throw new Error(`Erreur d'impression sur ${printer.name}: ${error instanceof Error ? error.message : 'Erreur inconnue'}`);
    }
  }

  private generateTicketTemplate(order: DomainOrder): string {
    const lineWidth = 32;
    const separator = '='.repeat(lineWidth);
    const dashes = '-'.repeat(lineWidth);
    
    // Helper functions
    const centerText = (text: string): string => {
      const padding = Math.max(0, Math.floor((lineWidth - text.length) / 2));
      return ' '.repeat(padding) + text;
    };
    
    const rightAlign = (text: string): string => {
      const padding = Math.max(0, lineWidth - text.length);
      return ' '.repeat(padding) + text;
    };
    
    const formatItem = (item: any): string => {
      const name = item.dishName.length > 20 ? item.dishName.substring(0, 17) + '...' : item.dishName;
      const quantity = `${item.count}x`;
      const price = `${(item.unitPrice * item.count).toFixed(2)} ${order.currency.code}`;
      const nameSection = `${quantity} ${name}`;
      const padding = Math.max(1, lineWidth - nameSection.length - price.length);
      return nameSection + ' '.repeat(padding) + price;
    };

    // Construction du ticket
    return `
${centerText('MOKENGELI BILOKO POS')}
${centerText('Restaurant')}
${separator}

Commande: ${order.orderNumber}
Table: ${order.tableName}
Serveur: ${order.waiterName || 'N/A'}
Date: ${new Date(order.orderDate).toLocaleString()}

${dashes}
ARTICLES:
${order.items.map(formatItem).join('\n')}
${dashes}

${rightAlign(`TOTAL: ${order.totalPrice.toFixed(2)} ${order.currency.code}`)}

${separator}
${centerText('Merci de votre visite!')}
${centerText('À bientôt')}

`;
  }

  async testPrint(printerId: string, establishmentName?: string): Promise<void> {
    const printer = this.printers.get(printerId);
    if (!printer) {
      throw new Error('Imprimante introuvable');
    }

    // Créer une commande de test
    const testOrder: DomainOrder = {
      id: 0,
      orderNumber: 'TEST001',
      tenantCode: printer.tenantCode,
      tableName: 'Test',
      tableId: 0,
      employeeNumber: 'TEST',
      waiterName: 'Test User',
      items: [
        {
          id: 1,
          dishId: 1,
          dishName: 'Test Item',
          note: '',
          count: 1,
          state: 'SERVED',
          unitPrice: 10.00,
          orderItemDate: new Date().toISOString()
        }
      ],
      totalPrice: 10.00,
      currency: { id: 1, label: 'Euro', code: 'EUR' },
      orderDate: new Date().toISOString(),
      paymentStatus: 'UNPAID'
    };

    await this.printTicket(testOrder, printerId, establishmentName);
  }

  // ============================================================================
  // NETTOYAGE ET STATISTIQUES
  // ============================================================================

  /**
   * Obtenir les statistiques du pool de connexions
   */
  getConnectionStats() {
    return printerConnectionManager.getPoolStats();
  }

  /**
   * Forcer la reconnexion d'une imprimante
   */
  async forceReconnectPrinter(printerId: string): Promise<boolean> {
    const printer = this.printers.get(printerId);
    if (!printer) {
      throw new Error('Imprimante introuvable');
    }
    
    return await printerConnectionManager.forceReconnect(printer);
  }

  /**
   * Nettoyer toutes les connexions (à appeler lors de la fermeture de l'app)
   */
  async cleanup(): Promise<void> {
    console.log('[PrinterService] Cleaning up service');
    
    if (this.appStateSubscription) {
      this.appStateSubscription.remove();
      this.appStateSubscription = null;
    }
    
    await printerConnectionManager.cleanup();
  }
}

// Export du singleton
export const printerService = PrinterService.getInstance();
export default printerService;