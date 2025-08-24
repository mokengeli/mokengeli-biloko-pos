// src/services/ConnectionManager.ts
import NetInfo, { NetInfoState } from '@react-native-community/netinfo';

export interface ConnectionConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
  multiplier: number;
  jitter: boolean;
}

export interface ConnectionState {
  isOnline: boolean;
  connectionType: string | null;
  isInternetReachable: boolean | null;
  retryCount: number;
  nextRetryDelay: number;
  lastAttempt: number;
}

/**
 * Gestionnaire de connexion avec stratégie de reconnexion intelligente
 */
export class ConnectionManager {
  private config: ConnectionConfig = {
    maxRetries: 10,
    baseDelay: 1000,
    maxDelay: 60000,
    multiplier: 1.5,
    jitter: true
  };
  
  private state: ConnectionState = {
    isOnline: true,
    connectionType: null,
    isInternetReachable: null,
    retryCount: 0,
    nextRetryDelay: this.config.baseDelay,
    lastAttempt: 0
  };
  
  private netInfoUnsubscribe: (() => void) | null = null;
  private networkChangeCallbacks: Set<(state: ConnectionState) => void> = new Set();
  
  constructor(config?: Partial<ConnectionConfig>) {
    if (config) {
      this.config = { ...this.config, ...config };
    }
    this.setupNetworkListener();
  }
  
  /**
   * Configuration du listener réseau
   */
  private setupNetworkListener(): void {
    this.netInfoUnsubscribe = NetInfo.addEventListener((state: NetInfoState) => {
      const previousOnline = this.state.isOnline;
      
      this.state.isOnline = state.isConnected || false;
      this.state.connectionType = state.type;
      this.state.isInternetReachable = state.isInternetReachable;
      
      console.log('[ConnectionManager] Network state changed:', {
        online: this.state.isOnline,
        type: this.state.connectionType,
        reachable: this.state.isInternetReachable
      });
      
      // Notifier les callbacks si le statut a changé
      if (previousOnline !== this.state.isOnline) {
        this.notifyNetworkChange();
        
        // Reset retry count si on revient en ligne
        if (this.state.isOnline) {
          this.resetRetryState();
        }
      }
    });
  }
  
  /**
   * Calculer le délai de reconnexion avec exponential backoff
   */
  calculateRetryDelay(): number {
    const baseDelay = this.config.baseDelay * Math.pow(this.config.multiplier, this.state.retryCount);
    let delay = Math.min(baseDelay, this.config.maxDelay);
    
    // Ajouter du jitter pour éviter le thundering herd
    if (this.config.jitter) {
      const jitterRange = delay * 0.2; // 20% de jitter
      const jitter = (Math.random() - 0.5) * 2 * jitterRange;
      delay = Math.max(this.config.baseDelay, delay + jitter);
    }
    
    this.state.nextRetryDelay = Math.round(delay);
    return this.state.nextRetryDelay;
  }
  
  /**
   * Devrait-on réessayer la connexion ?
   */
  shouldRetry(): boolean {
    // Vérifier la connexion réseau
    if (!this.state.isOnline) {
      console.log('[ConnectionManager] No network, cannot retry');
      return false;
    }
    
    // Vérifier le nombre de tentatives
    if (this.state.retryCount >= this.config.maxRetries) {
      console.log('[ConnectionManager] Max retries reached');
      return false;
    }
    
    // Vérifier le délai depuis la dernière tentative
    const now = Date.now();
    const timeSinceLastAttempt = now - this.state.lastAttempt;
    
    if (timeSinceLastAttempt < this.state.nextRetryDelay) {
      console.log('[ConnectionManager] Too soon to retry, waiting...', {
        timeSinceLastAttempt,
        nextRetryDelay: this.state.nextRetryDelay
      });
      return false;
    }
    
    return true;
  }
  
  /**
   * Enregistrer une tentative de connexion
   */
  recordAttempt(): void {
    this.state.retryCount++;
    this.state.lastAttempt = Date.now();
    this.calculateRetryDelay();
    
    console.log('[ConnectionManager] Attempt recorded:', {
      retryCount: this.state.retryCount,
      nextDelay: this.state.nextRetryDelay
    });
  }
  
  /**
   * Enregistrer une connexion réussie
   */
  recordSuccess(): void {
    console.log('[ConnectionManager] Connection successful, resetting retry state');
    this.resetRetryState();
  }
  
  /**
   * Réinitialiser l'état de retry
   */
  private resetRetryState(): void {
    this.state.retryCount = 0;
    this.state.nextRetryDelay = this.config.baseDelay;
    this.state.lastAttempt = 0;
  }
  
  /**
   * Obtenir le temps d'attente avant la prochaine tentative
   */
  getTimeUntilNextRetry(): number {
    if (this.state.retryCount === 0) {
      return 0;
    }
    
    const now = Date.now();
    const timeSinceLastAttempt = now - this.state.lastAttempt;
    const timeRemaining = Math.max(0, this.state.nextRetryDelay - timeSinceLastAttempt);
    
    return timeRemaining;
  }
  
  /**
   * Attendre avant la prochaine tentative
   */
  async waitForNextRetry(): Promise<void> {
    const delay = this.getTimeUntilNextRetry();
    
    if (delay > 0) {
      console.log(`[ConnectionManager] Waiting ${delay}ms before next retry`);
      await new Promise(resolve => setTimeout(resolve, delay));
    }
  }
  
  /**
   * S'abonner aux changements de réseau
   */
  onNetworkChange(callback: (state: ConnectionState) => void): () => void {
    this.networkChangeCallbacks.add(callback);
    
    // Appeler immédiatement avec l'état actuel
    callback(this.getState());
    
    // Retourner une fonction de désabonnement
    return () => {
      this.networkChangeCallbacks.delete(callback);
    };
  }
  
  /**
   * Notifier les callbacks des changements réseau
   */
  private notifyNetworkChange(): void {
    const state = this.getState();
    this.networkChangeCallbacks.forEach(callback => {
      try {
        callback(state);
      } catch (error) {
        console.error('[ConnectionManager] Error in network change callback:', error);
      }
    });
  }
  
  /**
   * Obtenir l'état actuel
   */
  getState(): ConnectionState {
    return { ...this.state };
  }
  
  /**
   * Vérifier si on est en ligne
   */
  isOnline(): boolean {
    return this.state.isOnline;
  }
  
  /**
   * Vérifier si Internet est accessible
   */
  isInternetReachable(): boolean {
    return this.state.isInternetReachable === true;
  }
  
  /**
   * Obtenir le type de connexion
   */
  getConnectionType(): string | null {
    return this.state.connectionType;
  }
  
  /**
   * Forcer une vérification de la connexion
   */
  async checkConnection(): Promise<boolean> {
    try {
      const state = await NetInfo.fetch();
      this.state.isOnline = state.isConnected || false;
      this.state.connectionType = state.type;
      this.state.isInternetReachable = state.isInternetReachable;
      
      return this.state.isOnline;
    } catch (error) {
      console.error('[ConnectionManager] Error checking connection:', error);
      return false;
    }
  }
  
  /**
   * Réinitialiser le gestionnaire
   */
  reset(): void {
    this.resetRetryState();
  }
  
  /**
   * Nettoyer les ressources
   */
  destroy(): void {
    if (this.netInfoUnsubscribe) {
      this.netInfoUnsubscribe();
      this.netInfoUnsubscribe = null;
    }
    this.networkChangeCallbacks.clear();
  }
}