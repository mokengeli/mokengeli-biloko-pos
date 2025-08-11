// src/services/printing/templates/BaseTemplate.ts

import { CommandBuilder, ESCPOSCommands } from '../utils/ESCPOSCommands';
import { PrinterConfig } from '../types';

/**
 * Template de base pour tous les documents d'impression
 */
export abstract class BaseTemplate {
  protected builder: CommandBuilder;
  protected printer: PrinterConfig;
  protected paperWidth: number;

  constructor(printer: PrinterConfig) {
    this.printer = printer;
    this.paperWidth = this.calculateCharacterWidth();
    this.builder = ESCPOSCommands.createBuilder(this.paperWidth);
  }

  /**
   * Calculer la largeur en caractères selon la largeur du papier
   */
  private calculateCharacterWidth(): number {
    // Pour une police normale:
    // 58mm = 32 caractères
    // 80mm = 48 caractères
    return this.printer.paperWidth === 80 ? 48 : 32;
  }

  /**
   * Initialiser le document
   */
  protected initDocument(): void {
    this.builder
      .init()
      .setCharset(this.printer.charset as any || 'utf8')
      .align('left')
      .size('normal');
  }

  /**
   * Ajouter l'en-tête du restaurant
   */
  protected addHeader(restaurantInfo: {
    name: string;
    address?: string;
    phone?: string;
    taxId?: string;
  }): void {
    this.builder
      .align('center')
      .size('double')
      .bold(true)
      .line(restaurantInfo.name)
      .bold(false)
      .size('normal')
      .newLine();

    if (restaurantInfo.address) {
      this.builder.line(restaurantInfo.address);
    }
    
    if (restaurantInfo.phone) {
      this.builder.line(`Tel: ${restaurantInfo.phone}`);
    }
    
    if (restaurantInfo.taxId) {
      this.builder.line(`NIF: ${restaurantInfo.taxId}`);
    }
    
    this.builder.separator('=');
  }

  /**
   * Ajouter la date et l'heure
   */
  protected addDateTime(date?: Date): void {
    const now = date || new Date();
    const dateStr = now.toLocaleDateString('fr-FR');
    const timeStr = now.toLocaleTimeString('fr-FR', { 
      hour: '2-digit', 
      minute: '2-digit' 
    });
    
    this.builder.leftRight(dateStr, timeStr);
  }

  /**
   * Ajouter un pied de page
   */
  protected addFooter(message?: string): void {
    this.builder
      .newLine()
      .separator('=')
      .align('center')
      .line(message || 'Merci de votre visite!')
      .newLine();
  }

  /**
   * Formater un montant
   */
  protected formatAmount(amount: number, currency: string = 'EUR'): string {
    return `${amount.toFixed(2)} ${currency}`;
  }

  /**
   * Formater une ligne d'article
   */
  protected formatItemLine(
    quantity: number,
    name: string,
    unitPrice: number,
    currency: string = 'EUR'
  ): void {
    const total = quantity * unitPrice;
    const qtyStr = `${quantity}x`;
    const priceStr = this.formatAmount(total, currency);
    
    // Calculer l'espace disponible pour le nom
    const fixedWidth = qtyStr.length + priceStr.length + 2; // +2 pour les espaces
    const availableWidth = this.paperWidth - fixedWidth;
    
    // Tronquer le nom si nécessaire
    const truncatedName = name.length > availableWidth 
      ? name.substring(0, availableWidth - 3) + '...'
      : name;
    
    // Créer la ligne
    const line = `${qtyStr} ${truncatedName}`.padEnd(this.paperWidth - priceStr.length) + priceStr;
    this.builder.line(line);
  }

  /**
   * Ajouter un code QR (pour implémentation future)
   */
  protected addQRCode(data: string): void {
    // Pour l'instant, on ajoute juste une référence textuelle
    // L'implémentation réelle du QR code nécessite des commandes ESC/POS spécifiques
    this.builder
      .align('center')
      .line(`[QR: ${data}]`)
      .align('left');
  }

  /**
   * Ajouter un code-barres (pour implémentation future)
   */
  protected addBarcode(data: string): void {
    // Pour l'instant, on ajoute juste une référence textuelle
    this.builder
      .align('center')
      .line(`[CODE: ${data}]`)
      .align('left');
  }

  /**
   * Finaliser le document
   */
  protected finalizeDocument(): void {
    if (this.printer.cutPaper) {
      this.builder.cut(false); // Coupe partielle par défaut
    } else {
      this.builder.newLine(5); // Espacement si pas de coupe
    }
    
    if (this.printer.openCashDrawer) {
      this.builder.openCashDrawer();
    }
    
    if (this.printer.beepAfterPrint) {
      this.builder.beep();
    }
  }

  /**
   * Méthode abstraite à implémenter dans les sous-classes
   */
  abstract generate(data: any): Buffer;

  /**
   * Obtenir le builder pour des personnalisations avancées
   */
  protected getBuilder(): CommandBuilder {
    return this.builder;
  }

  /**
   * Réinitialiser le builder
   */
  protected reset(): void {
    this.builder.reset();
    this.initDocument();
  }

  /**
   * Ajouter une section avec titre
   */
  protected addSection(title: string, underline: boolean = true): void {
    this.builder
      .newLine()
      .bold(true)
      .line(title)
      .bold(false);
    
    if (underline) {
      this.builder.separator('-');
    }
  }

  /**
   * Ajouter un tableau
   */
  protected addTable(headers: string[], rows: string[][], widths?: number[]): void {
    // En-têtes
    this.builder.bold(true);
    this.builder.columns(headers, widths);
    this.builder.bold(false);
    this.builder.separator('-');
    
    // Lignes
    for (const row of rows) {
      this.builder.columns(row, widths);
    }
  }

  /**
   * Helper pour créer une ligne avec alignement spécial
   */
  protected addAlignedLine(
    left: string,
    center: string,
    right: string
  ): void {
    const totalWidth = this.paperWidth;
    const centerStart = Math.floor((totalWidth - center.length) / 2);
    const rightStart = totalWidth - right.length;
    
    let line = '';
    
    // Ajouter le texte de gauche
    line += left.substring(0, centerStart);
    
    // Remplir jusqu'au centre
    if (line.length < centerStart) {
      line += ' '.repeat(centerStart - line.length);
    }
    
    // Ajouter le texte du centre
    line += center;
    
    // Remplir jusqu'à la droite
    if (line.length < rightStart) {
      line += ' '.repeat(rightStart - line.length);
    }
    
    // Ajouter le texte de droite
    line += right;
    
    this.builder.line(line);
  }
}