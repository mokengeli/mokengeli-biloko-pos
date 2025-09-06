// src/services/PrinterConnectionManager.ts
import { AppState, AppStateStatus } from 'react-native';
import { ThermalReceiptPrinterService } from './ThermalReceiptPrinterService';
import { PrinterConfig } from './PrinterService';

// Types pour le pool de connexions
interface ConnectionPoolEntry {
  connection: any;
  isConnected: boolean;
  lastUsed: number;
  lastHealthCheck: number;
  isHealthy: boolean;
  reconnectAttempts: number;
  printerConfig: PrinterConfig;
}

interface HealthCheckResult {
  isHealthy: boolean;
  latency?: number;
  error?: string;
}

/**
 * Service centralisé pour gérer les connexions persistantes aux imprimantes
 * Maintient un pool de connexions, surveille leur santé et gère les reconnexions
 */
export class PrinterConnectionManager {
  private static instance: PrinterConnectionManager;
  private connectionPool: Map<string, ConnectionPoolEntry> = new Map();
  private healthCheckInterval: NodeJS.Timeout | null = null;
  private appStateSubscription: any = null;
  
  // Configuration
  private readonly config = {
    healthCheckInterval: 30000, // 30 secondes
    connectionTimeout: 300000, // 5 minutes d'inactivité avant nettoyage
    maxReconnectAttempts: 5,
    reconnectBaseDelay: 2000, // 2 secondes
    maxReconnectDelay: 30000, // 30 secondes max
  };

  private constructor() {
    this.setupAppStateListener();
    this.startHealthCheck();
    console.log('[PrinterConnectionManager] Service initialized');
  }

  static getInstance(): PrinterConnectionManager {
    if (!PrinterConnectionManager.instance) {
      PrinterConnectionManager.instance = new PrinterConnectionManager();
    }
    return PrinterConnectionManager.instance;
  }

  // ============================================================================
  // GESTION DU POOL DE CONNEXIONS
  // ============================================================================

  /**
   * Obtenir une connexion prête pour une imprimante
   */
  async getConnection(printer: PrinterConfig): Promise<any> {
    const connectionKey = this.getConnectionKey(printer);
    let poolEntry = this.connectionPool.get(connectionKey);

    // Vérifier si une connexion existe et est saine
    if (poolEntry && poolEntry.isConnected && poolEntry.isHealthy) {
      poolEntry.lastUsed = Date.now();
      console.log(`[PrinterConnectionManager] Reusing existing connection for ${printer.name}`);
      return poolEntry.connection;
    }

    // Créer ou recréer la connexion
    console.log(`[PrinterConnectionManager] Creating new connection for ${printer.name}`);
    return await this.createConnection(printer);
  }

  /**
   * Créer une nouvelle connexion
   */
  private async createConnection(printer: PrinterConfig): Promise<any> {
    const connectionKey = this.getConnectionKey(printer);
    
    try {
      // Nettoyer l'ancienne connexion si elle existe
      await this.cleanupConnection(connectionKey);

      // Créer la nouvelle connexion
      const connected = await ThermalReceiptPrinterService.connectToPrinter(
        printer.connection.ip,
        printer.connection.port,
        10000 // Timeout de 10s
      );

      if (!connected) {
        throw new Error('Failed to establish connection');
      }

      // Ajouter au pool
      const poolEntry: ConnectionPoolEntry = {
        connection: ThermalReceiptPrinterService, // Reference au service connecté
        isConnected: true,
        lastUsed: Date.now(),
        lastHealthCheck: Date.now(),
        isHealthy: true,
        reconnectAttempts: 0,
        printerConfig: printer
      };

      this.connectionPool.set(connectionKey, poolEntry);
      console.log(`[PrinterConnectionManager] ✅ Connection established for ${printer.name}`);

      return poolEntry.connection;

    } catch (error) {
      console.error(`[PrinterConnectionManager] ❌ Failed to create connection for ${printer.name}:`, error);
      throw error;
    }
  }

  /**
   * Nettoyer une connexion spécifique
   */
  private async cleanupConnection(connectionKey: string): Promise<void> {
    const poolEntry = this.connectionPool.get(connectionKey);
    if (poolEntry) {
      try {
        if (poolEntry.isConnected && ThermalReceiptPrinterService.isModuleAvailable()) {
          await ThermalReceiptPrinterService.disconnect();
        }
      } catch (error) {
        console.error(`[PrinterConnectionManager] Error during cleanup for ${connectionKey}:`, error);
      }
      
      this.connectionPool.delete(connectionKey);
    }
  }

