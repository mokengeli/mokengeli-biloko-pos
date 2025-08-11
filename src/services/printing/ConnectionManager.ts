// src/services/printing/ConnectionManager.ts

import TcpSocket from 'react-native-tcp-socket';
import NetInfo from '@react-native-community/netinfo';
import { PrinterConfig, ConnectionStatus } from './types';
import { PrinterStorage } from './PrinterStorage';

/**
 * Gestionnaire de connexions TCP aux imprimantes
 * Gère un pool de connexions réutilisables pour optimiser les performances
 */
export class ConnectionManager {
  private static instance: ConnectionManager;
  private connections: Map<string, any> = new Map();
  private connectionTimers: Map<string, NodeJS.Timeout> = new Map();
  private storage: PrinterStorage;
  private readonly CONNECTION_TIMEOUT = 30000; // 30 secondes avant fermeture automatique

  private constructor() {
    this.storage = PrinterStorage.getInstance();
  }

  static getInstance(): ConnectionManager {
    if (!ConnectionManager.instance) {
      ConnectionManager.instance = new ConnectionManager();
    }
    return ConnectionManager.instance;
  }

  /**
   * Obtenir les informations réseau
   */
  async getNetworkInfo(): Promise<{ isConnected: boolean; ipAddress?: string; subnet?: string }> {
    const state = await NetInfo.fetch();
    
    if (!state.isConnected) {
      return { isConnected: false };
    }

    // Obtenir l'IP locale (fonctionne mieux sur les vrais devices)
    const details = state.details as any;
    const ipAddress = details?.ipAddress || '192.168.1.100'; // Fallback
    
    // Calculer le subnet
    const ipParts = ipAddress.split('.');
    const subnet = `${ipParts[0]}.${ipParts[1]}.${ipParts[2]}`;
    
    return {
      isConnected: true,
      ipAddress,
      subnet
    };
  }

  /**
   * Obtenir ou créer une connexion vers une imprimante
   */
  async getConnection(printer: PrinterConfig): Promise<any> {
    const connectionKey = `${printer.ipAddress}:${printer.port}`;
    
    // Vérifier si une connexion existe déjà
    if (this.connections.has(connectionKey)) {
      const socket = this.connections.get(connectionKey);
      
      // Réinitialiser le timer de fermeture automatique
      this.resetConnectionTimer(connectionKey);
      
      // Vérifier que la connexion est toujours valide
      if (this.isSocketConnected(socket)) {
        console.log(`[ConnectionManager] Reusing connection to ${connectionKey}`);
        return socket;
      } else {
        // La connexion est fermée, la supprimer
        this.connections.delete(connectionKey);
      }
    }
    
    // Créer une nouvelle connexion
    console.log(`[ConnectionManager] Creating new connection to ${connectionKey}`);
    return this.createConnection(printer);
  }

  /**
   * Créer une nouvelle connexion TCP
   */
  private createConnection(printer: PrinterConfig): Promise<any> {
    return new Promise((resolve, reject) => {
      const connectionKey = `${printer.ipAddress}:${printer.port}`;
      const timeoutTimer = setTimeout(() => {
        reject(new Error(`Connection timeout to ${connectionKey}`));
      }, printer.timeout || 5000);

      try {
        const options = {
          port: printer.port,
          host: printer.ipAddress,
          localAddress: '0.0.0.0',
          reuseAddress: true,
          // Pas de délai Nagle pour une réponse plus rapide
          noDelay: true
        };

        const socket = TcpSocket.createConnection(options, () => {
          clearTimeout(timeoutTimer);
          
          console.log(`[ConnectionManager] Connected to ${connectionKey}`);
          
          // Stocker la connexion
          this.connections.set(connectionKey, socket);
          
          // Configurer le timer de fermeture automatique
          this.resetConnectionTimer(connectionKey);
          
          // Mettre à jour le statut de l'imprimante
          this.storage.updatePrinterStatus(
            printer.id,
            ConnectionStatus.CONNECTED
          ).catch(console.error);
          
          resolve(socket);
        });

        // Gestion des erreurs
        socket.on('error', (error) => {
          clearTimeout(timeoutTimer);
          console.error(`[ConnectionManager] Socket error for ${connectionKey}:`, error);
          
          this.connections.delete(connectionKey);
          this.clearConnectionTimer(connectionKey);
          
          // Mettre à jour le statut de l'imprimante
          this.storage.updatePrinterStatus(
            printer.id,
            ConnectionStatus.ERROR,
            error.message
          ).catch(console.error);
          
          reject(error);
        });

        // Gestion de la fermeture
        socket.on('close', () => {
          console.log(`[ConnectionManager] Connection closed for ${connectionKey}`);
          
          this.connections.delete(connectionKey);
          this.clearConnectionTimer(connectionKey);
          
          // Mettre à jour le statut de l'imprimante
          this.storage.updatePrinterStatus(
            printer.id,
            ConnectionStatus.DISCONNECTED
          ).catch(console.error);
        });

        // Gestion du timeout
        socket.on('timeout', () => {
          console.log(`[ConnectionManager] Socket timeout for ${connectionKey}`);
          socket.destroy();
        });

      } catch (error) {
        clearTimeout(timeoutTimer);
        reject(error);
      }
    });
  }

