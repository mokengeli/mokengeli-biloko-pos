// src/hooks/usePrintManager.ts

import { useState, useEffect, useCallback } from 'react';
import { Alert } from 'react-native';
import { 
  PrintManager, 
  PrinterConfig, 
  PrinterType, 
  PrintResult,
  PrintEvent,
  ConnectionStatus,
  ReceiptData,
  KitchenOrderData,
  BillData,
  PrintDocument,
  DocumentType
} from '../services/printing/types';
import { DomainOrder, DomainOrderItem, PaymentRequest } from '../api/orderService';
import { useAuth } from '../contexts/AuthContext';

interface PrintManagerState {
  isInitialized: boolean;
  isLoading: boolean;
  printers: PrinterConfig[];
  queueStatus: any;
  error: string | null;
}

interface UsePrintManagerReturn extends PrintManagerState {
  // Méthodes d'impression
  printReceipt: (order: DomainOrder, payment: PaymentRequest) => Promise<PrintResult>;
  printKitchenOrder: (order: DomainOrder, newItems?: DomainOrderItem[]) => Promise<PrintResult[]>;
  printBill: (order: DomainOrder) => Promise<PrintResult>;
  
  // Gestion des imprimantes
  addPrinter: (config: PrinterConfig) => Promise<void>;
  removePrinter: (printerId: string) => Promise<void>;
  testPrinter: (printerId: string) => Promise<boolean>;
  setDefaultPrinter: (printerId: string, type: PrinterType) => Promise<void>;
  
  // Gestion de la file
  retryJob: (jobId: string) => Promise<void>;
  cancelJob: (jobId: string) => Promise<void>;
  clearQueue: () => Promise<void>;
  
  // Configuration
  setCategoryMapping: (mapping: Record<string, PrinterType>) => Promise<void>;
  updateSettings: (settings: any) => Promise<void>;
  
  // Découverte
  discoverPrinters: (subnet?: string) => Promise<any[]>;
  
  // Utilitaires
  refreshStatus: () => Promise<void>;
  getConnectionStatus: (printerId: string) => ConnectionStatus | undefined;
}

