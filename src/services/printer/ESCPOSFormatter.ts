// src/services/printer/ESCPOSFormatter.ts

import { Buffer } from 'buffer';
import {
  IDocumentFormatter,
  FormattedDocument,
  DocumentSection,
  PaperWidth,
  PrinterConfig
} from '../../types/printer.types';

/**
 * Formateur de documents pour le protocole ESC/POS
 * Compatible avec la plupart des imprimantes thermiques
 */
export class ESCPOSFormatter implements IDocumentFormatter {
  private paperWidth: PaperWidth;
  private charset: string;
  private codepage: number;

  // Commandes ESC/POS standard
  private static readonly COMMANDS = {
    // Initialisation
    HW_INIT: Buffer.from([0x1B, 0x40]),                    // ESC @
    
    // Alignement du texte
    TXT_ALIGN_LT: Buffer.from([0x1B, 0x61, 0x00]),        // ESC a 0
    TXT_ALIGN_CT: Buffer.from([0x1B, 0x61, 0x01]),        // ESC a 1
    TXT_ALIGN_RT: Buffer.from([0x1B, 0x61, 0x02]),        // ESC a 2
    
    // Style de texte
    TXT_BOLD_ON: Buffer.from([0x1B, 0x45, 0x01]),         // ESC E 1
    TXT_BOLD_OFF: Buffer.from([0x1B, 0x45, 0x00]),        // ESC E 0
    TXT_UNDERLINE_ON: Buffer.from([0x1B, 0x2D, 0x01]),    // ESC - 1
    TXT_UNDERLINE_OFF: Buffer.from([0x1B, 0x2D, 0x00]),   // ESC - 0
    TXT_ITALIC_ON: Buffer.from([0x1B, 0x34, 0x01]),       // ESC 4 1
    TXT_ITALIC_OFF: Buffer.from([0x1B, 0x34, 0x00]),      // ESC 4 0
    
    // Taille du texte
    TXT_SIZE_NORMAL: Buffer.from([0x1D, 0x21, 0x00]),     // GS ! 0
    TXT_SIZE_DOUBLE_HEIGHT: Buffer.from([0x1D, 0x21, 0x01]), // GS ! 1
    TXT_SIZE_DOUBLE_WIDTH: Buffer.from([0x1D, 0x21, 0x10]),  // GS ! 16
    TXT_SIZE_DOUBLE: Buffer.from([0x1D, 0x21, 0x11]),     // GS ! 17
    TXT_SIZE_TRIPLE: Buffer.from([0x1D, 0x21, 0x22]),     // GS ! 34
    TXT_SIZE_QUADRUPLE: Buffer.from([0x1D, 0x21, 0x33]),  // GS ! 51
    
    // Inversion des couleurs
    TXT_INVERT_ON: Buffer.from([0x1D, 0x42, 0x01]),       // GS B 1
    TXT_INVERT_OFF: Buffer.from([0x1D, 0x42, 0x00]),      // GS B 0
    
    // Papier
    PAPER_FEED: Buffer.from([0x0A]),                       // LF
    PAPER_CUT_FULL: Buffer.from([0x1D, 0x56, 0x00]),      // GS V 0
    PAPER_CUT_PARTIAL: Buffer.from([0x1D, 0x56, 0x01]),   // GS V 1
    
    // Tiroir-caisse
    CASH_DRAWER: Buffer.from([0x1B, 0x70, 0x00, 0x19, 0x19]), // ESC p 0
    
    // Code-barres
    BARCODE_HEIGHT: Buffer.from([0x1D, 0x68]),             // GS h n
    BARCODE_WIDTH: Buffer.from([0x1D, 0x77]),              // GS w n
    BARCODE_FONT: Buffer.from([0x1D, 0x66]),               // GS f n
    BARCODE_TXT_OFF: Buffer.from([0x1D, 0x48, 0x00]),     // GS H 0
    BARCODE_TXT_ABOVE: Buffer.from([0x1D, 0x48, 0x01]),   // GS H 1
    BARCODE_TXT_BELOW: Buffer.from([0x1D, 0x48, 0x02]),   // GS H 2
    BARCODE_TXT_BOTH: Buffer.from([0x1D, 0x48, 0x03]),    // GS H 3
    
    // QR Code
    QR_CODE_MODEL: Buffer.from([0x1D, 0x28, 0x6B, 0x04, 0x00, 0x31, 0x41]), // Model 2
    QR_CODE_SIZE: Buffer.from([0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x43]),  // Size
    QR_CODE_ERROR: Buffer.from([0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x45]), // Error correction
  };

