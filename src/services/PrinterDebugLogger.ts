// src/services/PrinterDebugLogger.ts

export interface DebugLog {
  id: string;
  timestamp: Date;
  level: 'info' | 'success' | 'warning' | 'error';
  message: string;
  details?: any;
}

class PrinterDebugLogger {
  private static instance: PrinterDebugLogger;
  private logs: DebugLog[] = [];
  private listeners: ((logs: DebugLog[]) => void)[] = [];
  private notifyTimeout: NodeJS.Timeout | null = null;

  private constructor() {}

  static getInstance(): PrinterDebugLogger {
    if (!PrinterDebugLogger.instance) {
      PrinterDebugLogger.instance = new PrinterDebugLogger();
    }
    return PrinterDebugLogger.instance;
  }

  log(level: DebugLog['level'], message: string, details?: any): void {
    const log: DebugLog = {
      id: `${Date.now()}_${Math.random().toString(36).substr(2, 9)}`,
      timestamp: new Date(),
      level,
      message,
      details
    };

    this.logs.unshift(log); // Ajouter au début pour avoir le plus récent en haut

    // Limiter à 50 logs (réduit pour éviter la surcharge)
    if (this.logs.length > 50) {
      this.logs = this.logs.slice(0, 50);
    }

    // Notifier les listeners avec debounce pour éviter trop de mises à jour
    this.notifyListeners();

    // Console log pour le développement local
    const timestamp = log.timestamp.toLocaleTimeString();
    const prefix = `[${timestamp}] 🖨️`;
    
    switch (level) {
      case 'info':
        console.log(`${prefix} ${message}`, details || '');
        break;
      case 'success':
        console.log(`${prefix} ✅ ${message}`, details || '');
        break;
      case 'warning':
        console.warn(`${prefix} ⚠️ ${message}`, details || '');
        break;
      case 'error':
        console.error(`${prefix} ❌ ${message}`, details || '');
        break;
    }
  }

  // Notification avec debounce pour éviter trop de mises à jour
  private notifyListeners(): void {
    if (this.notifyTimeout) {
      clearTimeout(this.notifyTimeout);
    }
    
    this.notifyTimeout = setTimeout(() => {
      this.listeners.forEach(listener => listener([...this.logs])); // Copie pour éviter les références partagées
      this.notifyTimeout = null;
    }, 100); // Debounce de 100ms
  }

  info(message: string, details?: any): void {
    this.log('info', message, details);
  }

  success(message: string, details?: any): void {
    this.log('success', message, details);
  }

  warning(message: string, details?: any): void {
    this.log('warning', message, details);
  }

  error(message: string, details?: any): void {
    this.log('error', message, details);
  }

  getLogs(): DebugLog[] {
    return [...this.logs];
  }

  clearLogs(): void {
    this.logs = [];
    this.notifyListeners();
  }

  // Pour s'abonner aux changements de logs
  subscribe(listener: (logs: DebugLog[]) => void): () => void {
    this.listeners.push(listener);
    
    // Retourner une fonction de désabonnement
    return () => {
      const index = this.listeners.indexOf(listener);
      if (index > -1) {
        this.listeners.splice(index, 1);
      }
    };
  }

  // Méthodes de convenance pour différents types de logs d'impression
  connectionAttempt(ip: string, port: number): void {
    this.info(`Tentative de connexion`, { ip, port });
  }

  connectionSuccess(ip: string, port: number): void {
    this.success(`Connexion établie`, { ip, port });
  }

  connectionFailed(ip: string, port: number, error: any): void {
    this.error(`Connexion échouée`, { ip, port, error: error.message || error });
  }

  printStart(printerName: string, type: 'test' | 'ticket'): void {
    this.info(`Début impression ${type}`, { printerName });
  }

  printSuccess(printerName: string, type: 'test' | 'ticket'): void {
    this.success(`Impression ${type} réussie`, { printerName });
  }

  printFailed(printerName: string, error: any): void {
    this.error(`Impression échouée`, { printerName, error: error.message || error });
  }

  moduleStatus(available: boolean, moduleName: string): void {
    if (available) {
      this.success(`Module ${moduleName} disponible`);
    } else {
      this.warning(`Module ${moduleName} non disponible - Nécessite EAS Build`);
    }
  }

  networkTest(ip: string, port: number, success: boolean, responseTime?: number): void {
    if (success) {
      this.success(`Test réseau réussi`, { ip, port, responseTime });
    } else {
      this.error(`Test réseau échoué`, { ip, port });
    }
  }
}

// Export du singleton
export const printerDebugLogger = PrinterDebugLogger.getInstance();
export default printerDebugLogger;