  /**
   * Nettoyer les connexions inactives
   */
  private async cleanupStaleConnections(): Promise<void> {
    const now = Date.now();
    const staleConnections: string[] = [];

    this.connectionPool.forEach((entry, key) => {
      const inactiveTime = now - entry.lastUsed;
      if (inactiveTime > this.config.connectionTimeout) {
        staleConnections.push(key);
      }
    });

    for (const key of staleConnections) {
      console.log(`[PrinterConnectionManager] Cleaning up stale connection: ${key}`);
      await this.cleanupConnection(key);
    }
  }

  // ============================================================================
  // HEALTH CHECK ET MONITORING
  // ============================================================================

  private startHealthCheck(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
    }

    this.healthCheckInterval = setInterval(async () => {
      await this.performHealthChecks();
      await this.cleanupStaleConnections();
    }, this.config.healthCheckInterval);

    console.log(`[PrinterConnectionManager] Health check started (interval: ${this.config.healthCheckInterval}ms)`);
  }

  private stopHealthCheck(): void {
    if (this.healthCheckInterval) {
      clearInterval(this.healthCheckInterval);
      this.healthCheckInterval = null;
      console.log('[PrinterConnectionManager] Health check stopped');
    }
  }

  private async performHealthChecks(): Promise<void> {
    const now = Date.now();
    const entries = Array.from(this.connectionPool.entries());

    console.log(`[PrinterConnectionManager] Performing health checks for ${entries.length} connections`);

    for (const [key, entry] of entries) {
      try {
        // Ne vérifier que les connexions utilisées récemment
        const timeSinceLastUse = now - entry.lastUsed;
        if (timeSinceLastUse > this.config.connectionTimeout) {
          continue; // Sera nettoyée par cleanupStaleConnections
        }

        const healthResult = await this.checkConnectionHealth(entry);
        
        if (healthResult.isHealthy) {
          entry.isHealthy = true;
          entry.lastHealthCheck = now;
          entry.reconnectAttempts = 0;
          console.log(`[PrinterConnectionManager] ✅ ${entry.printerConfig.name} is healthy`);
        } else {
          entry.isHealthy = false;
          console.log(`[PrinterConnectionManager] ❌ ${entry.printerConfig.name} is unhealthy: ${healthResult.error}`);
          
          // Tenter la reconnexion si pas trop de tentatives
          if (entry.reconnectAttempts < this.config.maxReconnectAttempts) {
            await this.attemptReconnection(key, entry);
          }
        }

      } catch (error) {
        console.error(`[PrinterConnectionManager] Error during health check for ${key}:`, error);
        entry.isHealthy = false;
      }
    }
  }

  private async checkConnectionHealth(entry: ConnectionPoolEntry): Promise<HealthCheckResult> {
    try {
      const startTime = Date.now();
      
      // Test simple de connexion
      const isHealthy = await ThermalReceiptPrinterService.testConnection(
        entry.printerConfig.connection.ip,
        entry.printerConfig.connection.port
      );
      
      const latency = Date.now() - startTime;

      return {
        isHealthy,
        latency,
        error: isHealthy ? undefined : 'Connection test failed'
      };

    } catch (error) {
      return {
        isHealthy: false,
        error: error instanceof Error ? error.message : 'Unknown error'
      };
    }
  }

  private async attemptReconnection(key: string, entry: ConnectionPoolEntry): Promise<void> {
    try {
      entry.reconnectAttempts++;
      console.log(`[PrinterConnectionManager] Attempting reconnection ${entry.reconnectAttempts}/${this.config.maxReconnectAttempts} for ${entry.printerConfig.name}`);

      // Calculer le délai de backoff
      const delay = Math.min(
        this.config.reconnectBaseDelay * Math.pow(2, entry.reconnectAttempts - 1),
        this.config.maxReconnectDelay
      );

      // Attendre avant la reconnexion
      await new Promise(resolve => setTimeout(resolve, delay));

      // Tenter la reconnexion
      await this.createConnection(entry.printerConfig);
      
      console.log(`[PrinterConnectionManager] ✅ Successfully reconnected to ${entry.printerConfig.name}`);

    } catch (error) {
      console.error(`[PrinterConnectionManager] ❌ Reconnection attempt failed for ${entry.printerConfig.name}:`, error);
      
      // Si trop de tentatives échouées, marquer comme malsaine
      if (entry.reconnectAttempts >= this.config.maxReconnectAttempts) {
        console.error(`[PrinterConnectionManager] Max reconnection attempts reached for ${entry.printerConfig.name}`);
        entry.isHealthy = false;
        entry.isConnected = false;
      }
    }
  }

  // ============================================================================
  // GESTION APPSTATE
  // ============================================================================

  private setupAppStateListener(): void {
    this.appStateSubscription = AppState.addEventListener(
      'change',
      this.handleAppStateChange
    );
  }

  private handleAppStateChange = async (nextAppState: AppStateStatus): Promise<void> => {
    console.log(`[PrinterConnectionManager] App state changed to: ${nextAppState}`);
    
    if (nextAppState === 'active') {
      // App devient active - redémarrer le monitoring et vérifier les connexions
      console.log('[PrinterConnectionManager] App became active, resuming operations');
      this.startHealthCheck();
      await this.validateAllConnections();
    } else if (nextAppState === 'background') {
      // App passe en arrière-plan - réduire l'activité
      console.log('[PrinterConnectionManager] App going to background, reducing activity');
      this.stopHealthCheck();
    }
  };

  private async validateAllConnections(): Promise<void> {
    console.log('[PrinterConnectionManager] Validating all connections after app resume');
    
    const entries = Array.from(this.connectionPool.values());
    for (const entry of entries) {
      try {
        const healthResult = await this.checkConnectionHealth(entry);
        entry.isHealthy = healthResult.isHealthy;
        entry.lastHealthCheck = Date.now();
        
        if (!healthResult.isHealthy) {
          console.log(`[PrinterConnectionManager] Connection to ${entry.printerConfig.name} needs repair`);
          entry.reconnectAttempts = 0; // Reset pour permettre les nouvelles tentatives
        }
      } catch (error) {
        console.error(`[PrinterConnectionManager] Error validating connection to ${entry.printerConfig.name}:`, error);
        entry.isHealthy = false;
      }
    }
  }

  // ============================================================================
  // UTILITAIRES
  // ============================================================================

  private getConnectionKey(printer: PrinterConfig): string {
    return `${printer.connection.ip}:${printer.connection.port}`;
  }

  /**
   * Obtenir les statistiques du pool de connexions
   */
  getPoolStats(): {
    totalConnections: number;
    healthyConnections: number;
    activeConnections: number;
    connections: Array<{
      key: string;
      printerName: string;
      isHealthy: boolean;
      isConnected: boolean;
      lastUsed: Date;
      reconnectAttempts: number;
    }>;
  } {
    const now = Date.now();
    const connections = Array.from(this.connectionPool.entries()).map(([key, entry]) => ({
      key,
      printerName: entry.printerConfig.name,
      isHealthy: entry.isHealthy,
      isConnected: entry.isConnected,
      lastUsed: new Date(entry.lastUsed),
      reconnectAttempts: entry.reconnectAttempts
    }));

    return {
      totalConnections: this.connectionPool.size,
      healthyConnections: connections.filter(c => c.isHealthy).length,
      activeConnections: connections.filter(c => (now - c.lastUsed.getTime()) < 60000).length,
      connections
    };
  }

  /**
   * Forcer la reconnexion d'une imprimante spécifique
   */
  async forceReconnect(printer: PrinterConfig): Promise<boolean> {
    const key = this.getConnectionKey(printer);
    console.log(`[PrinterConnectionManager] Forcing reconnection for ${printer.name}`);
    
    try {
      await this.createConnection(printer);
      return true;
    } catch (error) {
      console.error(`[PrinterConnectionManager] Force reconnection failed for ${printer.name}:`, error);
      return false;
    }
  }

  /**
   * Nettoyer toutes les connexions
   */
  async cleanup(): Promise<void> {
    console.log('[PrinterConnectionManager] Cleaning up all connections');
    
    this.stopHealthCheck();
    
    if (this.appStateSubscription) {
      this.appStateSubscription.remove();
      this.appStateSubscription = null;
    }

    const keys = Array.from(this.connectionPool.keys());
    for (const key of keys) {
      await this.cleanupConnection(key);
    }
    
    this.connectionPool.clear();
    console.log('[PrinterConnectionManager] Cleanup completed');
  }
}

// Export singleton
export const printerConnectionManager = PrinterConnectionManager.getInstance();