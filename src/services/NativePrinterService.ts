// Service d'impression utilisant la librairie native ESC/POS
// Ce service utilise react-native-esc-pos-printer pour communiquer avec les imprimantes

import { Platform, Alert } from 'react-native';
import { DomainOrder } from '../api/orderService';
import { printerDebugLogger } from './PrinterDebugLogger';

// Interface pour react-native-esc-pos-printer v4.4.3
interface EscPosPrinterModule {
  Printer: any;
  PrinterConstants: any;
}

// Déclaration du module natif v4.4.3 (sera disponible après build EAS)
let EscPosPrinterModule: EscPosPrinterModule | null = null;

try {
  // Ce module ne sera disponible qu'après un build EAS
  // En dev local avec Expo Go, il sera undefined
  const module = require('react-native-esc-pos-printer');
  EscPosPrinterModule = {
    Printer: module.Printer,
    PrinterConstants: module.PrinterConstants
  };
  console.log('✅ Module ESC/POS v4.4.3 chargé avec classes Printer');
} catch (error) {
  console.log('⚠️ Module ESC/POS natif non disponible - Utiliser EAS Build');
  EscPosPrinterModule = null;
}

export class NativePrinterService {
  private static printerInstance: any = null;
  private static isConnected = false;

  // Vérifier si le module natif est disponible
  static isNativeModuleAvailable(): boolean {
    return EscPosPrinterModule !== null && EscPosPrinterModule.Printer !== undefined;
  }

  // Initialiser le service d'impression
  static async initialize(): Promise<boolean> {
    if (!this.isNativeModuleAvailable()) {
      console.warn('Module natif non disponible - Nécessite EAS Build');
      return false;
    }

    try {
      await EscPosPrinter!.init();
      console.log('Service d\'impression natif initialisé');
      return true;
    } catch (error) {
      console.error('Erreur initialisation service natif:', error);
      return false;
    }
  }

  // Découvrir les imprimantes disponibles
  static async discoverPrinters(): Promise<any[]> {
    if (!this.isNativeModuleAvailable()) {
      return [];
    }

    try {
      console.log('Recherche des imprimantes...');
      const printers = await EscPosPrinter!.discover();
      console.log(`${printers.length} imprimantes trouvées`);
      return printers;
    } catch (error) {
      console.error('Erreur découverte imprimantes:', error);
      return [];
    }
  }

  // Se connecter à une imprimante (IP ou adresse Bluetooth)
  static async connectToPrinter(address: string): Promise<boolean> {
    if (!this.isNativeModuleAvailable()) {
      Alert.alert(
        'Module non disponible',
        'Le module d\'impression natif n\'est pas disponible.\n\n' +
        'Utilisez EAS Build pour créer une version avec support natif.'
      );
      return false;
    }

    try {
      // Si c'est une IP, formater correctement
      if (address.includes('.')) {
        // Format IP:PORT
        if (!address.includes(':')) {
          address = `${address}:9100`;
        }
      }
      
      const [ip, portStr] = address.split(':');
      const port = parseInt(portStr || '9100');
      printerDebugLogger.connectionAttempt(ip, port);

      // Nouvelle API v4.4.3 : Utiliser la classe Printer
      const { Printer, PrinterConstants } = EscPosPrinterModule!;
      
      // Créer une instance de l'imprimante avec TCP
      this.printerInstance = new Printer({
        target: `TCP:${ip}`, // Format attendu par Epson SDK
        deviceName: "ESC-POS-Printer"
      });

      printerDebugLogger.info('Instance Printer créée', { 
        target: `TCP:${ip}`,
        hasConstants: !!PrinterConstants 
      });

      // Se connecter avec retry automatique
      await Printer.tryToConnectUntil(
        this.printerInstance,
        (status: any) => {
          printerDebugLogger.info('Status de connexion', status);
          return status.online.statusCode === PrinterConstants.TRUE;
        },
        {
          maxRetryCount: 3,
          retryInterval: 1000
        }
      );

      this.isConnected = true;
      printerDebugLogger.connectionSuccess(ip, port);
      printerDebugLogger.info('Connexion établie avec la nouvelle API v4.4.3');
      
      return true;
    } catch (error) {
      this.isConnected = false;
      this.printerInstance = null;
      
      const [ip, portStr] = address.split(':');
      const port = parseInt(portStr || '9100');
      printerDebugLogger.connectionFailed(ip, port, error);
      
      // Log détaillé de l'erreur
      const errorMsg = error instanceof Error ? error.message : String(error);
      printerDebugLogger.error('Détails erreur connexion v4.4.3', {
        address,
        tcpTarget: `TCP:${ip}`,
        errorType: error?.constructor?.name,
        message: errorMsg,
        stack: error instanceof Error ? error.stack : undefined
      });
      
      return false;
    }
  }

  // Déconnecter l'imprimante
  static async disconnect(): Promise<void> {
    if (!this.isNativeModuleAvailable() || !this.isConnected || !this.printerInstance) {
      return;
    }

    try {
      await this.printerInstance.disconnect();
      this.isConnected = false;
      this.printerInstance = null;
      printerDebugLogger.info('Déconnecté de l\'imprimante avec succès');
    } catch (error) {
      printerDebugLogger.error('Erreur déconnexion', error);
    }
  }

