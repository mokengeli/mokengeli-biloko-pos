// src/services/printing/PrintQueue.ts

import AsyncStorage from '@react-native-async-storage/async-storage';
import { EventEmitter } from 'react-native';
import { 
  PrintJob, 
  PrintDocument, 
  ConnectionStatus 
} from './types';
import { ConnectionManager } from './ConnectionManager';
import { PrinterStorage } from './PrinterStorage';

/**
 * Gestionnaire de file d'attente pour les impressions
 * Gère l'ordre FIFO et la persistance des jobs
 */
export class PrintQueue extends EventEmitter {
  private static instance: PrintQueue;
  private readonly QUEUE_KEY = '@mokengeli_print_queue';
  private readonly FAILED_JOBS_KEY = '@mokengeli_failed_print_jobs';
  
  private queue: PrintJob[] = [];
  private failedJobs: PrintJob[] = [];
  private isProcessing: boolean = false;
  private processingJob: PrintJob | null = null;
  private processingTimer: NodeJS.Timeout | null = null;
  private initialized: boolean = false;
  
  private connectionManager: ConnectionManager;
  private storage: PrinterStorage;
  
  private readonly MAX_QUEUE_SIZE = 100;
  private readonly MAX_RETRY_COUNT = 3;
  private readonly PROCESSING_INTERVAL = 2000; // 2 secondes entre chaque job
  
  private constructor() {
    super();
    this.connectionManager = ConnectionManager.getInstance();
    this.storage = PrinterStorage.getInstance();
  }
  
  /**
   * Obtenir l'instance singleton
   */
  static getInstance(): PrintQueue {
    if (!PrintQueue.instance) {
      PrintQueue.instance = new PrintQueue();
    }
    return PrintQueue.instance;
  }
  
  /**
   * Initialiser la file d'attente
   */
  async initialize(): Promise<void> {
    if (this.initialized) return;
    
    try {
      console.log('[PrintQueue] Initializing...');
      
      // Charger la file d'attente persistée
      await this.loadQueue();
      
      // Charger les jobs échoués
      await this.loadFailedJobs();
      
      this.initialized = true;
      console.log('[PrintQueue] Initialized with', this.queue.length, 'pending jobs');
      
    } catch (error) {
      console.error('[PrintQueue] Initialization error:', error);
      this.queue = [];
      this.failedJobs = [];
      this.initialized = true;
    }
  }
  
  /**
   * Charger la file d'attente depuis le stockage
   */
  private async loadQueue(): Promise<void> {
    try {
      const data = await AsyncStorage.getItem(this.QUEUE_KEY);
      if (data) {
        this.queue = JSON.parse(data);
        
        // Nettoyer les jobs trop anciens (plus de 24h)
        const cutoff = Date.now() - (24 * 60 * 60 * 1000);
        this.queue = this.queue.filter(job => {
          const jobTime = new Date(job.createdAt).getTime();
          return jobTime > cutoff;
        });
      }
    } catch (error) {
      console.error('[PrintQueue] Error loading queue:', error);
      this.queue = [];
    }
  }
  
  /**
   * Sauvegarder la file d'attente
   */
  private async saveQueue(): Promise<void> {
    try {
      await AsyncStorage.setItem(this.QUEUE_KEY, JSON.stringify(this.queue));
    } catch (error) {
      console.error('[PrintQueue] Error saving queue:', error);
    }
  }
  
  /**
   * Charger les jobs échoués
   */
  private async loadFailedJobs(): Promise<void> {
    try {
      const data = await AsyncStorage.getItem(this.FAILED_JOBS_KEY);
      if (data) {
        this.failedJobs = JSON.parse(data);
        
        // Garder seulement les 50 derniers jobs échoués
        if (this.failedJobs.length > 50) {
          this.failedJobs = this.failedJobs.slice(-50);
        }
      }
    } catch (error) {
      console.error('[PrintQueue] Error loading failed jobs:', error);
      this.failedJobs = [];
    }
  }
  
  /**
   * Sauvegarder les jobs échoués
   */
  private async saveFailedJobs(): Promise<void> {
    try {
      await AsyncStorage.setItem(this.FAILED_JOBS_KEY, JSON.stringify(this.failedJobs));
    } catch (error) {
      console.error('[PrintQueue] Error saving failed jobs:', error);
    }
  }
  