  constructor(config?: PrinterConfig) {
    this.paperWidth = config?.printSettings?.paperWidth || 80;
    this.charset = config?.printSettings?.charset || 'UTF-8';
    this.codepage = config?.printSettings?.codepage || 0;
  }

  /**
   * Formate un document complet
   */
  format(document: FormattedDocument, settings?: any): Buffer {
    const chunks: Buffer[] = [];

    // Initialisation
    chunks.push(ESCPOSFormatter.COMMANDS.HW_INIT);

    // En-tête
    if (document.header) {
      chunks.push(this.formatSection(document.header));
    }

    // Corps
    for (const section of document.body) {
      chunks.push(this.formatSection(section));
    }

    // Pied de page
    if (document.footer) {
      chunks.push(this.formatSection(document.footer));
    }

    // Actions finales
    if (document.settings?.cutPaper) {
      chunks.push(Buffer.from([0x0A, 0x0A, 0x0A])); // 3 lignes vides
      chunks.push(ESCPOSFormatter.COMMANDS.PAPER_CUT_FULL);
    }

    if (document.settings?.openCashDrawer) {
      chunks.push(ESCPOSFormatter.COMMANDS.CASH_DRAWER);
    }

    if (document.settings?.beep) {
      chunks.push(Buffer.from([0x1B, 0x42, 0x01, 0x02])); // Beep 2 fois
    }

    return Buffer.concat(chunks);
  }

  /**
   * Formate une section de document
   */
  private formatSection(section: DocumentSection): Buffer {
    const chunks: Buffer[] = [];

    // Alignement
    if (section.alignment) {
      chunks.push(this.getAlignmentCommand(section.alignment));
    }

    // Style
    if (section.style) {
      chunks.push(this.getStyleCommands(section.style));
    }

    // Contenu selon le type
    switch (section.type) {
      case 'TEXT':
        chunks.push(this.formatText(section.content, section.style));
        break;
      
      case 'LINE':
        chunks.push(this.formatLine(section.content));
        break;
      
      case 'BARCODE':
        chunks.push(this.formatBarcode(section.content.data, section.content.type || 'CODE128'));
        break;
      
      case 'QRCODE':
        chunks.push(this.formatQRCode(section.content));
        break;
      
      case 'TABLE':
        chunks.push(this.formatTable(section.content));
        break;
    }

    // Réinitialiser le style si nécessaire
    if (section.style) {
      chunks.push(this.resetStyle());
    }

    // Nouvelle ligne
    chunks.push(Buffer.from([0x0A]));

    return Buffer.concat(chunks);
  }

  /**
   * Formate du texte simple
   */
  formatText(text: string, style?: any): Buffer {
    // Encoder le texte en UTF-8
    return Buffer.from(text, 'utf8');
  }

  /**
   * Formate un code-barres
   */
  formatBarcode(data: string, type: string): Buffer {
    const chunks: Buffer[] = [];

    // Configuration du code-barres
    chunks.push(ESCPOSFormatter.COMMANDS.BARCODE_HEIGHT);
    chunks.push(Buffer.from([100])); // Hauteur 100

    chunks.push(ESCPOSFormatter.COMMANDS.BARCODE_WIDTH);
    chunks.push(Buffer.from([2])); // Largeur 2

    chunks.push(ESCPOSFormatter.COMMANDS.BARCODE_TXT_BELOW); // Texte en dessous

    // Type de code-barres
    const barcodeType = this.getBarcodeType(type);
    
    // Commande d'impression : GS k m n data
    chunks.push(Buffer.from([0x1D, 0x6B, barcodeType, data.length]));
    chunks.push(Buffer.from(data, 'ascii'));

    return Buffer.concat(chunks);
  }

  /**
   * Formate un QR Code
   */
  formatQRCode(data: string): Buffer {
    const chunks: Buffer[] = [];

    // Model 2
    chunks.push(ESCPOSFormatter.COMMANDS.QR_CODE_MODEL);
    chunks.push(Buffer.from([0x32, 0x00]));

    // Taille (3 = 3x3 modules par dot)
    chunks.push(ESCPOSFormatter.COMMANDS.QR_CODE_SIZE);
    chunks.push(Buffer.from([0x06]));

    // Niveau de correction d'erreur (L = 48)
    chunks.push(ESCPOSFormatter.COMMANDS.QR_CODE_ERROR);
    chunks.push(Buffer.from([0x30]));

    // Stocker les données
    const dataBytes = Buffer.from(data, 'utf8');
    const pL = (dataBytes.length + 3) % 256;
    const pH = Math.floor((dataBytes.length + 3) / 256);

    chunks.push(Buffer.from([0x1D, 0x28, 0x6B, pL, pH, 0x31, 0x50, 0x30]));
    chunks.push(dataBytes);

    // Imprimer le QR Code
    chunks.push(Buffer.from([0x1D, 0x28, 0x6B, 0x03, 0x00, 0x31, 0x51, 0x30]));

    return Buffer.concat(chunks);
  }

