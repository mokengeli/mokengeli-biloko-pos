// src/services/printing/PrinterDiscovery.ts

import { EventEmitter } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import { 
  DiscoveredPrinter, 
  DiscoveryOptions,
  PrintEvent,
  PrinterType
} from './types';
import { ConnectionManager } from './ConnectionManager';
import { PrinterStorage } from './PrinterStorage';

/**
 * Service de découverte automatique d'imprimantes sur le réseau
 */
export class PrinterDiscovery extends EventEmitter {
  private static instance: PrinterDiscovery;
  private connectionManager: ConnectionManager;
  private isScanning: boolean = false;
  private cancelScan: boolean = false;
  
  // Ports standards pour imprimantes réseau
  private readonly DEFAULT_PORTS = [
    9100,  // Port standard ESC/POS (RAW)
    515,   // LPR/LPD
    631,   // IPP (Internet Printing Protocol)
    8008,  // Alternative HTTP
    3911,  // Alternative pour certaines imprimantes
  ];
  
  // Manufacturers connus (pour identification)
  private readonly KNOWN_MANUFACTURERS = [
    { pattern: /epson/i, name: 'Epson' },
    { pattern: /munbyn/i, name: 'MUNBYN' },
    { pattern: /star/i, name: 'Star Micronics' },
    { pattern: /bixolon/i, name: 'Bixolon' },
    { pattern: /citizen/i, name: 'Citizen' },
    { pattern: /tsc/i, name: 'TSC' },
    { pattern: /zebra/i, name: 'Zebra' },
    { pattern: /brother/i, name: 'Brother' },
  ];
  
  private constructor() {
    super();
    this.connectionManager = ConnectionManager.getInstance();
  }
  
  /**
   * Obtenir l'instance singleton
   */
  static getInstance(): PrinterDiscovery {
    if (!PrinterDiscovery.instance) {
      PrinterDiscovery.instance = new PrinterDiscovery();
    }
    return PrinterDiscovery.instance;
  }
  
  /**
   * Scanner le réseau pour trouver des imprimantes
   */
  async discoverPrinters(options?: Partial<DiscoveryOptions>): Promise<DiscoveredPrinter[]> {
    if (this.isScanning) {
      throw new Error('Un scan est déjà en cours');
    }
    
    const config: DiscoveryOptions = {
      timeout: options?.timeout || 2000,
      ports: options?.ports || this.DEFAULT_PORTS,
      subnet: options?.subnet,
      concurrent: options?.concurrent || 10
    };
    
    console.log('[PrinterDiscovery] Starting network scan...');
    this.isScanning = true;
    this.cancelScan = false;
    
    try {
      // Émettre l'événement de début
      this.emit(PrintEvent.DISCOVERY_STARTED.toString());
      
      // Obtenir les informations réseau
      const networkInfo = await this.connectionManager.getNetworkInfo();
      
      if (!networkInfo.isConnected) {
        throw new Error('Aucune connexion réseau disponible');
      }
      
      // Utiliser le subnet fourni ou celui détecté
      const subnet = config.subnet || networkInfo.subnet;
      
      if (!subnet) {
        throw new Error('Impossible de déterminer le subnet du réseau');
      }
      
      console.log(`[PrinterDiscovery] Scanning subnet: ${subnet}.0/24`);
      
      // Scanner le réseau
      const foundDevices = await this.scanNetwork(subnet, config);
      
      // Identifier les imprimantes parmi les devices trouvés
      const printers = await this.identifyPrinters(foundDevices, config);
      
      console.log(`[PrinterDiscovery] Found ${printers.length} printers`);
      
      // Émettre l'événement de fin
      this.emit(PrintEvent.DISCOVERY_COMPLETED.toString(), printers);
      
      return printers;
      
    } finally {
      this.isScanning = false;
      this.cancelScan = false;
    }
  }
  