  /**
   * Ajouter un job à la file d'attente
   */
  async addJob(document: PrintDocument, printerId: string): Promise<string> {
    if (!this.initialized) await this.initialize();
    
    // Vérifier la taille de la file
    if (this.queue.length >= this.MAX_QUEUE_SIZE) {
      throw new Error(`File d'attente pleine (max ${this.MAX_QUEUE_SIZE} jobs)`);
    }
    
    const job: PrintJob = {
      id: this.generateJobId(),
      document,
      printerId,
      status: 'pending',
      createdAt: new Date().toISOString(),
      retryCount: 0
    };
    
    // Ajouter selon la priorité
    if (document.priority === 'urgent') {
      // Insérer après les autres urgents mais avant les normaux
      const insertIndex = this.queue.findIndex(j => 
        j.document.priority !== 'urgent'
      );
      
      if (insertIndex === -1) {
        this.queue.push(job);
      } else {
        this.queue.splice(insertIndex, 0, job);
      }
    } else {
      // Ajouter à la fin (FIFO)
      this.queue.push(job);
    }
    
    await this.saveQueue();
    
    console.log('[PrintQueue] Job added:', job.id);
    this.emit('jobAdded', job);
    
    // Démarrer le traitement si nécessaire
    if (!this.isProcessing) {
      this.startProcessing();
    }
    
    return job.id;
  }
  
  /**
   * Démarrer le traitement de la file
   */
  startProcessing(): void {
    if (this.isProcessing) return;
    
    console.log('[PrintQueue] Starting processing...');
    this.isProcessing = true;
    this.processNext();
  }
  
  /**
   * Arrêter le traitement de la file
   */
  stopProcessing(): void {
    console.log('[PrintQueue] Stopping processing...');
    this.isProcessing = false;
    
    if (this.processingTimer) {
      clearTimeout(this.processingTimer);
      this.processingTimer = null;
    }
  }
  
  /**
   * Traiter le prochain job dans la file
   */
  private async processNext(): Promise<void> {
    if (!this.isProcessing) return;
    
    // S'il y a déjà un job en cours, attendre
    if (this.processingJob) return;
    
    // Prendre le prochain job
    const job = this.queue.shift();
    
    if (!job) {
      // File vide, attendre un peu avant de vérifier à nouveau
      this.processingTimer = setTimeout(() => {
        this.processNext();
      }, this.PROCESSING_INTERVAL);
      return;
    }
    
    // Marquer comme en cours de traitement
    this.processingJob = job;
    job.status = 'printing';
    job.startedAt = new Date().toISOString();
    
    console.log('[PrintQueue] Processing job:', job.id);
    this.emit('jobStarted', job);
    
    try {
      // Obtenir l'imprimante
      const printer = await this.storage.getPrinter(job.printerId);
      
      if (!printer || !printer.isEnabled) {
        throw new Error('Imprimante non disponible');
      }
      
      // Vérifier la connexion
      if (printer.status !== ConnectionStatus.CONNECTED) {
        const isOnline = await this.connectionManager.testConnection(printer);
        if (!isOnline) {
          throw new Error('Imprimante hors ligne');
        }
      }
      
      // Importer PrintManager dynamiquement pour éviter les dépendances circulaires
      const { PrintManager } = await import('./PrintManager');
      const printManager = PrintManager.getInstance();
      
      // Générer le contenu
      const content = await printManager.generateContent(job.document, printer);
      
      // Envoyer à l'imprimante
      await this.connectionManager.sendData(printer, content);
      
      // Marquer comme complété
      job.status = 'completed';
      job.completedAt = new Date().toISOString();
      
      console.log('[PrintQueue] Job completed:', job.id);
      this.emit('jobCompleted', job);
      
    } catch (error: any) {
      console.error('[PrintQueue] Job failed:', job.id, error);
      
      // Incrémenter le compteur de retry
      job.retryCount++;
      job.error = error.message;
      
      if (job.retryCount < this.MAX_RETRY_COUNT) {
        // Remettre dans la file pour retry
        job.status = 'pending';
        
        // Le remettre en tête de file pour retry rapide
        this.queue.unshift(job);
        
        console.log(`[PrintQueue] Job ${job.id} will be retried (attempt ${job.retryCount}/${this.MAX_RETRY_COUNT})`);
        
      } else {
        // Marquer comme échoué définitivement
        job.status = 'failed';
        this.failedJobs.push(job);
        await this.saveFailedJobs();
        
        this.emit('jobFailed', job, error.message);
      }
    } finally {
      // Nettoyer et sauvegarder
      this.processingJob = null;
      await this.saveQueue();
      
      // Programmer le prochain traitement
      this.processingTimer = setTimeout(() => {
        this.processNext();
      }, this.PROCESSING_INTERVAL);
    }
  }
  
  /**
   * Obtenir un job par son ID
   */
  async getJob(jobId: string): Promise<PrintJob | null> {
    // Vérifier le job en cours
    if (this.processingJob && this.processingJob.id === jobId) {
      return this.processingJob;
    }
    
    // Chercher dans la file
    const pendingJob = this.queue.find(j => j.id === jobId);
    if (pendingJob) return pendingJob;
    
    // Chercher dans les jobs échoués
    const failedJob = this.failedJobs.find(j => j.id === jobId);
    if (failedJob) return failedJob;
    
    return null;
  }
  