  // Imprimer un ticket de commande
  static async printOrder(order: DomainOrder): Promise<boolean> {
    if (!this.isNativeModuleAvailable()) {
      Alert.alert(
        'Impression impossible',
        'Le module natif n\'est pas disponible. Utilisez EAS Build.'
      );
      return false;
    }

    if (!this.isConnected) {
      Alert.alert('Erreur', 'Aucune imprimante connectée');
      return false;
    }

    try {
      console.log('Impression de la commande:', order.orderNumber);

      // Générer le contenu du ticket
      const ticket = this.generateOrderTicket(order);
      
      // Envoyer à l'imprimante
      await EscPosPrinter!.printText(ticket);
      
      // Couper le papier
      await EscPosPrinter!.cutPaper();
      
      console.log('Impression réussie');
      return true;
    } catch (error) {
      console.error('Erreur impression:', error);
      Alert.alert('Erreur', 'Échec de l\'impression');
      return false;
    }
  }

  // Imprimer un ticket de test
  static async printTestTicket(printerName: string, ip: string, port: number): Promise<boolean> {
    if (!this.isNativeModuleAvailable()) {
      printerDebugLogger.warning('Module natif non disponible pour le test');
      Alert.alert(
        'Test impossible',
        'Le module d\'impression natif n\'est pas disponible.\n\n' +
        '⚠️ Ceci est normal en développement local.\n\n' +
        '✅ Pour tester l\'impression:\n' +
        '1. Faites un build EAS: eas build --platform android\n' +
        '2. Installez l\'APK sur votre appareil\n' +
        '3. L\'impression fonctionnera dans l\'APK'
      );
      return false;
    }
    
    printerDebugLogger.info('Module natif disponible, début test impression', { 
      printerName, 
      ip, 
      port 
    });

    try {
      // Se connecter si nécessaire
      if (!this.isConnected || this.currentPrinter !== `${ip}:${port}`) {
        printerDebugLogger.info('Nouvelle connexion nécessaire', {
          isConnected: this.isConnected,
          currentPrinter: this.currentPrinter,
          targetPrinter: `${ip}:${port}`
        });
        
        const connected = await this.connectToPrinter(`${ip}:${port}`);
        if (!connected) {
          printerDebugLogger.error('Connexion échouée, abandon du test');
          return false;
        }
      } else {
        printerDebugLogger.info('Utilisation de la connexion existante');
      }

      // Ticket de test enrichi pour diagnostic
      const testTicket = `
================================
      MOKENGELI BILOKO POS
        TEST D'IMPRESSION NATIF
================================

📋 INFORMATIONS DE DIAGNOSTIC:
Imprimante: ${printerName}
IP: ${ip}:${port}
Date: ${new Date().toLocaleString()}
Module: react-native-esc-pos-printer
Status: CONNECTÉ

--------------------------------
🔧 TESTS RÉSEAU:
✅ Connexion TCP établie
✅ Module natif chargé
✅ Commandes ESC/POS envoyées

--------------------------------
📱 ENVIRONNEMENT:
Build: EAS Build (APK)
Mode: Production/Preview
Platform: Android

================================
🎯 TEST RÉUSSI !
🖨️ Impression native fonctionnelle
================================



`;

      // Imprimer avec la nouvelle API v4.4.3
      printerDebugLogger.printStart(printerName, 'test');
      
      if (!this.printerInstance) {
        throw new Error('Aucune instance d\'imprimante connectée');
      }

      // Utiliser addQueueTask pour gérer l'impression de manière synchrone
      const result = await this.printerInstance.addQueueTask(async () => {
        // Ajouter le texte à imprimer
        await this.printerInstance.addText(testTicket);
        printerDebugLogger.info('addText() exécuté', { printerName, textLength: testTicket.length });
        
        // Ajouter saut de ligne
        await this.printerInstance.addFeedLine();
        
        // Couper le papier
        await this.printerInstance.addCut();
        printerDebugLogger.info('addCut() exécuté', { printerName });
        
        // Envoyer les données à l'imprimante
        const printResult = await this.printerInstance.sendData();
        printerDebugLogger.info('sendData() exécuté', { 
          printerName, 
          result: printResult 
        });
        
        return printResult;
      });

      printerDebugLogger.printSuccess(printerName, 'test');
      printerDebugLogger.info('Impression terminée avec succès', { result });
      
      return true;
    } catch (error) {
      printerDebugLogger.printFailed(printerName, error);
      return false;
    }
  }