  /**
   * Scanner le réseau pour trouver des devices
   */
  private async scanNetwork(
    subnet: string,
    config: DiscoveryOptions
  ): Promise<Array<{ ip: string; port: number }>> {
    const devices: Array<{ ip: string; port: number }> = [];
    const totalHosts = 254; // .1 à .254
    let scannedHosts = 0;
    
    // Fonction pour scanner un batch d'IPs
    const scanBatch = async (startIp: number, endIp: number) => {
      const promises: Promise<void>[] = [];
      
      for (let i = startIp; i <= endIp && !this.cancelScan; i++) {
        const ip = `${subnet}.${i}`;
        
        // Scanner tous les ports pour cette IP
        for (const port of config.ports) {
          promises.push(
            this.checkDevice(ip, port, config.timeout)
              .then(isOpen => {
                if (isOpen) {
                  devices.push({ ip, port });
                  console.log(`[PrinterDiscovery] Found device at ${ip}:${port}`);
                  
                  // Émettre un événement pour chaque device trouvé
                  this.emit(PrintEvent.PRINTER_FOUND.toString(), { ip, port });
                }
              })
              .catch(() => {
                // Ignorer les erreurs silencieusement
              })
          );
        }
      }
      
      await Promise.all(promises);
      
      // Mettre à jour la progression
      scannedHosts += (endIp - startIp + 1);
      const progress = Math.round((scannedHosts / totalHosts) * 100);
      
      // Émettre la progression
      this.emit('scanProgress', {
        current: scannedHosts,
        total: totalHosts,
        percentage: progress
      });
    };
    
    // Scanner par batches pour éviter de surcharger le réseau
    const batchSize = config.concurrent;
    
    for (let i = 1; i <= 254 && !this.cancelScan; i += batchSize) {
      const endIp = Math.min(i + batchSize - 1, 254);
      await scanBatch(i, endIp);
    }
    
    return devices;
  }
  
  /**
   * Vérifier si un device répond sur un port
   */
  private async checkDevice(ip: string, port: number, timeout: number): Promise<boolean> {
    try {
      return await this.connectionManager.checkPrinterAvailability(ip, port, timeout);
    } catch {
      return false;
    }
  }
  
  /**
   * Identifier les imprimantes parmi les devices trouvés
   */
  private async identifyPrinters(
    devices: Array<{ ip: string; port: number }>,
    config: DiscoveryOptions
  ): Promise<DiscoveredPrinter[]> {
    const printers: DiscoveredPrinter[] = [];
    
    for (const device of devices) {
      if (this.cancelScan) break;
      
      try {
        // Créer une config temporaire pour tester
        const testConfig = PrinterStorage.createDefaultPrinterConfig(
          PrinterType.GENERAL,
          device.ip,
          `Printer_${device.ip}`
        );
        testConfig.port = device.port;
        testConfig.timeout = config.timeout;
        
        // Essayer de se connecter et d'envoyer une commande de statut
        const isResponding = await this.testPrinterConnection(testConfig);
        
        // Essayer d'identifier le fabricant (futur: via SNMP ou autre)
        const manufacturer = this.guessManufacturer(device.ip);
        
        const printer: DiscoveredPrinter = {
          ipAddress: device.ip,
          port: device.port,
          hostname: `printer-${device.ip.replace(/\./g, '-')}`,
          manufacturer,
          model: 'Unknown',
          isResponding,
          macAddress: undefined // Pourrait être obtenu via ARP
        };
        
        printers.push(printer);
        
      } catch (error) {
        console.error(`[PrinterDiscovery] Error identifying printer at ${device.ip}:${device.port}:`, error);
      }
    }
    
    return printers;
  }
  
  /**
   * Tester la connexion à une imprimante
   */
  private async testPrinterConnection(config: any): Promise<boolean> {
    try {
      // Essayer d'envoyer une commande de statut ESC/POS
      const statusCommand = Buffer.from([0x10, 0x04, 0x01]); // DLE EOT n
      
      await this.connectionManager.sendData(config, statusCommand);
      return true;
      
    } catch {
      // Si la commande échoue, vérifier au moins si le port est ouvert
      return this.connectionManager.checkPrinterAvailability(
        config.ipAddress,
        config.port,
        config.timeout
      );
    }
  }
  
