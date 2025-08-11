// src/services/printing/templates/KitchenTemplate.ts

import { BaseTemplate } from './BaseTemplate';
import { KitchenOrderData } from '../types';

/**
 * Template pour l'impression des tickets de cuisine
 */
export class KitchenTemplate extends BaseTemplate {
  
  /**
   * Générer le ticket de cuisine
   */
  generate(data: KitchenOrderData): Buffer {
    this.reset();
    
    // En-tête spécial cuisine (plus visible)
    this.addKitchenHeader(data);
    
    // Informations de la commande
    this.addOrderDetails(data);
    
    // Articles à préparer
    this.addKitchenItems(data);
    
    // Instructions spéciales
    this.addSpecialInstructions(data);
    
    // Pied de page
    this.addKitchenFooter(data);
    
    // Finaliser avec beep si configuré
    this.finalizeDocument();
    
    return this.builder.build();
  }
  
  /**
   * En-tête spécifique pour la cuisine
   */
  private addKitchenHeader(data: KitchenOrderData): void {
    // Grande taille pour visibilité en cuisine
    this.builder
      .align('center')
      .size('double')
      .bold(true);
    
    // Priorité si rush
    if (data.priority === 'rush') {
      this.builder
        .line('*** URGENT ***')
        .newLine();
    }
    
    // Numéro de table en grand
    this.builder
      .line(`TABLE ${data.tableName}`)
      .size('normal')
      .line(`Commande #${data.orderId}`)
      .bold(false)
      .separator('=')
      .align('left');
  }
  
  /**
   * Détails de la commande
   */
  private addOrderDetails(data: KitchenOrderData): void {
    // Heure de commande
    const orderTime = new Date(data.orderTime);
    const timeStr = orderTime.toLocaleTimeString('fr-FR', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
    
    this.builder
      .bold(true)
      .leftRight('HEURE:', timeStr)
      .bold(false);
    
    // Serveur
    if (data.serverName) {
      this.builder.leftRight('Serveur:', data.serverName);
    }
    
    // Nombre total d'articles
    const totalItems = data.items.reduce((sum, item) => sum + item.quantity, 0);
    this.builder.leftRight('Articles:', `${totalItems} pièces`);
    
    this.builder.separator('=');
  }
  
  /**
   * Articles à préparer
   */
  private addKitchenItems(data: KitchenOrderData): void {
    // Grouper par catégorie si disponible
    const itemsByCategory = this.groupItemsByCategory(data.items);
    
    for (const [category, items] of itemsByCategory) {
      if (category !== 'Sans catégorie') {
        this.builder
          .newLine()
          .bold(true)
          .line(`[${category.toUpperCase()}]`)
          .bold(false);
      }
      
      for (const item of items) {
        // Quantité et nom en grand
        this.builder
          .size('double-height')
          .bold(true)
          .line(`${item.quantity}x ${item.name}`)
          .bold(false)
          .size('normal');
        
        // Notes et modifications
        if (item.notes) {
          this.builder
            .text('  ')
            .underline(true)
            .line(`=> ${item.notes}`)
            .underline(false);
        }
        
        // Temps de préparation estimé
        if (item.preparationTime) {
          this.builder
            .text('  ')
            .line(`⏱ ${item.preparationTime} min`);
        }
        
        this.builder.newLine();
      }
    }
    
    this.builder.separator('=');
  }
  
  /**
   * Instructions spéciales
   */
  private addSpecialInstructions(data: KitchenOrderData): void {
    if (data.specialInstructions) {
      this.builder
        .bold(true)
        .line('*** INSTRUCTIONS SPÉCIALES ***')
        .bold(false)
        .size('double-height')
        .line(data.specialInstructions)
        .size('normal')
        .separator('=');
    }
  }
  
  /**
   * Pied de page pour la cuisine
   */
  private addKitchenFooter(data: KitchenOrderData): void {
    // Rappel du numéro de table
    this.builder
      .align('center')
      .size('double')
      .bold(true)
      .line(`TABLE ${data.tableName}`)
      .bold(false)
      .size('normal');
    
    // Heure actuelle pour référence
    const now = new Date();
    const currentTime = now.toLocaleTimeString('fr-FR', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
    
    this.builder
      .align('center')
      .line(`Imprimé à ${currentTime}`)
      .newLine();
    
    // Ligne de découpe visuelle
    if (this.paperWidth > 32) {
      this.builder
        .align('center')
        .line('--- DÉCOUPER ICI ---')
        .newLine();
    }
  }
  
  /**
   * Grouper les articles par catégorie
   */
  private groupItemsByCategory(items: KitchenOrderData['items']): Map<string, typeof items> {
    const grouped = new Map<string, typeof items>();
    
    for (const item of items) {
      const category = item.category || 'Sans catégorie';
      if (!grouped.has(category)) {
        grouped.set(category, []);
      }
      grouped.get(category)!.push(item);
    }
    
    // Trier les catégories pour un ordre cohérent
    const sortedMap = new Map(
      Array.from(grouped.entries()).sort((a, b) => {
        // Mettre "Sans catégorie" à la fin
        if (a[0] === 'Sans catégorie') return 1;
        if (b[0] === 'Sans catégorie') return -1;
        return a[0].localeCompare(b[0]);
      })
    );
    
    return sortedMap;
  }
  
  /**
   * Générer un ticket de modification (pour annulation ou modification)
   */
  generateModification(
    orderId: number,
    tableName: string,
    modification: 'ANNULATION' | 'MODIFICATION',
    items: Array<{ quantity: number; name: string; reason?: string }>
  ): Buffer {
    this.reset();
    
    // En-tête d'alerte
    this.builder
      .align('center')
      .size('double')
      .bold(true)
      .line(`*** ${modification} ***`)
      .newLine()
      .line(`TABLE ${tableName}`)
      .size('normal')
      .line(`Commande #${orderId}`)
      .bold(false)
      .separator('=')
      .align('left');
    
    // Articles concernés
    this.builder
      .bold(true)
      .line('ARTICLES CONCERNÉS:')
      .bold(false)
      .separator('-');
    
    for (const item of items) {
      this.builder
        .size('double-height')
        .bold(true)
        .line(`${item.quantity}x ${item.name}`)
        .bold(false)
        .size('normal');
      
      if (item.reason) {
        this.builder
          .text('  Raison: ')
          .line(item.reason);
      }
    }
    
    // Pied de page
    this.builder
      .separator('=')
      .align('center')
      .size('double')
      .bold(true)
      .line(`${modification}`)
      .bold(false)
      .size('normal')
      .newLine();
    
    this.finalizeDocument();
    
    return this.builder.build();
  }
}