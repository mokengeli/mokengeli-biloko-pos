// src/services/printing/PrinterStorage.ts

import AsyncStorage from '@react-native-async-storage/async-storage';
import { PrinterConfig, PrinterType, ConnectionStatus } from './types';

/**
 * Service de gestion du stockage persistant des configurations d'imprimantes
 */
export class PrinterStorage {
  private static instance: PrinterStorage;
  private readonly STORAGE_KEY = '@mokengeli_printers';
  private readonly SETTINGS_KEY = '@mokengeli_printer_settings';
  private cache: Map<string, PrinterConfig> = new Map();
  private initialized = false;

  private constructor() {}

  /**
   * Obtenir l'instance singleton
   */
  static getInstance(): PrinterStorage {
    if (!PrinterStorage.instance) {
      PrinterStorage.instance = new PrinterStorage();
    }
    return PrinterStorage.instance;
  }

  /**
   * Initialiser le service de stockage
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;

    try {
      await this.loadPrinters();
      this.initialized = true;
      console.log('[PrinterStorage] Initialized with', this.cache.size, 'printers');
    } catch (error) {
      console.error('[PrinterStorage] Initialization error:', error);
      throw error;
    }
  }

  /**
   * Charger toutes les imprimantes depuis le stockage
   */
  private async loadPrinters(): Promise<void> {
    try {
      const data = await AsyncStorage.getItem(this.STORAGE_KEY);
      if (data) {
        const printers: PrinterConfig[] = JSON.parse(data);
        this.cache.clear();
        printers.forEach(printer => {
          // Réinitialiser le statut au chargement
          printer.status = ConnectionStatus.DISCONNECTED;
          this.cache.set(printer.id, printer);
        });
      }
    } catch (error) {
      console.error('[PrinterStorage] Error loading printers:', error);
      this.cache.clear();
    }
  }

  /**
   * Sauvegarder toutes les imprimantes dans le stockage
   */
  private async savePrinters(): Promise<void> {
    try {
      const printers = Array.from(this.cache.values());
      await AsyncStorage.setItem(this.STORAGE_KEY, JSON.stringify(printers));
    } catch (error) {
      console.error('[PrinterStorage] Error saving printers:', error);
      throw error;
    }
  }

  /**
   * Ajouter ou mettre à jour une imprimante
   */
  async savePrinter(printer: PrinterConfig): Promise<void> {
    if (!this.initialized) await this.initialize();

    // Mise à jour du timestamp
    printer.updatedAt = new Date().toISOString();
    if (!printer.createdAt) {
      printer.createdAt = printer.updatedAt;
    }

    // Si c'est la première imprimante de ce type, la mettre par défaut
    if (printer.isDefault) {
      // Retirer le statut par défaut des autres imprimantes du même type
      for (const [id, p] of this.cache) {
        if (p.type === printer.type && p.id !== printer.id) {
          p.isDefault = false;
        }
      }
    } else {
      // Vérifier s'il y a une imprimante par défaut pour ce type
      const hasDefault = Array.from(this.cache.values()).some(
        p => p.type === printer.type && p.isDefault && p.id !== printer.id
      );
      if (!hasDefault) {
        printer.isDefault = true;
      }
    }

    this.cache.set(printer.id, printer);
    await this.savePrinters();
  }

  /**
   * Récupérer une imprimante par son ID
   */
  async getPrinter(id: string): Promise<PrinterConfig | null> {
    if (!this.initialized) await this.initialize();
    return this.cache.get(id) || null;
  }

  /**
   * Récupérer toutes les imprimantes
   */
  async getAllPrinters(): Promise<PrinterConfig[]> {
    if (!this.initialized) await this.initialize();
    return Array.from(this.cache.values());
  }

  /**
   * Récupérer les imprimantes par type
   */
  async getPrintersByType(type: PrinterType): Promise<PrinterConfig[]> {
    if (!this.initialized) await this.initialize();
    return Array.from(this.cache.values()).filter(p => p.type === type);
  }

  /**
   * Récupérer l'imprimante par défaut pour un type
   */
  async getDefaultPrinter(type: PrinterType): Promise<PrinterConfig | null> {
    if (!this.initialized) await this.initialize();
    
    const printers = await this.getPrintersByType(type);
    
    // Chercher l'imprimante par défaut active
    const defaultPrinter = printers.find(p => p.isDefault && p.isEnabled);
    if (defaultPrinter) return defaultPrinter;
    
    // Sinon, prendre la première imprimante active
    const activePrinter = printers.find(p => p.isEnabled);
    if (activePrinter) return activePrinter;
    
    // Sinon, prendre la première imprimante
    return printers[0] || null;
  }

  /**
   * Supprimer une imprimante
   */
  async deletePrinter(id: string): Promise<void> {
    if (!this.initialized) await this.initialize();
    
    const printer = this.cache.get(id);
    if (printer) {
      this.cache.delete(id);
      
      // Si c'était l'imprimante par défaut, en assigner une autre
      if (printer.isDefault) {
        const sameTypePrinters = await this.getPrintersByType(printer.type);
        if (sameTypePrinters.length > 0) {
          sameTypePrinters[0].isDefault = true;
          this.cache.set(sameTypePrinters[0].id, sameTypePrinters[0]);
        }
      }
      
      await this.savePrinters();
    }
  }

