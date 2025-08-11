// src/services/printing/templates/BillTemplate.ts

import { BaseTemplate } from './BaseTemplate';
import { BillData } from '../types';

/**
 * Template pour l'impression des additions/factures
 */
export class BillTemplate extends BaseTemplate {
  
  /**
   * Générer l'addition/facture
   */
  generate(data: BillData): Buffer {
    this.reset();
    
    // En-tête du restaurant
    this.addHeader({
      name: 'MOKENGELI BILOKO',
      address: data.restaurantInfo?.address,
      phone: data.restaurantInfo?.phone,
      taxId: data.restaurantInfo?.taxId
    });
    
    // Type de document
    this.addDocumentType(data);
    
    // Informations de la commande
    this.addBillInfo(data);
    
    // Articles détaillés
    this.addBillItems(data);
    
    // Totaux
    this.addBillTotals(data);
    
    // Mentions légales et pied de page
    this.addBillFooter(data);
    
    // Finaliser
    this.finalizeDocument();
    
    return this.builder.build();
  }
  
  /**
   * Type de document (Addition ou Facture)
   */
  private addDocumentType(data: BillData): void {
    this.builder
      .align('center')
      .size('double-height')
      .bold(true)
      .line('ADDITION')
      .bold(false)
      .size('normal')
      .align('left')
      .separator('=');
  }
  
  /**
   * Informations de l'addition
   */
  private addBillInfo(data: BillData): void {
    // Numéro et table
    this.builder
      .leftRight(`N° ${data.orderId}`, `Table: ${data.tableName}`);
    
    // Date et heure
    this.addDateTime();
    
    // Serveur
    if (data.serverName) {
      this.builder.line(`Serveur: ${data.serverName}`);
    }
    
    // Nombre de couverts
    if (data.covers) {
      this.builder.line(`Couverts: ${data.covers}`);
    }
    
    this.builder.separator('-');
  }
  
  /**
   * Articles de l'addition
   */
  private addBillItems(data: BillData): void {
    // En-tête du tableau
    this.builder
      .bold(true)
      .columns(['Qté', 'Article', 'P.U.', 'Total'], [4, this.paperWidth - 20, 8, 8])
      .bold(false)
      .separator('-');
    
    // Articles
    for (const item of data.items) {
      const columns = [
        item.quantity.toString(),
        this.truncateText(item.name, this.paperWidth - 20),
        this.formatAmount(item.unitPrice, ''),
        this.formatAmount(item.totalPrice, '')
      ];
      
      this.builder.columns(columns, [4, this.paperWidth - 20, 8, 8]);
    }
    
    this.builder.separator('-');
  }
  
  /**
   * Totaux de l'addition
   */
  private addBillTotals(data: BillData): void {
    // Sous-total
    this.builder
      .leftRight('Sous-total HT:', this.formatAmount(data.subtotal, data.currency));
    
    // TVA
    if (data.tax > 0) {
      const taxRate = (data.tax / data.subtotal * 100).toFixed(0);
      this.builder
        .leftRight(`TVA ${taxRate}%:`, this.formatAmount(data.tax, data.currency));
    }
    
    // Service charge
    if (data.serviceCharge && data.serviceCharge > 0) {
      this.builder
        .leftRight('Service:', this.formatAmount(data.serviceCharge, data.currency));
    }
    
    // Total TTC
    this.builder
      .separator('=')
      .size('double-height')
      .bold(true)
      .leftRight('TOTAL TTC:', this.formatAmount(data.total, data.currency))
      .bold(false)
      .size('normal')
      .separator('=');
  }
  
  /**
   * Pied de page de l'addition
   */
  private addBillFooter(data: BillData): void {
    // TVA incluse
    if (data.tax > 0) {
      this.builder
        .align('center')
        .line('TVA incluse')
        .newLine();
    }
    
    // Service inclus ou non
    if (data.serviceCharge && data.serviceCharge > 0) {
      this.builder
        .align('center')
        .line('Service compris')
        .newLine();
    } else {
      this.builder
        .align('center')
        .line('Service non compris')
        .newLine();
    }
    
    // Message de paiement
    this.builder
      .align('center')
      .bold(true)
      .line('À RÉGLER À LA CAISSE')
      .bold(false)
      .newLine();
    
    // Moyens de paiement acceptés
    this.builder
      .align('center')
      .line('Espèces - CB - Chèques')
      .newLine();
    
    // Message de remerciement
    this.builder
      .separator('=')
      .align('center')
      .line('Merci de votre visite')
      .line('À bientôt!')
      .newLine();
    
    // Informations légales si facture
    if (data.customerInfo) {
      this.addInvoiceInfo(data);
    }
  }
  
  /**
   * Informations supplémentaires pour une facture
   */
  private addInvoiceInfo(data: BillData): void {
    this.builder
      .separator('=')
      .align('left')
      .bold(true)
      .line('FACTURE')
      .bold(false);
    
    if (data.customerInfo?.name) {
      this.builder.line(`Client: ${data.customerInfo.name}`);
    }
    
    if (data.customerInfo?.address) {
      this.builder.line(`Adresse: ${data.customerInfo.address}`);
    }
    
    if (data.customerInfo?.taxId) {
      this.builder.line(`NIF: ${data.customerInfo.taxId}`);
    }
    
    this.builder.newLine();
  }
  
  /**
   * Tronquer un texte si trop long
   */
  private truncateText(text: string, maxLength: number): string {
    if (text.length <= maxLength) {
      return text;
    }
    return text.substring(0, maxLength - 3) + '...';
  }
  
  /**
   * Générer une addition simplifiée pour démonstration
   */
  generateDemo(): Buffer {
    const demoData: BillData = {
      orderId: 1234,
      tableName: '12',
      items: [
        { quantity: 2, name: 'Burger Classic', unitPrice: 12.50, totalPrice: 25.00 },
        { quantity: 1, name: 'Salade César', unitPrice: 8.50, totalPrice: 8.50 },
        { quantity: 2, name: 'Coca Cola', unitPrice: 3.50, totalPrice: 7.00 },
        { quantity: 1, name: 'Tiramisu', unitPrice: 6.50, totalPrice: 6.50 }
      ],
      subtotal: 47.00,
      tax: 4.70,
      serviceCharge: 0,
      total: 51.70,
      currency: 'EUR',
      serverName: 'Marie',
      covers: 2,
      restaurantInfo: {
        name: 'MOKENGELI BILOKO',
        address: '123 Rue de la Paix, 75001 Paris',
        phone: '01 23 45 67 89',
        taxId: 'FR12345678901'
      }
    };
    
    return this.generate(demoData);
  }
}