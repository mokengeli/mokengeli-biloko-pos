// src/services/printer/NetworkScanner.ts

import NetInfo from '@react-native-community/netinfo';
import TcpSocket from 'react-native-tcp-socket';
import { DiscoveredPrinter, PrinterProtocol } from '../../types/printer.types';

/**
 * Service de découverte automatique d'imprimantes sur le réseau local
 */
export class NetworkScanner {
  private static readonly PRINTER_PORTS = [9100, 515, 631, 8080]; // Ports communs pour imprimantes
  private static readonly SCAN_TIMEOUT = 500; // Timeout court pour le scan
  private static readonly BATCH_SIZE = 20; // Nombre d'IPs à scanner en parallèle
  
  private isScanning: boolean = false;
  private abortController: AbortController | null = null;

  /**
   * Obtient l'adresse IP locale et le masque de sous-réseau
   */
  private async getNetworkInfo(): Promise<{ ip: string; subnet: string } | null> {
    try {
      const state = await NetInfo.fetch();
      
      if (state.type === 'wifi' && state.details && 'ipAddress' in state.details) {
        const ipAddress = state.details.ipAddress;
        
        if (ipAddress && ipAddress !== '0.0.0.0') {
          // Extraire le subnet (ex: 192.168.1.x -> 192.168.1)
          const parts = ipAddress.split('.');
          const subnet = parts.slice(0, 3).join('.');
          
          console.log(`[NetworkScanner] Local IP: ${ipAddress}, Subnet: ${subnet}`);
          return { ip: ipAddress, subnet };
        }
      }
      
      console.log('[NetworkScanner] No WiFi connection or IP address found');
      return null;
    } catch (error) {
      console.error('[NetworkScanner] Error getting network info:', error);
      return null;
    }
  }

  /**
   * Teste la connexion à une adresse IP et port spécifiques
   */
  private testConnection(ip: string, port: number, timeout: number = 500): Promise<boolean> {
    return new Promise((resolve) => {
      let socket: any = null;
      let resolved = false;

      const cleanup = () => {
        if (socket) {
          socket.destroy();
          socket = null;
        }
      };

      const handleResult = (success: boolean) => {
        if (!resolved) {
          resolved = true;
          cleanup();
          resolve(success);
        }
      };

      // Timeout de sécurité
      const timeoutId = setTimeout(() => {
        handleResult(false);
      }, timeout);

      try {
        socket = TcpSocket.createConnection(
          {
            port,
            host: ip,
            timeout,
            reuseAddress: true,
          },
          () => {
            clearTimeout(timeoutId);
            console.log(`[NetworkScanner] Found open port ${port} on ${ip}`);
            handleResult(true);
          }
        );

        socket.on('error', () => {
          clearTimeout(timeoutId);
          handleResult(false);
        });

        socket.on('timeout', () => {
          clearTimeout(timeoutId);
          handleResult(false);
        });

      } catch (error) {
        clearTimeout(timeoutId);
        handleResult(false);
      }
    });
  }

  /**
   * Identifie le type d'imprimante en envoyant des commandes de test
   */
  private async identifyPrinter(ip: string, port: number): Promise<DiscoveredPrinter | null> {
    return new Promise((resolve) => {
      let socket: any = null;
      let resolved = false;
      let receivedData = false;

      const cleanup = () => {
        if (socket) {
          socket.destroy();
          socket = null;
        }
      };

      const handleResult = (printer: DiscoveredPrinter | null) => {
        if (!resolved) {
          resolved = true;
          cleanup();
          resolve(printer);
        }
      };

      const timeoutId = setTimeout(() => {
        // Si on a reçu des données mais pas d'identification, c'est probablement une imprimante ESC/POS générique
        if (receivedData) {
          handleResult({
            ip,
            port,
            name: `Imprimante sur ${ip}`,
            protocol: 'ESC_POS',
            manufacturer: 'Générique'
          });
        } else {
          handleResult(null);
        }
      }, 1000);

      try {
        socket = TcpSocket.createConnection(
          {
            port,
            host: ip,
            timeout: 1000,
            reuseAddress: true,
          },
          () => {
            // Envoyer une commande de statut ESC/POS
            const statusCommand = Buffer.from([0x10, 0x04, 0x01]); // DLE EOT 1
            socket.write(statusCommand);

            // Envoyer une commande d'identification
            const idCommand = Buffer.from([0x1D, 0x49, 0x01]); // GS I 1
            socket.write(idCommand);
          }
        );

        socket.on('data', (data: Buffer) => {
          receivedData = true;
          clearTimeout(timeoutId);
          
          // Analyser la réponse pour identifier la marque
          const response = data.toString('hex');
          console.log(`[NetworkScanner] Received data from ${ip}: ${response}`);

          let manufacturer = 'Générique';
          let model = undefined;

          // Patterns de réponse connus
          if (response.includes('4550534f4e')) { // "EPSON" en hex
            manufacturer = 'EPSON';
          } else if (response.includes('53544152')) { // "STAR" en hex
            manufacturer = 'STAR';
          } else if (response.includes('4d554e42594e')) { // "MUNBYN" en hex
            manufacturer = 'MUNBYN';
          }

          handleResult({
            ip,
            port,
            name: `${manufacturer} sur ${ip}`,
            manufacturer,
            model,
            protocol: 'ESC_POS'
          });
        });

        socket.on('error', () => {
          clearTimeout(timeoutId);
          handleResult(null);
        });

        socket.on('timeout', () => {
          clearTimeout(timeoutId);
          handleResult(null);
        });

      } catch (error) {
        clearTimeout(timeoutId);
        handleResult(null);
      }
    });
  }

