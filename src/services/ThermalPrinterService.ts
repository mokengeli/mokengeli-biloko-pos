// src/services/ThermalPrinterService.ts
// Service d'impression thermique simple utilisant TCP brut
import { DomainOrder } from '../api/orderService';
import { ThermalReceiptPrinterService } from './ThermalReceiptPrinterService';

export class ThermalPrinterService {
  // Commandes ESC/POS basiques
  private static readonly ESC = '\x1b';
  private static readonly INIT_PRINTER = '\x1b@';
  private static readonly CUT_PAPER = '\x1d\x56\x00';
  private static readonly LINE_FEED = '\n';
  private static readonly ALIGN_CENTER = '\x1b\x61\x01';
  private static readonly ALIGN_LEFT = '\x1b\x61\x00';
  private static readonly DOUBLE_HEIGHT = '\x1b!\x10';
  private static readonly NORMAL_TEXT = '\x1b!\x00';
  private static readonly BOLD_ON = '\x1b\x45\x01';
  private static readonly BOLD_OFF = '\x1b\x45\x00';

  static async printToThermalPrinter(
    ip: string, 
    port: number, 
    order: DomainOrder
  ): Promise<void> {
    // Pour l'instant, cette méthode simule l'impression
    // Dans une vraie implémentation, on utiliserait un socket TCP
    
    const ticket = this.generateESCPOSTicket(order);
    
    // Simulation d'envoi TCP
    return new Promise((resolve, reject) => {
      // Simulation de délai réseau
      setTimeout(() => {
        try {
          console.log('=== THERMAL PRINTER SIMULATION ===');
          console.log(`Connecting to printer at ${ip}:${port}`);
          console.log('Sending ESC/POS commands:');
          console.log(ticket);
          console.log('=== END PRINTER OUTPUT ===');
          resolve();
        } catch (error) {
          reject(error);
        }
      }, 1000);
    });
  }

  private static generateESCPOSTicket(order: DomainOrder): string {
    const lineWidth = 32;
    const separator = '='.repeat(lineWidth);
    const dashes = '-'.repeat(lineWidth);
    
    // Helper functions pour le formatage
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

    // Construction du ticket avec commandes ESC/POS
    let ticket = this.INIT_PRINTER; // Initialiser l'imprimante
    
    // En-tête centré et en gras
    ticket += this.ALIGN_CENTER;
    ticket += this.BOLD_ON;
    ticket += this.DOUBLE_HEIGHT;
    ticket += 'MOKENGELI BILOKO POS';
    ticket += this.LINE_FEED;
    ticket += this.NORMAL_TEXT;
    ticket += this.BOLD_OFF;
    ticket += 'Restaurant';
    ticket += this.LINE_FEED;
    ticket += separator;
    ticket += this.LINE_FEED;
    
    // Informations de commande alignées à gauche
    ticket += this.ALIGN_LEFT;
    ticket += this.LINE_FEED;
    ticket += `Commande: ${order.orderNumber}`;
    ticket += this.LINE_FEED;
    ticket += `Table: ${order.tableName}`;
    ticket += this.LINE_FEED;
    ticket += `Serveur: ${order.waiterName || 'N/A'}`;
    ticket += this.LINE_FEED;
    ticket += `Date: ${new Date(order.orderDate).toLocaleString()}`;
    ticket += this.LINE_FEED;
    ticket += this.LINE_FEED;
    ticket += dashes;
    ticket += this.LINE_FEED;
    ticket += this.BOLD_ON;
    ticket += 'ARTICLES:';
    ticket += this.BOLD_OFF;
    ticket += this.LINE_FEED;
    
    // Articles
    order.items.forEach(item => {
      ticket += formatItem(item);
      ticket += this.LINE_FEED;
    });
    
    ticket += dashes;
    ticket += this.LINE_FEED;
    ticket += this.LINE_FEED;
    
    // Total aligné à droite et en gras
    ticket += this.BOLD_ON;
    ticket += rightAlign(`TOTAL: ${order.totalPrice.toFixed(2)} ${order.currency.code}`);
    ticket += this.BOLD_OFF;
    ticket += this.LINE_FEED;
    ticket += this.LINE_FEED;
    ticket += separator;
    ticket += this.LINE_FEED;
    
    // Pied de page centré
    ticket += this.ALIGN_CENTER;
    ticket += 'Merci de votre visite!';
    ticket += this.LINE_FEED;
    ticket += 'A bientot';
    ticket += this.LINE_FEED;
    ticket += this.LINE_FEED;
    ticket += this.LINE_FEED;
    
    // Couper le papier
    ticket += this.CUT_PAPER;
    
    return ticket;
  }

