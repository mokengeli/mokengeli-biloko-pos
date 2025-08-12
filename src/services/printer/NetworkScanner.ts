// src/services/printer/NetworkScanner.ts

import NetInfo from '@react-native-community/netinfo';
import TcpSocket from 'react-native-tcp-socket';
import { Buffer } from 'buffer';
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

  private ipToInt(ip: string): number {
    return ip
      .split('.')
      .reduce((acc, octet) => (acc << 8) + parseInt(octet, 10), 0) >>> 0;
  }

  private intToIp(int: number): string {
    return `${(int >>> 24) & 255}.${(int >>> 16) & 255}.${(int >>> 8) & 255}.${int & 255}`;
  }

  /**
   * Obtient l'adresse IP locale et le masque de sous-réseau
   */
  private async getNetworkInfo(): Promise<{ ip: string; subnet: string; subnetMask: string } | null> {
    try {
      const state = await NetInfo.fetch();

      if (state.type === 'wifi' && state.details && 'ipAddress' in state.details) {
        const ipAddress = state.details.ipAddress;
        const subnetMask = (state.details as any).subnet || '255.255.255.0';

        if (ipAddress && ipAddress !== '0.0.0.0') {
          const networkParts = ipAddress
            .split('.')
            .map((p, i) => parseInt(p, 10) & parseInt(subnetMask.split('.')[i], 10));
          const subnet = networkParts.join('.');

          console.log(`[NetworkScanner] Local IP: ${ipAddress}, Mask: ${subnetMask}`);
          return { ip: ipAddress, subnet, subnetMask };
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
  private testConnection(ip: string, port: number, timeout: number = 500, signal?: AbortSignal): Promise<boolean> {
    return new Promise((resolve) => {
      let socket: any = null;
      let resolved = false;

      const onAbort = () => {
        handleResult(false);
      };

      if (signal) {
        if (signal.aborted) return resolve(false);
        signal.addEventListener('abort', onAbort);
      }

      const cleanup = () => {
        if (socket) {
          socket.destroy();
          socket = null;
        }
        signal?.removeEventListener('abort', onAbort);
      };

      const handleResult = (success: boolean) => {
        if (!resolved) {
          resolved = true;
          cleanup();
          resolve(success);
        }
      };

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
  private async identifyPrinter(ip: string, port: number, signal?: AbortSignal): Promise<DiscoveredPrinter | null> {
    return new Promise((resolve) => {
      let socket: any = null;
      let resolved = false;
      let receivedData = false;
      let connected = false;

      const onAbort = () => {
        handleResult(null);
      };

      if (signal) {
        if (signal.aborted) return resolve(null);
        signal.addEventListener('abort', onAbort);
      }

      const cleanup = () => {
        if (socket) {
          socket.destroy();
          socket = null;
        }
        signal?.removeEventListener('abort', onAbort);
      };

      const handleResult = (printer: DiscoveredPrinter | null) => {
        if (!resolved) {
          resolved = true;
          cleanup();
          resolve(printer);
        }
      };

      const timeoutId = setTimeout(() => {
        if (connected && !receivedData) {
          handleResult({
            ip,
            port,
            name: `Imprimante sur ${ip}`,
            protocol: 'ESC_POS',
            manufacturer: 'Non identifiée'
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
            connected = true;
            const statusCommand = Buffer.from([0x10, 0x04, 0x01]); // DLE EOT 1
            socket.write(statusCommand);
            const idCommand = Buffer.from([0x1D, 0x49, 0x01]); // GS I 1
            socket.write(idCommand);
          }
        );

        socket.on('data', (data: Buffer) => {
          receivedData = true;
          clearTimeout(timeoutId);

          const response = data.toString('hex');
          console.log(`[NetworkScanner] Received data from ${ip}: ${response}`);

          let manufacturer = 'Générique';
          let model = undefined;

          if (response.includes('4550534f4e')) {
            manufacturer = 'EPSON';
          } else if (response.includes('53544152')) {
            manufacturer = 'STAR';
          } else if (response.includes('4d554e42594e')) {
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
    const foundPrinters = new Map<string, DiscoveredPrinter>();

    try {
      // Obtenir les informations réseau
      const networkInfo = await this.getNetworkInfo();
      if (!networkInfo) {
        throw new Error('No network connection or unable to get IP address');
      }

      const { ip, subnetMask } = networkInfo;
      const ipInt = this.ipToInt(ip);
      const maskInt = this.ipToInt(subnetMask);
      const networkStart = (ipInt & maskInt) + 1;
      const broadcast = (ipInt | (~maskInt >>> 0)) >>> 0;
      const networkEnd = broadcast - 1;

      console.log(`[NetworkScanner] Starting scan on ${this.intToIp(networkStart - 1)}/${subnetMask}`);

      const totalIPs = networkEnd - networkStart + 1;
      let scannedCount = 0;

      for (let current = networkStart; current <= networkEnd; current += NetworkScanner.BATCH_SIZE) {
        if (this.abortController.signal.aborted) {
          console.log('[NetworkScanner] Scan aborted');
          break;
        }

        const batch: Promise<void>[] = [];

        for (let addr = current; addr < Math.min(current + NetworkScanner.BATCH_SIZE, networkEnd + 1); addr++) {
          const ip = this.intToIp(addr);

          for (const port of NetworkScanner.PRINTER_PORTS) {
            if (this.abortController.signal.aborted) break;

            const scanPromise = this.testConnection(ip, port, NetworkScanner.SCAN_TIMEOUT, this.abortController.signal)
              .then(async (isOpen) => {
                if (isOpen) {
                  console.log(`[NetworkScanner] Found potential printer at ${ip}:${port}`);

                  const printer = await this.identifyPrinter(ip, port, this.abortController.signal);
                  if (printer) {
                    foundPrinters.set(printer.ip, printer);

                    if (onProgress) {
                      const progress = Math.round((scannedCount / totalIPs) * 100);
                      onProgress(progress, Array.from(foundPrinters.values()));
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

        scannedCount += Math.min(NetworkScanner.BATCH_SIZE, networkEnd + 1 - current);

        if (onProgress) {
          const progress = Math.round((scannedCount / totalIPs) * 100);
          onProgress(progress, Array.from(foundPrinters.values()));
        }

        await new Promise(resolve => setTimeout(resolve, 100));
      }

      console.log(`[NetworkScanner] Scan completed. Found ${foundPrinters.size} printer(s)`);
      return Array.from(foundPrinters.values());

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
    subnetMask?: string;
    prefixLength?: number;
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
        info.subnetMask = (state.details as any).subnet || '255.255.255.0';

        if (info.ip && info.ip !== '0.0.0.0') {
          const ipParts = info.ip.split('.').map((p: string) => parseInt(p, 10));
          const maskParts = info.subnetMask.split('.').map((p: string) => parseInt(p, 10));
          const networkParts = ipParts.map((p: number, i: number) => p & maskParts[i]);
          info.subnet = networkParts.join('.');
          info.prefixLength = maskParts.reduce((acc: number, part: number) => acc + part.toString(2).replace(/0/g, '').length, 0);
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