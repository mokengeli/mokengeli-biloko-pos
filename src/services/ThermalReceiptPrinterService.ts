// Service d'impression utilisant react-native-thermal-receipt-printer
// Cette bibliothèque supporte TCP/IP, USB et Bluetooth avec une API stable
import { Platform, Alert } from 'react-native';
import { DomainOrder } from '../api/orderService';
import { printerDebugLogger } from './PrinterDebugLogger';

// Import conditionnel et sécurisé de la librairie
let NetPrinter: any = null;

try {
  // Cette librairie devrait être disponible après installation
  const ThermalReceiptPrinter = require('react-native-thermal-receipt-printer');
  NetPrinter = ThermalReceiptPrinter.NetPrinter;
  console.log('✅ Module react-native-thermal-receipt-printer chargé');
} catch (error) {
  console.log('⚠️ Module react-native-thermal-receipt-printer non disponible:', error);
  NetPrinter = null;
}

// Types pour la nouvelle librairie (basés sur la vraie API)
interface INetPrinterIdentity {
  deviceName: string;
  host: string;
  port: number;
}

export class ThermalReceiptPrinterService {
  private static currentPrinter: INetPrinterIdentity | null = null;
  private static isConnected = false;

  // Vérifier si le module est disponible
  static isModuleAvailable(): boolean {
    return NetPrinter !== null;
  }