  /**
   * Deviner le fabricant basé sur l'IP ou d'autres indices
   */
  private guessManufacturer(ip: string): string {
    // Pour l'instant, on ne peut pas vraiment deviner
    // Dans le futur, on pourrait utiliser SNMP ou analyser les réponses
    return 'Unknown';
  }
  
  /**
   * Arrêter le scan en cours
   */
  stopScan(): void {
    if (this.isScanning) {
      console.log('[PrinterDiscovery] Stopping scan...');
      this.cancelScan = true;
    }
  }
  
  /**
   * Vérifier si un scan est en cours
   */
  isCurrentlyScanning(): boolean {
    return this.isScanning;
  }
  
  /**
   * Découverte rapide (ports communs uniquement)
   */
  async quickDiscover(): Promise<DiscoveredPrinter[]> {
    return this.discoverPrinters({
      ports: [9100], // Port le plus commun seulement
      timeout: 1000,
      concurrent: 20 // Plus rapide
    });
  }
  
  /**
   * Découverte approfondie (tous les ports)
   */
  async deepDiscover(): Promise<DiscoveredPrinter[]> {
    return this.discoverPrinters({
      ports: this.DEFAULT_PORTS,
      timeout: 3000,
      concurrent: 5 // Plus lent mais plus fiable
    });
  }
  
  /**
   * Tester une IP spécifique
   */
  async testSpecificPrinter(
    ip: string,
    port?: number
  ): Promise<DiscoveredPrinter | null> {
    const ports = port ? [port] : this.DEFAULT_PORTS;
    
    console.log(`[PrinterDiscovery] Testing ${ip} on ports ${ports.join(', ')}`);
    
    for (const p of ports) {
      const isOpen = await this.checkDevice(ip, p, 2000);
      
      if (isOpen) {
        console.log(`[PrinterDiscovery] Found printer at ${ip}:${p}`);
        
        return {
          ipAddress: ip,
          port: p,
          hostname: `printer-${ip.replace(/\./g, '-')}`,
          manufacturer: 'Unknown',
          model: 'Unknown',
          isResponding: true
        };
      }
    }
    
    return null;
  }
  
  /**
   * Obtenir les imprimantes sauvegardées
   */
  async getSavedPrinters(): Promise<any[]> {
    const storage = PrinterStorage.getInstance();
    return storage.getAllPrinters();
  }
  
  /**
   * Ajouter une imprimante découverte au système
   */
  async addDiscoveredPrinter(
    printer: DiscoveredPrinter,
    type: PrinterType,
    name?: string
  ): Promise<string> {
    const storage = PrinterStorage.getInstance();
    
    // Créer la configuration
    const config = PrinterStorage.createDefaultPrinterConfig(
      type,
      printer.ipAddress,
      name || `${printer.manufacturer || 'Printer'} ${printer.ipAddress}`
    );
    
    config.port = printer.port;
    
    // Déterminer les paramètres selon le type
    if (type === PrinterType.KITCHEN || type === PrinterType.BAR) {
      config.paperWidth = 80; // Généralement plus large pour la cuisine
      config.beepAfterPrint = true; // Alert sonore pour la cuisine
    } else if (type === PrinterType.CASHIER) {
      config.paperWidth = 80;
      config.openCashDrawer = true; // Ouvrir le tiroir-caisse
    }
    
    // Sauvegarder
    await storage.savePrinter(config);
    
    console.log(`[PrinterDiscovery] Added printer: ${config.name}`);
    
    return config.id;
  }
  
  /**
   * Obtenir le subnet actuel
   */
  async getCurrentSubnet(): Promise<string | null> {
    const networkInfo = await this.connectionManager.getNetworkInfo();
    return networkInfo.subnet || null;
  }
  
  /**
   * Obtenir les informations réseau
   */
  async getNetworkInfo(): Promise<{
    isConnected: boolean;
    type?: string;
    ipAddress?: string;
    subnet?: string;
  }> {
    const state = await NetInfo.fetch();
    const networkInfo = await this.connectionManager.getNetworkInfo();
    
    return {
      isConnected: state.isConnected || false,
      type: state.type,
      ipAddress: networkInfo.ipAddress,
      subnet: networkInfo.subnet
    };
  }
}