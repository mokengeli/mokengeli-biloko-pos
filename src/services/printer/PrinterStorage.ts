// src/services/printer/PrinterStorage.ts

import AsyncStorage from '@react-native-async-storage/async-storage';
import { PrinterConfig, PrintJob } from '../../types/printer.types';

/**
 * Service de persistance pour les configurations d'imprimantes
 * Utilise AsyncStorage mais peut être facilement remplacé
 */
export class PrinterStorage {
  private static readonly STORAGE_KEYS = {
    PRINTERS: '@printer_configs',
    DEFAULT_PRINTER: '@default_printer_id',
    PRINT_QUEUE: '@print_queue',
    SETTINGS: '@printer_settings'
  };

  // ============================================================================
  // GESTION DES IMPRIMANTES
  // ============================================================================

  /**
   * Sauvegarde toutes les configurations d'imprimantes
   */
  static async savePrinters(printers: PrinterConfig[]): Promise<void> {
    try {
      const jsonData = JSON.stringify(printers, (key, value) => {
        // Convertir les dates en ISO string pour le stockage
        if (value instanceof Date) {
          return value.toISOString();
        }
        return value;
      });
      
      await AsyncStorage.setItem(this.STORAGE_KEYS.PRINTERS, jsonData);
      console.log(`[PrinterStorage] Saved ${printers.length} printer configurations`);
    } catch (error) {
      console.error('[PrinterStorage] Error saving printers:', error);
      throw new Error('Failed to save printer configurations');
    }
  }