  /**
   * Envoyer des données à une imprimante
   */
  async sendData(printer: PrinterConfig, data: Buffer | string): Promise<void> {
    const socket = await this.getConnection(printer);
    
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('Send data timeout'));
      }, 5000);

      try {
        // Convertir en Buffer si nécessaire
        const buffer = Buffer.isBuffer(data) ? data : Buffer.from(data);
        
        socket.write(buffer, 'utf8', (error?: Error) => {
          clearTimeout(timeout);
          
          if (error) {
            console.error('[ConnectionManager] Error sending data:', error);
            reject(error);
          } else {
            console.log('[ConnectionManager] Data sent successfully');
            
            // Marquer l'imprimante comme utilisée
            this.storage.markPrinterUsed(printer.id).catch(console.error);
            
            resolve();
          }
        });
      } catch (error) {
        clearTimeout(timeout);
        reject(error);
      }
    });
  }

  /**
   * Tester la connexion à une imprimante
   */
  async testConnection(printer: PrinterConfig): Promise<boolean> {
    try {
      const socket = await this.createConnection(printer);
      
      // Envoyer une commande de test (beep)
      const testCommand = Buffer.from([0x1B, 0x42, 0x01, 0x01]); // ESC B n t
      
      await new Promise<void>((resolve, reject) => {
        socket.write(testCommand, (error?: Error) => {
          if (error) reject(error);
          else resolve();
        });
      });
      
      // Fermer la connexion de test
      socket.destroy();
      
      return true;
    } catch (error) {
      console.error('[ConnectionManager] Test connection failed:', error);
      return false;
    }
  }

  /**
   * Tester la disponibilité d'une imprimante via TCP
   * Alternative à ping utilisant une connexion TCP directe
   */
  async checkPrinterAvailability(ipAddress: string, port: number, timeout: number = 2000): Promise<boolean> {
    return new Promise((resolve) => {
      const timeoutTimer = setTimeout(() => {
        try {
          socket.destroy();
        } catch (e) {
          // Ignorer les erreurs de destruction
        }
        resolve(false);
      }, timeout);

      try {
        const socket = TcpSocket.createConnection({
          port,
          host: ipAddress,
          localAddress: '0.0.0.0',
          reuseAddress: true
        }, () => {
          clearTimeout(timeoutTimer);
          socket.destroy();
          resolve(true);
        });

        socket.on('error', () => {
          clearTimeout(timeoutTimer);
          resolve(false);
        });

        socket.on('timeout', () => {
          clearTimeout(timeoutTimer);
          resolve(false);
        });
      } catch {
        clearTimeout(timeoutTimer);
        resolve(false);
      }
    });
  }

  /**
   * Scanner une plage d'IP pour trouver des imprimantes
   */
  async scanNetwork(
    subnet: string, 
    ports: number[] = [9100, 515, 631],
    onProgress?: (current: number, total: number) => void
  ): Promise<Array<{ ip: string; port: number }>> {
    const foundPrinters: Array<{ ip: string; port: number }> = [];
    const totalScans = 254 * ports.length;
    let currentScan = 0;

    // Fonction pour scanner une IP sur un port
    const scanIP = async (ip: string, port: number): Promise<boolean> => {
      const isAvailable = await this.checkPrinterAvailability(ip, port, 500);
      currentScan++;
      
      if (onProgress) {
        onProgress(currentScan, totalScans);
      }
      
      if (isAvailable) {
        foundPrinters.push({ ip, port });
        console.log(`[ConnectionManager] Found printer at ${ip}:${port}`);
      }
      
      return isAvailable;
    };

    // Scanner par batch pour éviter de surcharger le réseau
    const batchSize = 20;
    
    for (let i = 1; i <= 254; i++) {
      const batch = [];
      const ip = `${subnet}.${i}`;
      
      for (const port of ports) {
        batch.push(scanIP(ip, port));
        
        if (batch.length >= batchSize) {
          await Promise.all(batch);
          batch.length = 0;
        }
      }
      
      if (batch.length > 0) {
        await Promise.all(batch);
      }
    }
    
    return foundPrinters;
  }

  /**
   * Fermer une connexion spécifique
   */
  closeConnection(printerId: string): void {
    const printer = this.storage.getPrinter(printerId);
    if (printer) {
      const connectionKey = `${printer.ipAddress}:${printer.port}`;
      const socket = this.connections.get(connectionKey);
      
      if (socket) {
        socket.destroy();
        this.connections.delete(connectionKey);
        this.clearConnectionTimer(connectionKey);
      }
    }
  }

  /**
   * Fermer toutes les connexions
   */
  closeAllConnections(): void {
    for (const [key, socket] of this.connections) {
      try {
        socket.destroy();
      } catch (error) {
        console.error(`[ConnectionManager] Error closing connection ${key}:`, error);
      }
    }
    
    this.connections.clear();
    
    // Nettoyer tous les timers
    for (const timer of this.connectionTimers.values()) {
      clearTimeout(timer);
    }
    this.connectionTimers.clear();
  }

  /**
   * Vérifier si un socket est connecté
   */
  private isSocketConnected(socket: any): boolean {
    return socket && !socket.destroyed && socket.readyState === 'open';
  }

  /**
   * Réinitialiser le timer de fermeture automatique d'une connexion
   */
  private resetConnectionTimer(connectionKey: string): void {
    // Annuler le timer existant
    this.clearConnectionTimer(connectionKey);
    
    // Créer un nouveau timer
    const timer = setTimeout(() => {
      const socket = this.connections.get(connectionKey);
      if (socket) {
        console.log(`[ConnectionManager] Auto-closing idle connection: ${connectionKey}`);
        socket.destroy();
        this.connections.delete(connectionKey);
      }
    }, this.CONNECTION_TIMEOUT);
    
    this.connectionTimers.set(connectionKey, timer);
  }

  /**
   * Annuler le timer de fermeture automatique
   */
  private clearConnectionTimer(connectionKey: string): void {
    const timer = this.connectionTimers.get(connectionKey);
    if (timer) {
      clearTimeout(timer);
      this.connectionTimers.delete(connectionKey);
    }
  }

  /**
   * Obtenir le statut des connexions
   */
  getConnectionsStatus(): Map<string, boolean> {
    const status = new Map<string, boolean>();
    
    for (const [key, socket] of this.connections) {
      status.set(key, this.isSocketConnected(socket));
    }
    
    return status;
  }

  /**
   * Health check pour toutes les imprimantes configurées
   */
  async healthCheck(): Promise<Map<string, boolean>> {
    const results = new Map<string, boolean>();
    const printers = await this.storage.getAllPrinters();
    
    const checks = printers.map(async (printer) => {
      if (!printer.isEnabled) {
        results.set(printer.id, false);
        return;
      }
      
      const isOnline = await this.checkPrinterAvailability(
        printer.ipAddress, 
        printer.port, 
        1000
      );
      results.set(printer.id, isOnline);
      
      // Mettre à jour le statut
      await this.storage.updatePrinterStatus(
        printer.id,
        isOnline ? ConnectionStatus.CONNECTED : ConnectionStatus.DISCONNECTED
      );
    });
    
    await Promise.all(checks);
    return results;
  }
}