  // Initialiser la connexion TCP
  static async connectToPrinter(ip: string, port: number = 9100, timeout: number = 10000): Promise<boolean> {
    if (!this.isModuleAvailable()) {
      printerDebugLogger.error('Module react-native-thermal-receipt-printer non disponible');
      return false;
    }

    printerDebugLogger.connectionAttempt(ip, port);

    try {
      // Initialisation avec la vraie API
      await NetPrinter.init();
      printerDebugLogger.info('NetPrinter initialisé');

      // Configuration de l'imprimante réseau
      const printerConfig: INetPrinterIdentity = {
        deviceName: `Printer-${ip}`,
        host: ip,
        port: port
      };

      printerDebugLogger.info('Configuration imprimante TCP', printerConfig);

      // Connecter à l'imprimante avec la vraie API
      const connectedPrinter = await NetPrinter.connectPrinter(printerConfig.host, printerConfig.port);
      
      this.isConnected = true;
      this.currentPrinter = printerConfig;
      
      printerDebugLogger.connectionSuccess(ip, port);
      printerDebugLogger.info('Connexion TCP établie avec react-native-thermal-receipt-printer');
      
      return true;
    } catch (error) {
      this.isConnected = false;
      this.currentPrinter = null;
      
      printerDebugLogger.connectionFailed(ip, port, error);
      printerDebugLogger.error('Erreur connexion TCP', {
        ip,
        port,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      
      return false;
    }
  }

  // Déconnecter l'imprimante
  static async disconnect(): Promise<void> {
    if (!this.isModuleAvailable() || !this.isConnected) {
      return;
    }

    try {
      await NetPrinter.closeConn();
      this.isConnected = false;
      this.currentPrinter = null;
      printerDebugLogger.info('Déconnecté de l\'imprimante avec succès');
    } catch (error) {
      printerDebugLogger.error('Erreur déconnexion', error);
    }
  }

  // Test de connexion simple
  static async testConnection(ip: string, port: number): Promise<boolean> {
    if (!this.isModuleAvailable()) {
      console.log('Module non disponible pour test');
      return false;
    }

    try {
      const connected = await this.connectToPrinter(ip, port, 5000);
      if (connected) {
        await this.disconnect();
        return true;
      }
      return false;
    } catch (error) {
      console.error('Erreur test connexion:', error);
      return false;
    }
  }

  // Imprimer un ticket de test
  static async printTestTicket(printerName: string, ip: string, port: number): Promise<boolean> {
    if (!this.isModuleAvailable()) {
      printerDebugLogger.warning('Module non disponible pour le test');
      Alert.alert(
        'Test impossible',
        'Le module d\'impression n\'est pas disponible.\n\n' +
        '⚠️ Ceci peut être normal en développement local.\n\n' +
        '✅ Pour tester l\'impression:\n' +
        '1. Faites un build EAS: eas build --platform android\n' +
        '2. Installez l\'APK sur votre appareil\n' +
        '3. L\'impression fonctionnera dans l\'APK'
      );
      return false;
    }

    printerDebugLogger.info('Début test impression avec react-native-thermal-receipt-printer', { 
      printerName, 
      ip, 
      port 
    });

    try {
      // Se connecter si nécessaire
      if (!this.isConnected || !this.currentPrinter || this.currentPrinter.host !== ip || this.currentPrinter.port !== port) {
        const connected = await this.connectToPrinter(ip, port);
        if (!connected) {
          printerDebugLogger.error('Connexion échouée, abandon du test');
          return false;
        }
      }

      printerDebugLogger.printStart(printerName, 'test');

      // Créer le ticket de test avec les balises de formatage de la vraie API
      const testTicket = `<C>================================</C>
<C><B>MOKENGELI BILOKO POS</B></C>
<C><B>TEST D'IMPRESSION</B></C>
<C>================================</C>

<B>📋 INFORMATIONS DE DIAGNOSTIC:</B>
Imprimante: ${printerName}
IP: ${ip}:${port}
Date: ${new Date().toLocaleString()}
Module: react-native-thermal-receipt-printer
Status: CONNECTÉ

<C>--------------------------------</C>
<B>🔧 TESTS RÉSEAU:</B>
✅ Connexion TCP établie
✅ Module chargé  
✅ Commandes envoyées

<C>================================</C>
<C><B>🎯 TEST RÉUSSI !</B></C>
<C><B>🖨️ Impression fonctionnelle</B></C>
<C>================================</C>

`;

      // Utiliser la vraie API pour imprimer (printBill coupe automatiquement le papier)
      await NetPrinter.printBill(testTicket);

      printerDebugLogger.printSuccess(printerName, 'test');
      printerDebugLogger.info('Test d\'impression terminé avec succès');
      
      return true;
    } catch (error) {
      printerDebugLogger.printFailed(printerName, error);
      printerDebugLogger.error('Erreur test impression', {
        printerName,
        ip,
        port,
        error: error instanceof Error ? error.message : String(error),
        stack: error instanceof Error ? error.stack : undefined
      });
      
      return false;
    }
  }

  // Imprimer un ticket de commande
  static async printTicket(printerName: string, ip: string, port: number, order: DomainOrder): Promise<void> {
    if (!this.isModuleAvailable()) {
      throw new Error('Module d\'impression non disponible');
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
      if (!this.isConnected || !this.currentPrinter || this.currentPrinter.host !== ip || this.currentPrinter.port !== port) {
        const connected = await this.connectToPrinter(ip, port);
        if (!connected) {
          throw new Error(`Connexion échouée à l'imprimante ${printerName} (${ip}:${port})`);
        }
      }

      // Générer le ticket de commande avec les balises de formatage
      const orderTicket = this.generateOrderTicketFormatted(order);

      printerDebugLogger.printStart(printerName, 'ticket');

      // Utiliser la vraie API pour imprimer (printBill coupe automatiquement le papier)
      await NetPrinter.printBill(orderTicket);

      printerDebugLogger.printSuccess(printerName, 'ticket');
      printerDebugLogger.success(`Ticket #${order.orderNumber} imprimé avec succès`);

    } catch (error) {
      printerDebugLogger.printFailed(printerName, error);
      printerDebugLogger.error('Erreur impression ticket commande', {
        orderNumber: order.orderNumber,
        error: error instanceof Error ? error.message : String(error)
      });

      // Re-lancer l'erreur avec un message clair
      if (error instanceof Error) {
        throw error;
      } else {
        throw new Error(`Erreur lors de l'impression du ticket #${order.orderNumber}`);
      }
    }
  }

  // Générer le ticket de commande avec balises de formatage
  private static generateOrderTicketFormatted(order: DomainOrder): string {
    let ticket = `<C>================================</C>
<C><B>MOKENGELI BILOKO POS</B></C>
<C>Restaurant</C>
<C>================================</C>

<B>Commande: ${order.orderNumber}</B>
Table: ${order.tableName}
Serveur: ${order.waiterName || 'N/A'}
Date: ${new Date(order.orderDate).toLocaleString()}

<C>--------------------------------</C>
<B>ARTICLES:</B>
<C>--------------------------------</C>
`;

    // Articles
    order.items.forEach(item => {
      const name = item.dishName.length > 20 
        ? item.dishName.substring(0, 17) + '...' 
        : item.dishName;
      const quantity = `${item.count}x`;
      const price = `${(item.unitPrice * item.count).toFixed(2)} ${order.currency.code}`;
      
      // Ligne d'article avec alignement simulé
      const itemLine = `${quantity} ${name}`;
      const padding = Math.max(1, 32 - itemLine.length - price.length);
      const fullLine = itemLine + ' '.repeat(padding) + price;
      
      ticket += fullLine + '\n';
    });

    // Total et pied de page
    ticket += `
<C>--------------------------------</C>

<R><B>TOTAL: ${order.totalPrice.toFixed(2)} ${order.currency.code}</B></R>

<C>================================</C>
<C>Merci de votre visite!</C>
<C>A bientôt</C>

`;

    return ticket;
  }
}

export default ThermalReceiptPrinterService;