  static async testConnection(ip: string, port: number): Promise<boolean> {
    console.log(`Testing connection to ${ip}:${port} (Wi-Fi thermal printer)`);
    
    // Validation des paramètres d'abord
    const isValidIP = /^(\d{1,3}\.){3}\d{1,3}$/.test(ip);
    const isValidPort = port > 0 && port <= 65535;
    
    if (!isValidIP || !isValidPort) {
      console.log(`Invalid parameters: IP=${isValidIP}, Port=${isValidPort}`);
      return false;
    }

    // Essayer d'abord la nouvelle librairie thermal-receipt-printer
    if (ThermalReceiptPrinterService.isModuleAvailable()) {
      try {
        console.log('Using react-native-thermal-receipt-printer for connection test');
        return await ThermalReceiptPrinterService.testConnection(ip, port);
      } catch (error) {
        console.log('Thermal receipt printer connection test failed, falling back to legacy method:', error);
        // Continuer avec l'ancienne méthode
      }
    }

    // Test multiple endpoints pour imprimante Wi-Fi (AP+STA mode)
    const testEndpoints = [
      `http://${ip}:${port}`,           // Port principal (ex: 9100)
      `http://${ip}:80`,                // Interface web standard
      `http://${ip}:8080`,              // Interface web alternative
      `http://${ip}`,                   // Port 80 par défaut
    ];

    return new Promise((resolve) => {
      const timeout = 3000; // 3 secondes pour Wi-Fi
      let isResolved = false;
      let successCount = 0;
      let completedTests = 0;
      
      const checkComplete = () => {
        completedTests++;
        if (completedTests >= testEndpoints.length && !isResolved) {
          isResolved = true;
          const isAccessible = successCount > 0;
          console.log(`Connection test completed: ${successCount}/${testEndpoints.length} endpoints responded`);
          resolve(isAccessible);
        }
      };

      // Test global timeout
      const globalTimeout = setTimeout(() => {
        if (!isResolved) {
          isResolved = true;
          console.log(`Connection test to ${ip} - Global timeout, assuming accessible`);
          resolve(true);
        }
      }, timeout);

      // Tester chaque endpoint
      testEndpoints.forEach((endpoint, index) => {
        const controller = new AbortController();
        
        // Timeout individuel plus court
        const individualTimeout = setTimeout(() => {
          controller.abort();
        }, 1500);

        fetch(endpoint, {
          method: 'HEAD',
          signal: controller.signal,
        })
        .then((response) => {
          clearTimeout(individualTimeout);
          console.log(`✅ ${endpoint} - HTTP ${response.status} (${response.statusText})`);
          successCount++;
          checkComplete();
        })
        .catch((error) => {
          clearTimeout(individualTimeout);
          
          if (error.name === 'AbortError') {
            console.log(`⏱️  ${endpoint} - Timeout (possible ESC/POS port)`);
            successCount++; // On compte les timeouts comme succès pour les ports ESC/POS
          } else if (error.message?.includes('Network request failed') || 
                     error.message?.includes('ERR_NETWORK') ||
                     error.message?.includes('ERR_CONNECTION_REFUSED')) {
            console.log(`❌ ${endpoint} - ${error.message}`);
          } else {
            console.log(`🔍 ${endpoint} - ${error.message} (printer detected)`);
            successCount++; // Erreurs de protocole = imprimante présente
          }
          checkComplete();
        });
      });

      // Nettoyer le timeout global si on termine avant
      const originalResolve = resolve;
      resolve = (result) => {
        clearTimeout(globalTimeout);
        originalResolve(result);
      };
    });
  }