  /**
   * Formate une ligne de séparation
   */
  private formatLine(char: string = '-'): Buffer {
    const width = this.getCharactersPerLine();
    const line = char.repeat(width);
    return Buffer.from(line, 'utf8');
  }

  /**
   * Formate un tableau
   */
  private formatTable(table: any): Buffer {
    const chunks: Buffer[] = [];
    const width = this.getCharactersPerLine();

    // En-têtes
    if (table.headers) {
      const headerLine = this.formatTableRow(table.headers, width, true);
      chunks.push(headerLine);
      chunks.push(this.formatLine('='));
    }

    // Lignes
    for (const row of table.rows) {
      chunks.push(this.formatTableRow(row, width, false));
    }

    return Buffer.concat(chunks);
  }

  /**
   * Formate une ligne de tableau
   */
  private formatTableRow(columns: string[], width: number, bold: boolean = false): Buffer {
    const chunks: Buffer[] = [];
    
    if (bold) {
      chunks.push(ESCPOSFormatter.COMMANDS.TXT_BOLD_ON);
    }

    const colWidth = Math.floor(width / columns.length);
    let row = '';

    for (let i = 0; i < columns.length; i++) {
      const col = columns[i] || '';
      if (i === columns.length - 1) {
        // Dernière colonne alignée à droite
        row += col.padStart(colWidth);
      } else {
        row += col.padEnd(colWidth);
      }
    }

    chunks.push(Buffer.from(row, 'utf8'));

    if (bold) {
      chunks.push(ESCPOSFormatter.COMMANDS.TXT_BOLD_OFF);
    }

    return Buffer.concat(chunks);
  }

  /**
   * Obtient la commande d'alignement
   */
  private getAlignmentCommand(alignment: 'LEFT' | 'CENTER' | 'RIGHT'): Buffer {
    switch (alignment) {
      case 'CENTER':
        return ESCPOSFormatter.COMMANDS.TXT_ALIGN_CT;
      case 'RIGHT':
        return ESCPOSFormatter.COMMANDS.TXT_ALIGN_RT;
      default:
        return ESCPOSFormatter.COMMANDS.TXT_ALIGN_LT;
    }
  }

  /**
   * Obtient les commandes de style
   */
  private getStyleCommands(style: any): Buffer {
    const chunks: Buffer[] = [];

    if (style.bold) {
      chunks.push(ESCPOSFormatter.COMMANDS.TXT_BOLD_ON);
    }

    if (style.underline) {
      chunks.push(ESCPOSFormatter.COMMANDS.TXT_UNDERLINE_ON);
    }

    if (style.inverted) {
      chunks.push(ESCPOSFormatter.COMMANDS.TXT_INVERT_ON);
    }

    if (style.fontSize) {
      chunks.push(this.getFontSizeCommand(style.fontSize));
    }

    return Buffer.concat(chunks);
  }

  /**
   * Obtient la commande de taille de police
   */
  private getFontSizeCommand(size: string): Buffer {
    switch (size) {
      case 'SMALL':
        return Buffer.from([0x1D, 0x21, 0x00]); // Normal mais peut être ajusté
      case 'LARGE':
        return ESCPOSFormatter.COMMANDS.TXT_SIZE_DOUBLE;
      case 'EXTRA_LARGE':
        return ESCPOSFormatter.COMMANDS.TXT_SIZE_TRIPLE;
      default:
        return ESCPOSFormatter.COMMANDS.TXT_SIZE_NORMAL;
    }
  }

  /**
   * Réinitialise le style
   */
  private resetStyle(): Buffer {
    return Buffer.concat([
      ESCPOSFormatter.COMMANDS.TXT_BOLD_OFF,
      ESCPOSFormatter.COMMANDS.TXT_UNDERLINE_OFF,
      ESCPOSFormatter.COMMANDS.TXT_INVERT_OFF,
      ESCPOSFormatter.COMMANDS.TXT_SIZE_NORMAL,
      ESCPOSFormatter.COMMANDS.TXT_ALIGN_LT
    ]);
  }

