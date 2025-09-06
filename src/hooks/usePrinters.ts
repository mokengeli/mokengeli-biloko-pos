// src/hooks/usePrinters.ts
import { useState, useEffect, useCallback } from 'react';
import printerService, { PrinterConfig } from '../services/PrinterService';
import { useAuth } from '../contexts/AuthContext';

export interface UsePrintersReturn {
  // Data
  printers: PrinterConfig[];
  defaultPrinter: PrinterConfig | undefined;
  isLoading: boolean;
  
  // Actions
  loadPrinters: () => Promise<void>;
  addPrinter: (config: Omit<PrinterConfig, 'id' | 'createdAt' | 'status'>) => Promise<PrinterConfig>;
  updatePrinter: (printerId: string, updates: Partial<PrinterConfig>) => Promise<PrinterConfig>;
  deletePrinter: (printerId: string) => Promise<void>;
  setDefaultPrinter: (printerId: string) => Promise<void>;
  testConnection: (printerId: string) => Promise<boolean>;
  testPrint: (printerId: string) => Promise<void>;
  
  // Helpers
  getPrinter: (printerId: string) => PrinterConfig | undefined;
  getOnlinePrinters: () => PrinterConfig[];
  getActivePrinters: () => PrinterConfig[];
}

export const usePrinters = (): UsePrintersReturn => {
  const { user } = useAuth();
  const [printers, setPrinters] = useState<PrinterConfig[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // Charger les imprimantes
  const loadPrinters = useCallback(async () => {
    if (!user?.tenantCode) {
      setPrinters([]);
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      await printerService.loadPrinters(user.tenantCode);
      const printersList = printerService.getPrinters(user.tenantCode);
      setPrinters(printersList);
    } catch (error) {
      console.error('Error loading printers:', error);
      setPrinters([]);
    } finally {
      setIsLoading(false);
    }
  }, [user?.tenantCode]);

  // Charger au montage et quand le tenant change
  useEffect(() => {
    loadPrinters();
  }, [loadPrinters]);

  // Ajouter une imprimante
  const addPrinter = useCallback(async (config: Omit<PrinterConfig, 'id' | 'createdAt' | 'status'>) => {
    const newPrinter = await printerService.addPrinter(config);
    await loadPrinters(); // Recharger la liste
    return newPrinter;
  }, [loadPrinters]);

  // Mettre à jour une imprimante
  const updatePrinter = useCallback(async (printerId: string, updates: Partial<PrinterConfig>) => {
    const updatedPrinter = await printerService.updatePrinter(printerId, updates);
    await loadPrinters(); // Recharger la liste
    return updatedPrinter;
  }, [loadPrinters]);

  // Supprimer une imprimante
  const deletePrinter = useCallback(async (printerId: string) => {
    await printerService.deletePrinter(printerId);
    await loadPrinters(); // Recharger la liste
  }, [loadPrinters]);

  // Définir comme imprimante par défaut
  const setDefaultPrinter = useCallback(async (printerId: string) => {
    await printerService.setDefaultPrinter(printerId);
    await loadPrinters(); // Recharger la liste
  }, [loadPrinters]);

  // Tester la connexion
  const testConnection = useCallback(async (printerId: string) => {
    const result = await printerService.testConnection(printerId);
    await loadPrinters(); // Recharger pour mettre à jour le statut
    return result;
  }, [loadPrinters]);

  // Test d'impression
  const testPrint = useCallback(async (printerId: string) => {
    await printerService.testPrint(printerId);
    await loadPrinters(); // Recharger pour mettre à jour le statut
  }, [loadPrinters]);

  // Obtenir une imprimante par ID
  const getPrinter = useCallback((printerId: string) => {
    return printers.find(p => p.id === printerId);
  }, [printers]);

  // Obtenir les imprimantes en ligne
  const getOnlinePrinters = useCallback(() => {
    return printers.filter(p => p.status === 'online' && p.isActive);
  }, [printers]);

  // Obtenir les imprimantes actives
  const getActivePrinters = useCallback(() => {
    return printers.filter(p => p.isActive);
  }, [printers]);

  // Obtenir l'imprimante par défaut
  const defaultPrinter = user?.tenantCode 
    ? printerService.getDefaultPrinter(user.tenantCode)
    : undefined;

  return {
    // Data
    printers,
    defaultPrinter,
    isLoading,
    
    // Actions
    loadPrinters,
    addPrinter,
    updatePrinter,
    deletePrinter,
    setDefaultPrinter,
    testConnection,
    testPrint,
    
    // Helpers
    getPrinter,
    getOnlinePrinters,
    getActivePrinters,
  };
};

export default usePrinters;