  // Méthode principale pour imprimer un ticket (appelée par PrinterService)
  static async printTicket(printerName: string, ip: string, port: number, order: DomainOrder): Promise<void> {
    if (!this.isNativeModuleAvailable()) {
      printerDebugLogger.warning('Module natif non disponible pour l\'impression ticket');
      throw new Error('Module natif non disponible');
    }

    printerDebugLogger.info('Début impression ticket commande', {
      printerName,
      ip,
      port,
      orderNumber: order.orderNumber,
      tableId: order.tableId
    });

    try {
      // Se connecter si nécessaire
      if (!this.isConnected || !this.printerInstance) {
        printerDebugLogger.info('Connexion nécessaire pour impression ticket');
        const connected = await this.connectToPrinter(`${ip}:${port}`);
        if (!connected) {
          printerDebugLogger.error('Connexion échouée, abandon impression ticket');
          throw new Error(`Connexion échouée à l'imprimante ${printerName} (${ip}:${port})`);
        }
      }

      // Générer le ticket de commande
      const orderTicket = this.generateOrderTicket(order);

      // Imprimer avec la nouvelle API v4.4.3
      printerDebugLogger.printStart(printerName, 'ticket');

      const result = await this.printerInstance.addQueueTask(async () => {
        // Ajouter le contenu du ticket
        await this.printerInstance.addText(orderTicket);
        printerDebugLogger.info('Ticket ajouté', { 
          printerName, 
          orderNumber: order.orderNumber,
          textLength: orderTicket.length 
        });

        // Ajouter saut de ligne
        await this.printerInstance.addFeedLine();

        // Couper le papier
        await this.printerInstance.addCut();
        printerDebugLogger.info('Coupe papier ajoutée', { printerName });

        // Envoyer à l'imprimante
        const printResult = await this.printerInstance.sendData();
        printerDebugLogger.info('Données envoyées à l\'imprimante', {
          printerName,
          result: printResult
        });

        return printResult;
      });

      printerDebugLogger.printSuccess(printerName, 'ticket');
      printerDebugLogger.success(`Ticket #${order.orderNumber} imprimé avec succès`, { result });
    } catch (error) {
      printerDebugLogger.printFailed(printerName, error);
      printerDebugLogger.error('Erreur impression ticket commande', {
        orderNumber: order.orderNumber,
        error: error instanceof Error ? error.message : String(error)
      });
      
      // Re-lancer l'erreur avec un message clair
      if (error instanceof Error) {
        throw error; // Propager l'erreur originale
      } else {
        throw new Error(`Erreur lors de l'impression du ticket #${order.orderNumber}`);
      }
    }
  }

  // Générer le contenu du ticket
  private static generateOrderTicket(order: DomainOrder): string {
    const lineWidth = 32;
    const separator = '='.repeat(lineWidth);
    const dashes = '-'.repeat(lineWidth);
    
    // Helper pour centrer le texte
    const centerText = (text: string): string => {
      const padding = Math.max(0, Math.floor((lineWidth - text.length) / 2));
      return ' '.repeat(padding) + text;
    };
    
    // Helper pour aligner à droite
    const rightAlign = (text: string): string => {
      const padding = Math.max(0, lineWidth - text.length);
      return ' '.repeat(padding) + text;
    };
    
    // Formater un article
    const formatItem = (item: any): string => {
      const name = item.dishName.length > 20 
        ? item.dishName.substring(0, 17) + '...' 
        : item.dishName;
      const quantity = `${item.count}x`;
      const price = `${(item.unitPrice * item.count).toFixed(2)} ${order.currency.code}`;
      const nameSection = `${quantity} ${name}`;
      const padding = Math.max(1, lineWidth - nameSection.length - price.length);
      return nameSection + ' '.repeat(padding) + price;
    };

    // Construction du ticket
    let ticket = separator + '\n';
    ticket += centerText('MOKENGELI BILOKO POS') + '\n';
    ticket += centerText('Restaurant') + '\n';
    ticket += separator + '\n\n';
    
    ticket += `Commande: ${order.orderNumber}\n`;
    ticket += `Table: ${order.tableName}\n`;
    ticket += `Serveur: ${order.waiterName || 'N/A'}\n`;
    ticket += `Date: ${new Date(order.orderDate).toLocaleString()}\n\n`;
    
    ticket += dashes + '\n';
    ticket += 'ARTICLES:\n';
    ticket += dashes + '\n';
    
    order.items.forEach(item => {
      ticket += formatItem(item) + '\n';
    });
    
    ticket += dashes + '\n\n';
    ticket += rightAlign(`TOTAL: ${order.totalPrice.toFixed(2)} ${order.currency.code}`) + '\n\n';
    ticket += separator + '\n';
    ticket += centerText('Merci de votre visite!') + '\n';
    ticket += centerText('A bientôt') + '\n';
    ticket += '\n\n\n';
    
    return ticket;
  }

  // Vérifier la connexion à une imprimante
  static async testConnection(ip: string, port: number): Promise<boolean> {
    if (!this.isNativeModuleAvailable()) {
      console.log('Module natif non disponible pour test');
      return false;
    }

    try {
      const address = `${ip}:${port}`;
      await this.connectToPrinter(address);
      
      if (this.isConnected) {
        await this.disconnect();
        return true;
      }
      
      return false;
    } catch (error) {
      console.error('Erreur test connexion:', error);
      return false;
    }
  }
}

export default NativePrinterService;