// src/services/printer/PrinterConnection.ts

import TcpSocket from 'react-native-tcp-socket';
import {
  IPrinterConnection,
  PrinterStatus,
  PrinterConnectionType,
  PrinterConfig
} from '../../types/printer.types';
import { Buffer } from 'buffer';

/**
 * Implémentation de la connexion TCP pour les imprimantes réseau
 * Utilise react-native-tcp-socket mais peut être facilement remplacé
 */
export class PrinterConnection implements IPrinterConnection {
  private socket: any = null;
  private config: PrinterConfig | null = null;
  private isConnectedFlag: boolean = false;
  private connectionTimeout: number = 5000;
  private lastError: string | null = null;
  private reconnectAttempts: number = 0;
  private maxReconnectAttempts: number = 3;

  constructor(config?: PrinterConfig) {
    if (config) {
      this.config = config;
      this.connectionTimeout = config.connectionParams.timeout || 5000;
    }
  }

  /**
   * Établit une connexion TCP avec l'imprimante
   */
  async connect(params: any): Promise<boolean> {
    console.log('[PrinterConnection] Starting connection...');
    console.log('[PrinterConnection] Params:', JSON.stringify(params));
  
    // Si on a une config passée en paramètre, l'utiliser
    const connectionParams = params || this.config?.connectionParams;
    
    if (!connectionParams?.ip || !connectionParams?.port) {
      throw new Error('IP address and port are required for TCP connection');
    }

    return new Promise((resolve, reject) => {
      try {
        console.log(`[PrinterConnection] Connecting to ${connectionParams.ip}:${connectionParams.port}`);
        console.log('[PrinterConnection] Creating socket...');

        // Créer la connexion TCP
        this.socket = TcpSocket.createConnection(
          {
            port: connectionParams.port,
            host: connectionParams.ip,
            timeout: this.connectionTimeout,
            reuseAddress: true, // Permet de réutiliser l'adresse rapidement
          },
          () => {
            console.log(`[PrinterConnection] Connected successfully to ${connectionParams.ip}:${connectionParams.port}`);
            this.isConnectedFlag = true;
            this.lastError = null;
            this.reconnectAttempts = 0;
            resolve(true);
          }
        );
    console.log('[PrinterConnection] Socket created:', !!this.socket);

        // Gestion des erreurs
        this.socket.on('error', (error: any) => {
          console.error('[PrinterConnection] Socket error:', error);
          this.lastError = error.message || 'Unknown socket error';
          this.isConnectedFlag = false;
          
          if (this.reconnectAttempts < this.maxReconnectAttempts) {
            this.reconnectAttempts++;
            console.log(`[PrinterConnection] Reconnect attempt ${this.reconnectAttempts}/${this.maxReconnectAttempts}`);
            setTimeout(() => {
              this.connect(connectionParams).then(resolve).catch(reject);
            }, 1000 * this.reconnectAttempts); // Backoff exponentiel
          } else {
            reject(new Error(`Connection failed: ${this.lastError}`));
          }
        });

        // Gestion du timeout
        this.socket.on('timeout', () => {
          console.error('[PrinterConnection] Connection timeout');
          this.lastError = 'Connection timeout';
          this.isConnectedFlag = false;
          this.socket.destroy();
          reject(new Error('Connection timeout'));
        });

        // Gestion de la fermeture
        this.socket.on('close', () => {
          console.log('[PrinterConnection] Connection closed');
          this.isConnectedFlag = false;
        });

        // Gestion des données reçues (pour le statut)
        this.socket.on('data', (data: Buffer) => {
          console.log('[PrinterConnection] Data received:', data.toString('hex'));
          // Traiter les données de statut si nécessaire
        });

      } catch (error: any) {
        console.error('[PrinterConnection] Connection error:', error);
        this.lastError = error.message;
        this.isConnectedFlag = false;
        reject(error);
      }
    });
  }

  /**
   * Ferme la connexion TCP
   */
  async disconnect(): Promise<void> {
    return new Promise((resolve) => {
      if (this.socket) {
        console.log('[PrinterConnection] Disconnecting...');
        
        this.socket.destroy(() => {
          console.log('[PrinterConnection] Disconnected');
          this.socket = null;
          this.isConnectedFlag = false;
          resolve();
        });

        // Timeout de sécurité si destroy ne répond pas
        setTimeout(() => {
          if (this.socket) {
            this.socket = null;
            this.isConnectedFlag = false;
          }
          resolve();
        }, 1000);
      } else {
        resolve();
      }
    });
  }

  /**
   * Vérifie si la connexion est active
   */
  isConnected(): boolean {
    return this.isConnectedFlag && this.socket !== null;
  }