export const usePrintManager = (): UsePrintManagerReturn => {
  const { user } = useAuth();
  const [state, setState] = useState<PrintManagerState>({
    isInitialized: false,
    isLoading: false,
    printers: [],
    queueStatus: null,
    error: null
  });

  // Instance singleton du PrintManager
  const printManager = PrintManager.getInstance();

  /**
   * Initialisation du service
   */
  useEffect(() => {
    const initialize = async () => {
      setState(prev => ({ ...prev, isLoading: true }));
      
      try {
        await printManager.initialize();
        
        // Charger les imprimantes
        const printers = await printManager.getPrinters();
        
        // Obtenir le statut de la file
        const queueStatus = await printManager.getQueueStatus();
        
        setState(prev => ({
          ...prev,
          isInitialized: true,
          printers,
          queueStatus,
          isLoading: false
        }));
        
        // S'abonner aux événements
        setupEventListeners();
        
      } catch (error: any) {
        console.error('[usePrintManager] Initialization error:', error);
        setState(prev => ({
          ...prev,
          error: error.message,
          isLoading: false
        }));
      }
    };

    initialize();

    // Cleanup
    return () => {
      printManager.cleanup().catch(console.error);
    };
  }, []);

  /**
   * Configuration des écouteurs d'événements
   */
  const setupEventListeners = useCallback(() => {
    // Connexion/déconnexion d'imprimante
    printManager.on(PrintEvent.PRINTER_CONNECTED, (event, data) => {
      console.log('[usePrintManager] Printer connected:', data);
      refreshStatus();
    });

    printManager.on(PrintEvent.PRINTER_DISCONNECTED, (event, data) => {
      console.log('[usePrintManager] Printer disconnected:', data);
      refreshStatus();
    });

    // Événements d'impression
    printManager.on(PrintEvent.PRINT_COMPLETED, (event, data) => {
      console.log('[usePrintManager] Print completed:', data);
      refreshStatus();
    });

    printManager.on(PrintEvent.PRINT_FAILED, (event, data) => {
      console.error('[usePrintManager] Print failed:', data);
      Alert.alert(
        'Erreur d\'impression',
        `Échec de l'impression: ${data.error}`,
        [
          { text: 'Réessayer', onPress: () => retryJob(data.job.id) },
          { text: 'OK' }
        ]
      );
      refreshStatus();
    });

    // Mise à jour de la file
    printManager.on(PrintEvent.QUEUE_UPDATED, (event, data) => {
      refreshStatus();
    });
  }, []);

  /**
   * Rafraîchir le statut
   */
  const refreshStatus = useCallback(async () => {
    try {
      const printers = await printManager.getPrinters();
      const queueStatus = await printManager.getQueueStatus();
      
      setState(prev => ({
        ...prev,
        printers,
        queueStatus
      }));
    } catch (error: any) {
      console.error('[usePrintManager] Refresh error:', error);
    }
  }, []);

  /**
   * Imprimer un reçu de paiement
   */
  const printReceipt = useCallback(async (
    order: DomainOrder,
    payment: PaymentRequest
  ): Promise<PrintResult> => {
    if (!state.isInitialized) {
      throw new Error('Service d\'impression non initialisé');
    }

    const receiptData: ReceiptData = {
      orderId: order.id,
      tableName: order.tableName,
      items: order.items.map(item => ({
        quantity: item.count,
        name: item.dishName,
        unitPrice: item.unitPrice,
        totalPrice: item.unitPrice * item.count,
        notes: item.note
      })),
      subtotal: order.totalPrice,
      tax: order.totalPrice * 0.1, // TVA 10%
      total: order.totalPrice * 1.1,
      paidAmount: payment.amount,
      change: Math.max(0, payment.amount - (order.totalPrice * 1.1)),
      paymentMethod: payment.paymentMethod,
      serverName: user?.firstName || 'Serveur',
      restaurantInfo: {
        name: 'MOKENGELI BILOKO',
        address: '123 Rue de la Gastronomie',
        phone: '01 23 45 67 89',
        taxId: 'FR12345678901'
      }
    };

    return printManager.printReceipt(receiptData);
  }, [state.isInitialized, user]);

  /**
   * Imprimer une commande cuisine
   */
  const printKitchenOrder = useCallback(async (
    order: DomainOrder,
    newItems?: DomainOrderItem[]
  ): Promise<PrintResult[]> => {
    if (!state.isInitialized) {
      throw new Error('Service d\'impression non initialisé');
    }

    // Utiliser les nouveaux items ou tous les items
    const itemsToPrint = newItems || order.items.filter(
      item => item.state === 'PENDING' || item.state === 'IN_PREPARATION'
    );

    const kitchenData: KitchenOrderData = {
      orderId: order.id,
      tableId: order.tableId,
      tableName: order.tableName,
      items: itemsToPrint.map(item => ({
        quantity: item.count,
        name: item.dishName,
        notes: item.note,
        category: item.categories?.[0], // Première catégorie pour le routage
        preparationTime: 15 // Temps estimé par défaut
      })),
      serverName: user?.firstName || 'Serveur',
      orderTime: order.orderDate,
      priority: 'normal',
      specialInstructions: undefined
    };

    return printManager.printKitchenOrder(kitchenData);
  }, [state.isInitialized, user]);

  /**
   * Imprimer une addition
   */
  const printBill = useCallback(async (
    order: DomainOrder
  ): Promise<PrintResult> => {
    if (!state.isInitialized) {
      throw new Error('Service d\'impression non initialisé');
    }

    const billData: BillData = {
      orderId: order.id,
      tableName: order.tableName,
      items: order.items.map(item => ({
        quantity: item.count,
        name: item.dishName,
        unitPrice: item.unitPrice,
        totalPrice: item.unitPrice * item.count
      })),
      subtotal: order.totalPrice,
      tax: order.totalPrice * 0.1,
      serviceCharge: 0,
      total: order.totalPrice * 1.1,
      currency: order.currency.code,
      serverName: user?.firstName || 'Serveur',
      covers: 2, // À déterminer dynamiquement
      restaurantInfo: {
        name: 'MOKENGELI BILOKO',
        address: '123 Rue de la Gastronomie',
        phone: '01 23 45 67 89',
        taxId: 'FR12345678901'
      }
    };

    return printManager.printBill(billData);
  }, [state.isInitialized, user]);

  /**
   * Ajouter une imprimante
   */
  const addPrinter = useCallback(async (config: PrinterConfig) => {
    await printManager.addPrinter(config);
    await refreshStatus();
  }, [refreshStatus]);

  /**
   * Supprimer une imprimante
   */
  const removePrinter = useCallback(async (printerId: string) => {
    await printManager.removePrinter(printerId);
    await refreshStatus();
  }, [refreshStatus]);

  /**
   * Tester une imprimante
   */
  const testPrinter = useCallback(async (printerId: string): Promise<boolean> => {
    const result = await printManager.testPrinter(printerId);
    await refreshStatus();
    return result;
  }, [refreshStatus]);

  /**
   * Définir l'imprimante par défaut
   */
  const setDefaultPrinter = useCallback(async (
    printerId: string,
    type: PrinterType
  ) => {
    await printManager.setDefaultPrinter(printerId, type);
    await refreshStatus();
  }, [refreshStatus]);

  /**
   * Réessayer un job
   */
  const retryJob = useCallback(async (jobId: string) => {
    await printManager.retryJob(jobId);
    await refreshStatus();
  }, [refreshStatus]);

  /**
   * Annuler un job
   */
  const cancelJob = useCallback(async (jobId: string) => {
    await printManager.cancelJob(jobId);
    await refreshStatus();
  }, [refreshStatus]);

  /**
   * Vider la file
   */
  const clearQueue = useCallback(async () => {
    await printManager.clearQueue();
    await refreshStatus();
  }, [refreshStatus]);

  /**
   * Configurer le mapping des catégories
   */
  const setCategoryMapping = useCallback(async (
    mapping: Record<string, PrinterType>
  ) => {
    await printManager.setCategoryMapping(mapping);
  }, []);

  /**
   * Mettre à jour les paramètres
   */
  const updateSettings = useCallback(async (settings: any) => {
    await printManager.updateSettings(settings);
    await refreshStatus();
  }, [refreshStatus]);

  /**
   * Découvrir les imprimantes
   */
  const discoverPrinters = useCallback(async (subnet?: string) => {
    const discovery = await import('../services/printing/PrinterDiscovery');
    const discoveryService = discovery.PrinterDiscovery.getInstance();
    
    return discoveryService.discoverPrinters({ subnet });
  }, []);

  /**
   * Obtenir le statut de connexion d'une imprimante
   */
  const getConnectionStatus = useCallback((printerId: string): ConnectionStatus | undefined => {
    const printer = state.printers.find(p => p.id === printerId);
    return printer?.status;
  }, [state.printers]);

  return {
    ...state,
    
    // Méthodes d'impression
    printReceipt,
    printKitchenOrder,
    printBill,
    
    // Gestion des imprimantes
    addPrinter,
    removePrinter,
    testPrinter,
    setDefaultPrinter,
    
    // Gestion de la file
    retryJob,
    cancelJob,
    clearQueue,
    
    // Configuration
    setCategoryMapping,
    updateSettings,
    
    // Découverte
    discoverPrinters,
    
    // Utilitaires
    refreshStatus,
    getConnectionStatus
  };
};

export default usePrintManager;