  /**
   * Réessayer un job échoué
   */
  async retryJob(jobId: string): Promise<void> {
    const failedIndex = this.failedJobs.findIndex(j => j.id === jobId);
    
    if (failedIndex === -1) {
      throw new Error('Job introuvable dans les jobs échoués');
    }
    
    const job = this.failedJobs[failedIndex];
    
    // Retirer des jobs échoués
    this.failedJobs.splice(failedIndex, 1);
    await this.saveFailedJobs();
    
    // Réinitialiser et remettre dans la file
    job.status = 'pending';
    job.retryCount = 0;
    job.error = undefined;
    
    this.queue.unshift(job); // En tête pour traitement rapide
    await this.saveQueue();
    
    console.log('[PrintQueue] Job retry scheduled:', jobId);
    this.emit('jobRetry', job);
    
    // Redémarrer le traitement si nécessaire
    if (!this.isProcessing) {
      this.startProcessing();
    }
  }
  
  /**
   * Annuler un job
   */
  async cancelJob(jobId: string): Promise<void> {
    // Si c'est le job en cours, on ne peut pas l'annuler
    if (this.processingJob && this.processingJob.id === jobId) {
      throw new Error('Impossible d\'annuler un job en cours d\'impression');
    }
    
    // Chercher et retirer de la file
    const index = this.queue.findIndex(j => j.id === jobId);
    
    if (index === -1) {
      throw new Error('Job introuvable dans la file');
    }
    
    const job = this.queue[index];
    this.queue.splice(index, 1);
    
    // Marquer comme annulé et sauvegarder dans les échecs pour historique
    job.status = 'cancelled';
    job.error = 'Annulé par l\'utilisateur';
    this.failedJobs.push(job);
    
    await this.saveQueue();
    await this.saveFailedJobs();
    
    console.log('[PrintQueue] Job cancelled:', jobId);
    this.emit('jobCancelled', job);
  }
  
  /**
   * Obtenir le statut de la file
   */
  async getStatus(): Promise<{
    isProcessing: boolean;
    queueLength: number;
    processingJob: PrintJob | null;
    pendingJobs: PrintJob[];
    failedJobs: PrintJob[];
    stats: {
      urgent: number;
      high: number;
      normal: number;
      low: number;
    };
  }> {
    const stats = {
      urgent: 0,
      high: 0,
      normal: 0,
      low: 0
    };
    
    for (const job of this.queue) {
      stats[job.document.priority]++;
    }
    
    return {
      isProcessing: this.isProcessing,
      queueLength: this.queue.length,
      processingJob: this.processingJob,
      pendingJobs: [...this.queue],
      failedJobs: [...this.failedJobs],
      stats
    };
  }
  
  /**
   * Vider la file d'attente
   */
  async clear(): Promise<void> {
    if (this.processingJob) {
      console.warn('[PrintQueue] Cannot clear queue while job is processing');
      throw new Error('Impossible de vider la file pendant qu\'un job est en cours');
    }
    
    this.queue = [];
    await this.saveQueue();
    
    console.log('[PrintQueue] Queue cleared');
    this.emit('queueCleared');
  }
  
  /**
   * Vider les jobs échoués
   */
  async clearFailedJobs(): Promise<void> {
    this.failedJobs = [];
    await this.saveFailedJobs();
    
    console.log('[PrintQueue] Failed jobs cleared');
    this.emit('failedJobsCleared');
  }
  
  /**
   * Générer un ID unique pour un job
   */
  private generateJobId(): string {
    return `job_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }
  
  /**
   * Obtenir tous les jobs (pour affichage)
   */
  getAllJobs(): {
    pending: PrintJob[];
    processing: PrintJob | null;
    failed: PrintJob[];
  } {
    return {
      pending: [...this.queue],
      processing: this.processingJob,
      failed: [...this.failedJobs]
    };
  }
  
  /**
   * Réorganiser la priorité d'un job
   */
  async prioritizeJob(jobId: string): Promise<void> {
    const index = this.queue.findIndex(j => j.id === jobId);
    
    if (index === -1) {
      throw new Error('Job introuvable dans la file');
    }
    
    if (index === 0) {
      // Déjà en tête de file
      return;
    }
    
    // Retirer et remettre en tête
    const job = this.queue.splice(index, 1)[0];
    this.queue.unshift(job);
    
    await this.saveQueue();
    
    console.log('[PrintQueue] Job prioritized:', jobId);
    this.emit('jobPrioritized', job);
  }
}