  /**
   * Obtient le type de code-barres ESC/POS
   */
  private getBarcodeType(type: string): number {
    const types: { [key: string]: number } = {
      'UPC-A': 0,
      'UPC-E': 1,
      'EAN13': 2,
      'EAN8': 3,
      'CODE39': 4,
      'ITF': 5,
      'CODABAR': 6,
      'CODE93': 72,
      'CODE128': 73
    };
    return types[type] || 73; // CODE128 par défaut
  }

  /**
   * Calcule le nombre de caractères par ligne
   */
  private getCharactersPerLine(): number {
    // Approximation basée sur la largeur du papier
    return this.paperWidth === 58 ? 32 : 48;
  }

  /**
   * Crée un reçu de paiement formaté
   */
  static createReceipt(data: any, config?: PrinterConfig): Buffer {
    const formatter = new ESCPOSFormatter(config);
    const width = config?.printSettings?.paperWidth === 58 ? 32 : 48;

    const document: FormattedDocument = {
      header: {
        type: 'TEXT',
        alignment: 'CENTER',
        style: { bold: true, fontSize: 'LARGE' },
        content: data.restaurantName || 'RESTAURANT'
      },
      body: [
        {
          type: 'TEXT',
          alignment: 'CENTER',
          content: data.address || ''
        },
        {
          type: 'TEXT',
          alignment: 'CENTER',
          content: data.phone || ''
        },
        {
          type: 'LINE',
          content: '='
        },
        {
          type: 'TEXT',
          content: `Commande #${data.orderId}`
        },
        {
          type: 'TEXT',
          content: `Table: ${data.tableName}`
        },
        {
          type: 'TEXT',
          content: `Date: ${new Date().toLocaleString()}`
        },
        {
          type: 'LINE',
          content: '-'
        },
        {
          type: 'TABLE',
          content: {
            headers: ['Article', 'Qté', 'Prix', 'Total'],
            rows: data.items.map((item: any) => [
              item.name.substring(0, 15),
              item.quantity.toString(),
              item.price.toFixed(2),
              (item.quantity * item.price).toFixed(2)
            ])
          }
        },
        {
          type: 'LINE',
          content: '-'
        },
        {
          type: 'TEXT',
          alignment: 'RIGHT',
          style: { bold: true },
          content: `TOTAL: ${data.total.toFixed(2)} ${data.currency}`
        },
        {
          type: 'TEXT',
          alignment: 'RIGHT',
          content: `Payé: ${data.paid.toFixed(2)} ${data.currency}`
        },
        {
          type: 'TEXT',
          alignment: 'RIGHT',
          content: `Monnaie: ${data.change.toFixed(2)} ${data.currency}`
        },
        {
          type: 'LINE',
          content: '='
        },
        {
          type: 'TEXT',
          alignment: 'CENTER',
          content: 'Merci de votre visite!'
        },
        {
          type: 'QRCODE',
          alignment: 'CENTER',
          content: `ORDER:${data.orderId}`
        }
      ],
      settings: {
        cutPaper: true,
        openCashDrawer: data.openDrawer || false,
        beep: true
      }
    };

    return formatter.format(document);
  }

  /**
   * Crée un ticket de cuisine formaté
   */
  static createKitchenTicket(data: any, config?: PrinterConfig): Buffer {
    const formatter = new ESCPOSFormatter(config);

    const document: FormattedDocument = {
      header: {
        type: 'TEXT',
        alignment: 'CENTER',
        style: { bold: true, fontSize: 'LARGE' },
        content: '*** CUISINE ***'
      },
      body: [
        {
          type: 'TEXT',
          style: { bold: true, fontSize: 'LARGE' },
          content: `Commande #${data.orderId}`
        },
        {
          type: 'TEXT',
          style: { bold: true },
          content: `Table: ${data.tableName}`
        },
        {
          type: 'TEXT',
          content: `Heure: ${new Date().toLocaleTimeString()}`
        },
        {
          type: 'LINE',
          content: '='
        },
        ...data.items.map((item: any) => ({
          type: 'TEXT' as const,
          style: { bold: true, fontSize: item.priority === 'URGENT' ? 'LARGE' : 'NORMAL' },
          content: `${item.quantity}x ${item.name}${item.notes ? '\n  Note: ' + item.notes : ''}`
        })),
        {
          type: 'LINE',
          content: '='
        },
        {
          type: 'TEXT',
          alignment: 'CENTER' as const,
          style: { inverted: true },
          content: ` ${data.items.length} article(s) `
        }
      ],
      settings: {
        cutPaper: true,
        beep: true
      }
    };

    return formatter.format(document);
  }
}