  /**
   * Récupère toutes les configurations d'imprimantes
   */
  static async loadPrinters(): Promise<PrinterConfig[]> {
    try {
      const jsonData = await AsyncStorage.getItem(this.STORAGE_KEYS.PRINTERS);
      
      if (!jsonData) {
        console.log('[PrinterStorage] No printers found in storage');
        return [];
      }

      const printers = JSON.parse(jsonData, (key, value) => {
        // Reconvertir les dates ISO en objets Date
        if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
          return new Date(value);
        }
        return value;
      });

      console.log(`[PrinterStorage] Loaded ${printers.length} printer configurations`);
      return printers;
    } catch (error) {
      console.error('[PrinterStorage] Error loading printers:', error);
      return [];
    }
  }

  /**
   * Ajoute ou met à jour une configuration d'imprimante
   */
  static async savePrinter(printer: PrinterConfig): Promise<void> {
    const printers = await this.loadPrinters();
    const index = printers.findIndex(p => p.id === printer.id);
    
    if (index >= 0) {
      printers[index] = printer;
      console.log(`[PrinterStorage] Updated printer: ${printer.name}`);
    } else {
      printers.push(printer);
      console.log(`[PrinterStorage] Added new printer: ${printer.name}`);
    }
    
    await this.savePrinters(printers);
  }

  /**
   * Supprime une configuration d'imprimante
   */
  static async deletePrinter(printerId: string): Promise<void> {
    const printers = await this.loadPrinters();
    const filtered = printers.filter(p => p.id !== printerId);
    
    if (filtered.length < printers.length) {
      await this.savePrinters(filtered);
      console.log(`[PrinterStorage] Deleted printer with id: ${printerId}`);
      
      // Si c'était l'imprimante par défaut, la retirer
      const defaultId = await this.getDefaultPrinterId();
      if (defaultId === printerId) {
        await this.clearDefaultPrinter();
      }
    }
  }

  /**
   * Récupère une configuration d'imprimante par ID
   */
  static async getPrinter(printerId: string): Promise<PrinterConfig | null> {
    const printers = await this.loadPrinters();
    return printers.find(p => p.id === printerId) || null;
  }

  // ============================================================================
  // GESTION DE L'IMPRIMANTE PAR DÉFAUT
  // ============================================================================

  /**
   * Définit l'imprimante par défaut
   */
  static async setDefaultPrinter(printerId: string): Promise<void> {
    try {
      // Mettre à jour le flag isDefault sur toutes les imprimantes
      const printers = await this.loadPrinters();
      const updatedPrinters = printers.map(p => ({
        ...p,
        isDefault: p.id === printerId
      }));
      
      await this.savePrinters(updatedPrinters);
      await AsyncStorage.setItem(this.STORAGE_KEYS.DEFAULT_PRINTER, printerId);
      
      console.log(`[PrinterStorage] Set default printer: ${printerId}`);
    } catch (error) {
      console.error('[PrinterStorage] Error setting default printer:', error);
      throw new Error('Failed to set default printer');
    }
  }

  /**
   * Récupère l'ID de l'imprimante par défaut
   */
  static async getDefaultPrinterId(): Promise<string | null> {
    try {
      return await AsyncStorage.getItem(this.STORAGE_KEYS.DEFAULT_PRINTER);
    } catch (error) {
      console.error('[PrinterStorage] Error getting default printer:', error);
      return null;
    }
  }

  /**
   * Récupère la configuration de l'imprimante par défaut
   */
  static async getDefaultPrinter(): Promise<PrinterConfig | null> {
    const printerId = await this.getDefaultPrinterId();
    if (!printerId) return null;
    
    return await this.getPrinter(printerId);
  }

  /**
   * Supprime l'imprimante par défaut
   */
  static async clearDefaultPrinter(): Promise<void> {
    try {
      await AsyncStorage.removeItem(this.STORAGE_KEYS.DEFAULT_PRINTER);
      
      // Mettre à jour le flag isDefault
      const printers = await this.loadPrinters();
      const updatedPrinters = printers.map(p => ({
        ...p,
        isDefault: false
      }));
      
      await this.savePrinters(updatedPrinters);
      console.log('[PrinterStorage] Cleared default printer');
    } catch (error) {
      console.error('[PrinterStorage] Error clearing default printer:', error);
    }
  }

  // ============================================================================
  // GESTION DE LA FILE D'ATTENTE
  // ============================================================================

  /**
   * Sauvegarde la file d'attente d'impression
   */
  static async savePrintQueue(jobs: PrintJob[]): Promise<void> {
    try {
      const jsonData = JSON.stringify(jobs, (key, value) => {
        if (value instanceof Date) {
          return value.toISOString();
        }
        if (value instanceof Buffer) {
          return { type: 'Buffer', data: Array.from(value) };
        }
        return value;
      });
      
      await AsyncStorage.setItem(this.STORAGE_KEYS.PRINT_QUEUE, jsonData);
      console.log(`[PrinterStorage] Saved ${jobs.length} print jobs to queue`);
    } catch (error) {
      console.error('[PrinterStorage] Error saving print queue:', error);
    }
  }

  /**
   * Charge la file d'attente d'impression
   */
  static async loadPrintQueue(): Promise<PrintJob[]> {
    try {
      const jsonData = await AsyncStorage.getItem(this.STORAGE_KEYS.PRINT_QUEUE);
      
      if (!jsonData) {
        return [];
      }

      const jobs = JSON.parse(jsonData, (key, value) => {
        if (typeof value === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/.test(value)) {
          return new Date(value);
        }
        if (value && typeof value === 'object' && value.type === 'Buffer') {
          return Buffer.from(value.data);
        }
        return value;
      });

      console.log(`[PrinterStorage] Loaded ${jobs.length} print jobs from queue`);
      return jobs;
    } catch (error) {
      console.error('[PrinterStorage] Error loading print queue:', error);
      return [];
    }
  }

  /**
   * Efface la file d'attente
   */
  static async clearPrintQueue(): Promise<void> {
    try {
      await AsyncStorage.removeItem(this.STORAGE_KEYS.PRINT_QUEUE);
      console.log('[PrinterStorage] Cleared print queue');
    } catch (error) {
      console.error('[PrinterStorage] Error clearing print queue:', error);
    }
  }

  // ============================================================================
  // GESTION DES PARAMÈTRES GLOBAUX
  // ============================================================================

  /**
   * Sauvegarde les paramètres globaux d'impression
   */
  static async saveSettings(settings: any): Promise<void> {
    try {
      await AsyncStorage.setItem(this.STORAGE_KEYS.SETTINGS, JSON.stringify(settings));
      console.log('[PrinterStorage] Saved printer settings');
    } catch (error) {
      console.error('[PrinterStorage] Error saving settings:', error);
    }
  }

  /**
   * Charge les paramètres globaux d'impression
   */
  static async loadSettings(): Promise<any> {
    try {
      const jsonData = await AsyncStorage.getItem(this.STORAGE_KEYS.SETTINGS);
      return jsonData ? JSON.parse(jsonData) : {};
    } catch (error) {
      console.error('[PrinterStorage] Error loading settings:', error);
      return {};
    }
  }

  // ============================================================================
  // UTILITAIRES
  // ============================================================================

  /**
   * Efface toutes les données de configuration
   */
  static async clearAll(): Promise<void> {
    try {
      await AsyncStorage.multiRemove([
        this.STORAGE_KEYS.PRINTERS,
        this.STORAGE_KEYS.DEFAULT_PRINTER,
        this.STORAGE_KEYS.PRINT_QUEUE,
        this.STORAGE_KEYS.SETTINGS
      ]);
      console.log('[PrinterStorage] Cleared all printer data');
    } catch (error) {
      console.error('[PrinterStorage] Error clearing all data:', error);
    }
  }

  /**
   * Exporte toutes les configurations (pour backup)
   */
  static async exportConfigurations(): Promise<string> {
    try {
      const printers = await this.loadPrinters();
      const defaultId = await this.getDefaultPrinterId();
      const settings = await this.loadSettings();
      
      const exportData = {
        version: '1.0',
        exportedAt: new Date().toISOString(),
        printers,
        defaultPrinterId: defaultId,
        settings
      };
      
      return JSON.stringify(exportData, null, 2);
    } catch (error) {
      console.error('[PrinterStorage] Error exporting configurations:', error);
      throw new Error('Failed to export configurations');
    }
  }

  /**
   * Importe des configurations (depuis un backup)
   */
  static async importConfigurations(jsonData: string): Promise<void> {
    try {
      const importData = JSON.parse(jsonData);
      
      if (!importData.version || !importData.printers) {
        throw new Error('Invalid import data format');
      }
      
      // Restaurer les imprimantes
      await this.savePrinters(importData.printers);
      
      // Restaurer l'imprimante par défaut
      if (importData.defaultPrinterId) {
        await this.setDefaultPrinter(importData.defaultPrinterId);
      }
      
      // Restaurer les paramètres
      if (importData.settings) {
        await this.saveSettings(importData.settings);
      }
      
      console.log('[PrinterStorage] Successfully imported configurations');
    } catch (error) {
      console.error('[PrinterStorage] Error importing configurations:', error);
      throw new Error('Failed to import configurations');
    }
  }
}