  /**
   * Mettre à jour le statut d'une imprimante
   */
  async updatePrinterStatus(
    id: string, 
    status: ConnectionStatus, 
    errorMessage?: string
  ): Promise<void> {
    const printer = await this.getPrinter(id);
    if (printer) {
      printer.status = status;
      printer.errorMessage = errorMessage;
      if (status === ConnectionStatus.CONNECTED) {
        printer.lastSeenAt = new Date().toISOString();
      }
      await this.savePrinter(printer);
    }
  }

  /**
   * Mettre à jour l'adresse IP d'une imprimante
   */
  async updatePrinterIp(id: string, ipAddress: string): Promise<void> {
    const printer = await this.getPrinter(id);
    if (printer) {
      printer.ipAddress = ipAddress;
      printer.updatedAt = new Date().toISOString();
      await this.savePrinter(printer);
    }
  }

  /**
   * Marquer une imprimante comme ayant imprimé
   */
  async markPrinterUsed(id: string): Promise<void> {
    const printer = await this.getPrinter(id);
    if (printer) {
      printer.lastPrintAt = new Date().toISOString();
      printer.lastSeenAt = new Date().toISOString();
      await this.savePrinter(printer);
    }
  }

  /**
   * Obtenir les paramètres globaux du module d'impression
   */
  async getSettings(): Promise<any> {
    try {
      const data = await AsyncStorage.getItem(this.SETTINGS_KEY);
      return data ? JSON.parse(data) : this.getDefaultSettings();
    } catch (error) {
      console.error('[PrinterStorage] Error loading settings:', error);
      return this.getDefaultSettings();
    }
  }

  /**
   * Sauvegarder les paramètres globaux
   */
  async saveSettings(settings: any): Promise<void> {
    try {
      await AsyncStorage.setItem(this.SETTINGS_KEY, JSON.stringify(settings));
    } catch (error) {
      console.error('[PrinterStorage] Error saving settings:', error);
      throw error;
    }
  }

  /**
   * Obtenir les paramètres par défaut
   */
  private getDefaultSettings(): any {
    return {
      enableQueue: true,
      enableAutoDiscovery: false,
      enableHealthCheck: true,
      healthCheckInterval: 300, // 5 minutes
      maxQueueSize: 100,
      defaultTimeout: 5000,
      defaultCharset: 'UTF-8',
      logLevel: 'info',
      autoPrintKitchen: true,
      autoCutPaper: true,
      printLogo: false,
      restaurantInfo: {
        name: 'Mokengeli Biloko',
        address: '',
        phone: '',
        taxId: '',
        footer: 'Merci de votre visite!'
      }
    };
  }

  /**
   * Réinitialiser toutes les configurations
   */
  async reset(): Promise<void> {
    this.cache.clear();
    await AsyncStorage.removeItem(this.STORAGE_KEY);
    await AsyncStorage.removeItem(this.SETTINGS_KEY);
    this.initialized = false;
  }

  /**
   * Créer une configuration d'imprimante par défaut
   */
  static createDefaultPrinterConfig(
    type: PrinterType,
    ipAddress: string,
    name?: string
  ): PrinterConfig {
    const id = `printer_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    const now = new Date().toISOString();
    
    return {
      id,
      name: name || `${type} Printer`,
      displayName: name || `Imprimante ${type}`,
      ipAddress,
      port: 9100, // Port par défaut ESC/POS
      type,
      isDefault: false,
      isEnabled: true,
      
      connectionType: 'TCP',
      timeout: 5000,
      maxRetries: 3,
      
      paperWidth: type === PrinterType.KITCHEN ? 80 : 58,
      charset: 'UTF-8',
      fontSize: 'normal',
      cutPaper: true,
      openCashDrawer: type === PrinterType.CASHIER,
      beepAfterPrint: type === PrinterType.KITCHEN,
      
      createdAt: now,
      updatedAt: now,
      status: ConnectionStatus.DISCONNECTED
    };
  }

  /**
   * Exporter les configurations (pour backup)
   */
  async exportConfigurations(): Promise<string> {
    if (!this.initialized) await this.initialize();
    
    const data = {
      version: '1.0',
      exportDate: new Date().toISOString(),
      printers: Array.from(this.cache.values()),
      settings: await this.getSettings()
    };
    
    return JSON.stringify(data, null, 2);
  }

  /**
   * Importer des configurations
   */
  async importConfigurations(jsonData: string): Promise<void> {
    try {
      const data = JSON.parse(jsonData);
      
      if (!data.version || !data.printers) {
        throw new Error('Format de données invalide');
      }
      
      // Importer les imprimantes
      this.cache.clear();
      data.printers.forEach((printer: PrinterConfig) => {
        // Réinitialiser certains champs
        printer.status = ConnectionStatus.DISCONNECTED;
        printer.updatedAt = new Date().toISOString();
        this.cache.set(printer.id, printer);
      });
      
      await this.savePrinters();
      
      // Importer les paramètres si présents
      if (data.settings) {
        await this.saveSettings(data.settings);
      }
      
    } catch (error) {
      console.error('[PrinterStorage] Error importing configurations:', error);
      throw error;
    }
  }
}