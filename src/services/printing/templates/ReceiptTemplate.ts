// src/services/printing/templates/ReceiptTemplate.ts

import { BaseTemplate } from './BaseTemplate';
import { ReceiptData } from '../types';

/**
 * Template pour l'impression des reçus de paiement
 */
export class ReceiptTemplate extends BaseTemplate {
  
  /**
   * Générer le reçu de paiement
   */
  generate(data: ReceiptData): Buffer {
    this.reset();
    
    // En-tête du restaurant
    this.addHeader(data.restaurantInfo);
    
    // Informations de la commande
    this.addOrderInfo(data);
    
    // Articles
    this.addItems(data);
    
    // Totaux
    this.addTotals(data);
    
    // Informations de paiement
    this.addPaymentInfo(data);
    
    // Pied de page
    this.addReceiptFooter(data);
    
    // Finaliser
    this.finalizeDocument();
    
    return this.builder.build();
  }
  
  /**
   * Ajouter les informations de la commande
   */
  private addOrderInfo(data: ReceiptData): void {
    this.builder
      .align('left')
      .leftRight(`Commande #${data.orderId}`, `Table: ${data.tableName}`)
      .line();
    
    this.addDateTime();
    
    if (data.serverName) {
      this.builder.line(`Serveur: ${data.serverName}`);
    }
    
    if (data.customerName) {
      this.builder.line(`Client: ${data.customerName}`);
    }
    
    this.builder.separator('=');
  }
  
  /**
   * Ajouter les articles
   */
  private addItems(data: ReceiptData): void {
    this.builder
      .bold(true)
      .line('ARTICLES')
      .bold(false)
      .separator('-');
    
    for (const item of data.items) {
      // Ligne principale de l'article
      this.formatItemLine(
        item.quantity,
        item.name,
        item.unitPrice,
        'EUR'
      );
      
      // Notes si présentes
      if (item.notes) {
        this.builder
          .text('  ')
          .size('normal')
          .line(`-> ${item.notes}`);
      }
    }
    
    this.builder.separator('-');
  }
  
  /**
   * Ajouter les totaux
   */
  private addTotals(data: ReceiptData): void {
    // Sous-total
    this.builder.leftRight(
      'Sous-total:',
      this.formatAmount(data.subtotal, 'EUR')
    );
    
    // TVA
    if (data.tax > 0) {
      this.builder.leftRight(
        'TVA (10%):',
        this.formatAmount(data.tax, 'EUR')
      );
    }
    
    // Remise
    if (data.discount && data.discount > 0) {
      this.builder.leftRight(
        'Remise:',
        `-${this.formatAmount(data.discount, 'EUR')}`
      );
    }
    
    // Total
    this.builder
      .separator('-')
      .bold(true)
      .size('double-height');
    
    this.builder.leftRight(
      'TOTAL:',
      this.formatAmount(data.total, 'EUR')
    );
    
    this.builder
      .bold(false)
      .size('normal')
      .separator('=');
  }
  
  /**
   * Ajouter les informations de paiement
   */
  private addPaymentInfo(data: ReceiptData): void {
    this.builder
      .bold(true)
      .line('PAIEMENT')
      .bold(false)
      .separator('-');
    
    // Mode de paiement
    this.builder.leftRight(
      `Mode: ${data.paymentMethod}`,
      ''
    );
    
    // Montant reçu
    this.builder.leftRight(
      'Montant reçu:',
      this.formatAmount(data.paidAmount, 'EUR')
    );
    
    // Monnaie rendue
    if (data.change > 0) {
      this.builder
        .bold(true)
        .leftRight(
          'Monnaie rendue:',
          this.formatAmount(data.change, 'EUR')
        )
        .bold(false);
    }
    
    this.builder.separator('=');
  }
  
  /**
   * Ajouter le pied de page du reçu
   */
  private addReceiptFooter(data: ReceiptData): void {
    // Numéro de transaction
    const transactionId = `TRX${data.orderId}${Date.now().toString().slice(-6)}`;
    
    this.builder
      .align('center')
      .size('normal')
      .line(`Transaction: ${transactionId}`)
      .newLine();
    
    // Message de remerciement
    this.builder
      .align('center')
      .bold(true)
      .line('*** MERCI DE VOTRE VISITE ***')
      .bold(false)
      .newLine();
    
    // Informations légales optionnelles
    if (data.restaurantInfo.taxId) {
      this.builder
        .align('center')
        .line('Document fiscal')
        .line('Conservez ce reçu')
        .newLine();
    }
    
    // Code QR ou code-barres pour feedback (futur)
    // this.addQRCode(`https://feedback.mokengeli.com/${transactionId}`);
    
    // Signature client si nécessaire
    if (data.paymentMethod === 'Carte') {
      this.builder
        .newLine(2)
        .separator('-')
        .line('Signature client:')
        .newLine(3)
        .separator('-');
    }
  }
  
  /**
   * Générer un reçu simplifié (pour test)
   */
  generateSimple(orderId: number, amount: number): Buffer {
    const simpleData: ReceiptData = {
      orderId,
      tableName: 'Test',
      items: [
        {
          quantity: 1,
          name: 'Article Test',
          unitPrice: amount,
          totalPrice: amount
        }
      ],
      subtotal: amount,
      tax: amount * 0.1,
      total: amount * 1.1,
      paidAmount: amount * 1.1,
      change: 0,
      paymentMethod: 'Espèces',
      serverName: 'Test',
      restaurantInfo: {
        name: 'RESTAURANT TEST',
        address: '123 Rue Test',
        phone: '01 23 45 67 89'
      }
    };
    
    return this.generate(simpleData);
  }
}