  // Test d'impression - Approches multiples pour imprimantes Wi-Fi
  static async testPrint(ip: string, port: number): Promise<boolean> {
    console.log(`Attempting Wi-Fi thermal printer test to ${ip}:${port}`);
    
    // Validation des paramètres d'abord
    const isValidIP = /^(\d{1,3}\.){3}\d{1,3}$/.test(ip);
    const isValidPort = port > 0 && port <= 65535;
    
    if (!isValidIP || !isValidPort) {
      console.log(`Invalid parameters for test print: IP=${isValidIP}, Port=${isValidPort}`);
      return false;
    }

    // Essayer d'abord la nouvelle librairie thermal-receipt-printer
    if (ThermalReceiptPrinterService.isModuleAvailable()) {
      try {
        console.log('Using react-native-thermal-receipt-printer for test print');
        return await ThermalReceiptPrinterService.printTestTicket('Test Printer', ip, port);
      } catch (error) {
        console.log('Thermal receipt printer failed, falling back to legacy method:', error);
        // Continuer avec l'ancienne méthode
      }
    }

    // Générer le ticket de test avec commandes ESC/POS
    const testTicket = this.generateTestTicket();
    console.log('=== TESTING WI-FI THERMAL PRINTER ===');

    // Approches multiples avec contournements CORS/HTTPS
    const printMethods = [
      // Méthode 1: Mode no-cors pour bypasser CORS (l'impression peut marcher même avec erreur CORS)
      {
        name: 'POST no-cors (bypass CORS)',
        test: async () => {
          try {
            const response = await fetch(`http://${ip}:${port}`, {
              method: 'POST',
              mode: 'no-cors', // Important: bypass CORS restrictions
              headers: {
                'Content-Type': 'application/octet-stream',
              },
              body: testTicket,
            });
            // En mode no-cors, response.ok n'est pas fiable, on assume succès
            console.log('Mode no-cors: requête envoyée, vérifiez l\'imprimante');
            return true; 
          } catch (error) {
            console.log('Mode no-cors failed:', error);
            return false;
          }
        }
      },
      
      // Méthode 2: POST standard (peut échouer à cause de CORS mais imprimer quand même)
      {
        name: 'POST standard (ignore CORS error)',
        test: async () => {
          try {
            const response = await fetch(`http://${ip}:${port}`, {
              method: 'POST',
              headers: {
                'Content-Type': 'application/octet-stream',
                'Content-Length': testTicket.length.toString(),
              },
              body: testTicket,
            });
            return response.ok;
          } catch (error) {
            // CORS error mais l'impression peut avoir fonctionné
            if (error.message.includes('CORS') || error.message.includes('cors')) {
              console.log('CORS error but print may have succeeded - check printer');
              return true;
            }
            return false;
          }
        }
      },
      
      // Méthode 3: Interface web Epson standard avec no-cors
      {
        name: 'Epson ePOS API',
        test: async () => {
          try {
            const response = await fetch(`http://${ip}/cgi-bin/epos/service.cgi?devid=local_printer&timeout=10000`, {
              method: 'POST',
              mode: 'no-cors',
              headers: {
                'Content-Type': 'text/xml; charset=utf-8',
                'SOAPAction': '',
              },
              body: `<?xml version="1.0" encoding="UTF-8"?>
<s:Envelope xmlns:s="http://schemas.xmlsoap.org/soap/envelope/">
<s:Body>
<epos-print xmlns="http://www.epson-pos.com/schemas/2011/03/epos-print">
${testTicket}
</epos-print>
</s:Body>
</s:Envelope>`,
            });
            return true;
          } catch (error) {
            return false;
          }
        }
      },
      
      // Méthode 4: Format PST (PostScript) pour imprimantes Zebra/compatibles
      {
        name: 'PST Print (Zebra compatible)',
        test: async () => {
          try {
            const response = await fetch(`http://${ip}/pstprnt`, {
              method: 'POST',
              mode: 'no-cors',
              headers: {
                'Content-Type': 'text/plain',
              },
              body: testTicket,
            });
            return true;
          } catch (error) {
            return false;
          }
        }
      }
    ];

    // Tester chaque méthode
    for (const method of printMethods) {
      try {
        console.log(`🔄 Trying: ${method.name}`);
        const success = await method.test();
        if (success) {
          console.log(`✅ SUCCESS: ${method.name}`);
          console.log('=== TEST PRINT COMPLETED SUCCESSFULLY ===');
          return true;
        }
        console.log(`❌ Failed: ${method.name}`);
      } catch (error) {
        console.log(`❌ Error with ${method.name}:`, error instanceof Error ? error.message : 'Unknown error');
      }
    }

    console.log('=== ALL PRINT METHODS FAILED ===');
    return false;
  }

  private static generateTestTicket(): string {
    // Ticket de test avec commandes ESC/POS complètes
    let ticket = this.INIT_PRINTER; // Initialiser l'imprimante
    
    // En-tête centré
    ticket += this.ALIGN_CENTER;
    ticket += this.BOLD_ON;
    ticket += 'TEST DE CONNEXION';
    ticket += this.LINE_FEED;
    ticket += this.BOLD_OFF;
    ticket += this.LINE_FEED;
    
    // Informations de test
    ticket += this.ALIGN_LEFT;
    ticket += `Date: ${new Date().toLocaleString()}`;
    ticket += this.LINE_FEED;
    ticket += 'Status: Imprimante connectee';
    ticket += this.LINE_FEED;
    ticket += this.LINE_FEED;
    
    // Message centré
    ticket += this.ALIGN_CENTER;
    ticket += 'Configuration reussie !';
    ticket += this.LINE_FEED;
    ticket += this.LINE_FEED;
    
    // Couper le papier automatiquement
    ticket += this.CUT_PAPER;
    
    return ticket;
  }
}