  /**
   * Envoie des données à l'imprimante
   */
  async send(data: Buffer | string): Promise<void> {
    return new Promise((resolve, reject) => {
      if (!this.isConnected()) {
        reject(new Error('Printer not connected'));
        return;
      }

      try {
        // Convertir en Buffer si nécessaire
        const buffer = data instanceof Buffer ? data : Buffer.from(data, 'utf8');
        
        console.log(`[PrinterConnection] Sending ${buffer.length} bytes`);
        
        this.socket.write(buffer, (error: any) => {
          if (error) {
            console.error('[PrinterConnection] Send error:', error);
            this.lastError = error.message;
            reject(error);
          } else {
            console.log('[PrinterConnection] Data sent successfully');
            resolve();
          }
        });

      } catch (error: any) {
        console.error('[PrinterConnection] Send error:', error);
        this.lastError = error.message;
        reject(error);
      }
    });
  }

  /**
   * Obtient le statut de l'imprimante
   */
  async getStatus(): Promise<PrinterStatus> {
    if (!this.isConnected()) {
      return PrinterStatus.DISCONNECTED;
    }

    try {
      // Envoyer une commande de statut ESC/POS
      const statusCommand = Buffer.from([0x10, 0x04, 0x01]); // DLE EOT 1
      await this.send(statusCommand);

      // Attendre la réponse (simplifiée pour le moment)
      return new Promise((resolve) => {
        const timeout = setTimeout(() => {
          // Si pas de réponse, considérer comme connecté
          resolve(PrinterStatus.CONNECTED);
        }, 500);

        this.socket.once('data', (data: Buffer) => {
          clearTimeout(timeout);
          
          // Analyser la réponse du statut
          // Bit 3: 0 = en ligne, 1 = hors ligne
          if (data[0] & 0x08) {
            resolve(PrinterStatus.ERROR);
          } else {
            resolve(PrinterStatus.CONNECTED);
          }
        });
      });

    } catch (error) {
      console.error('[PrinterConnection] Status check error:', error);
      return PrinterStatus.ERROR;
    }
  }

  /**
   * Teste la connexion avec l'imprimante
   */
  async test(): Promise<boolean> {
    try {
      // Si pas connecté, tenter une connexion
      if (!this.isConnected()) {
        const connected = await this.connect(this.config?.connectionParams);
        if (!connected) return false;
      }

      // Envoyer une commande d'initialisation
      const initCommand = Buffer.from([0x1B, 0x40]); // ESC @
      await this.send(initCommand);

      // Envoyer un beep pour feedback audio (optionnel)
      const beepCommand = Buffer.from([0x1B, 0x42, 0x01, 0x01]); // ESC B n t
      await this.send(beepCommand).catch(() => {}); // Ignorer si pas supporté

      return true;
    } catch (error) {
      console.error('[PrinterConnection] Test failed:', error);
      return false;
    }
  }

  /**
   * Obtient la dernière erreur
   */
  getLastError(): string | null {
    return this.lastError;
  }

  /**
   * Configure les paramètres de connexion
   */
  setConfig(config: PrinterConfig): void {
    this.config = config;
    this.connectionTimeout = config.connectionParams.timeout || 5000;
  }

  /**
   * Envoie une commande de coupe de papier
   */
  async cutPaper(partial: boolean = false): Promise<void> {
    if (!this.isConnected()) {
      throw new Error('Printer not connected');
    }

    // Commande de coupe : GS V m (n)
    // m = 0: coupe complète, m = 1: coupe partielle
    const cutCommand = partial 
      ? Buffer.from([0x1D, 0x56, 0x01]) // Coupe partielle
      : Buffer.from([0x1D, 0x56, 0x00]); // Coupe complète

    await this.send(cutCommand);
  }

  /**
   * Fait avancer le papier
   */
  async feedPaper(lines: number = 3): Promise<void> {
    if (!this.isConnected()) {
      throw new Error('Printer not connected');
    }

    // ESC d n - Avancer de n lignes
    const feedCommand = Buffer.from([0x1B, 0x64, lines]);
    await this.send(feedCommand);
  }

  /**
   * Ouvre le tiroir-caisse
   */
  async openCashDrawer(): Promise<void> {
    if (!this.isConnected()) {
      throw new Error('Printer not connected');
    }

    // ESC p m t1 t2 - Pulse pour ouvrir le tiroir
    // m = 0 pour connecteur 1, m = 1 pour connecteur 2
    const drawerCommand = Buffer.from([0x1B, 0x70, 0x00, 0x19, 0x19]);
    await this.send(drawerCommand);
  }

  /**
   * Réinitialise l'imprimante
   */
  async reset(): Promise<void> {
    if (!this.isConnected()) {
      throw new Error('Printer not connected');
    }

    // ESC @ - Initialisation de l'imprimante
    const resetCommand = Buffer.from([0x1B, 0x40]);
    await this.send(resetCommand);
  }
}

// Factory pour créer des connexions selon le type
export class PrinterConnectionFactory {
  static create(type: PrinterConnectionType, config?: PrinterConfig): IPrinterConnection {
    switch (type) {
      case 'TCP':
        return new PrinterConnection(config);
      
      case 'BLUETOOTH':
        // TODO: Implémenter BluetoothPrinterConnection
        throw new Error('Bluetooth connection not yet implemented');
      
      case 'USB':
        // TODO: Implémenter USBPrinterConnection
        throw new Error('USB connection not yet implemented');
      
      default:
        throw new Error(`Unknown connection type: ${type}`);
    }
  }
}