  /**
   * Lance un scan du réseau pour découvrir les imprimantes
   */
  async scanNetwork(onProgress?: (progress: number, found: DiscoveredPrinter[]) => void): Promise<DiscoveredPrinter[]> {
    if (this.isScanning) {
      console.log('[NetworkScanner] Scan already in progress');
      return [];
    }

    this.isScanning = true;
    this.abortController = new AbortController();
    const foundPrinters: DiscoveredPrinter[] = [];

    try {
      // Obtenir les informations réseau
      const networkInfo = await this.getNetworkInfo();
      if (!networkInfo) {
        throw new Error('No network connection or unable to get IP address');
      }

      const { subnet } = networkInfo;
      console.log(`[NetworkScanner] Starting scan on subnet ${subnet}.0/24`);

      // Scanner les IPs de 1 à 254
      const totalIPs = 254;
      let scannedCount = 0;

      for (let i = 1; i <= 254; i += NetworkScanner.BATCH_SIZE) {
        if (this.abortController.signal.aborted) {
          console.log('[NetworkScanner] Scan aborted');
          break;
        }

        // Créer un batch d'IPs à scanner
        const batch: Promise<void>[] = [];
        
        for (let j = i; j < Math.min(i + NetworkScanner.BATCH_SIZE, 255); j++) {
          const ip = `${subnet}.${j}`;
          
          // Tester chaque port pour cette IP
          for (const port of NetworkScanner.PRINTER_PORTS) {
            if (this.abortController.signal.aborted) break;

            const scanPromise = this.testConnection(ip, port, NetworkScanner.SCAN_TIMEOUT)
              .then(async (isOpen) => {
                if (isOpen) {
                  console.log(`[NetworkScanner] Found potential printer at ${ip}:${port}`);
                  
                  // Identifier le type d'imprimante
                  const printer = await this.identifyPrinter(ip, port);
                  if (printer) {
                    foundPrinters.push(printer);
                    
                    // Notifier la progression avec les imprimantes trouvées
                    if (onProgress) {
                      const progress = Math.round((scannedCount / totalIPs) * 100);
                      onProgress(progress, [...foundPrinters]);
                    }
                  }
                }
              })
              .catch(error => {
                console.debug(`[NetworkScanner] Error scanning ${ip}:${port}:`, error);
              });

            batch.push(scanPromise);
          }
        }

        // Attendre que le batch soit terminé
        await Promise.all(batch);
        
        scannedCount += Math.min(NetworkScanner.BATCH_SIZE, 255 - i);
        
        // Notifier la progression
        if (onProgress) {
          const progress = Math.round((scannedCount / totalIPs) * 100);
          onProgress(progress, [...foundPrinters]);
        }

        // Petit délai entre les batches pour ne pas surcharger le réseau
        await new Promise(resolve => setTimeout(resolve, 100));
      }

      console.log(`[NetworkScanner] Scan completed. Found ${foundPrinters.length} printer(s)`);
      return foundPrinters;

    } catch (error) {
      console.error('[NetworkScanner] Scan error:', error);
      throw error;

    } finally {
      this.isScanning = false;
      this.abortController = null;
    }
  }

  /**
   * Arrête le scan en cours
   */
  stopScan(): void {
    if (this.isScanning && this.abortController) {
      console.log('[NetworkScanner] Stopping scan...');
      this.abortController.abort();
    }
  }

  /**
   * Vérifie si un scan est en cours
   */
  isScanInProgress(): boolean {
    return this.isScanning;
  }

  /**
   * Teste rapidement une imprimante spécifique
   */
  async quickTest(ip: string, port: number = 9100): Promise<boolean> {
    try {
      console.log(`[NetworkScanner] Quick test for ${ip}:${port}`);
      
      // Test de connexion
      const isConnected = await this.testConnection(ip, port, 2000);
      
      if (isConnected) {
        // Essayer d'identifier l'imprimante
        const printer = await this.identifyPrinter(ip, port);
        return printer !== null;
      }
      
      return false;
    } catch (error) {
      console.error(`[NetworkScanner] Quick test failed for ${ip}:${port}:`, error);
      return false;
    }
  }

  /**
   * Obtient les informations réseau actuelles
   */
  static async getCurrentNetworkInfo(): Promise<{ 
    isConnected: boolean; 
    type: string; 
    ip?: string; 
    subnet?: string;
    ssid?: string;
  }> {
    try {
      const state = await NetInfo.fetch();
      
      const info: any = {
        isConnected: state.isConnected || false,
        type: state.type
      };

      if (state.type === 'wifi' && state.details && 'ipAddress' in state.details) {
        info.ip = state.details.ipAddress;
        
        if (info.ip && info.ip !== '0.0.0.0') {
          const parts = info.ip.split('.');
          info.subnet = parts.slice(0, 3).join('.');
        }

        if ('ssid' in state.details) {
          info.ssid = state.details.ssid;
        }
      }

      return info;
    } catch (error) {
      console.error('[NetworkScanner] Error getting current network info:', error);
      return {
        isConnected: false,
        type: 'unknown'
      };
    }
  }
}