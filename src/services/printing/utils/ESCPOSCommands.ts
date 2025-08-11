// src/services/printing/utils/ESCPOSCommands.ts

/**
 * Classe utilitaire pour générer les commandes ESC/POS
 * Compatible avec la plupart des imprimantes thermiques
 */
export class ESCPOSCommands {
  // Commandes de base
  static readonly ESC = 0x1B;
  static readonly GS = 0x1D;
  static readonly DLE = 0x10;
  static readonly EOT = 0x04;
  static readonly ENQ = 0x05;
  static readonly SP = 0x20;
  static readonly NL = 0x0A;
  static readonly CR = 0x0D;
  static readonly FF = 0x0C;
  static readonly TAB = 0x09;

  // Initialisation
  static INIT = Buffer.from([ESCPOSCommands.ESC, 0x40]); // ESC @

  // Alignement du texte
  static LEFT_ALIGN = Buffer.from([ESCPOSCommands.ESC, 0x61, 0x00]); // ESC a 0
  static CENTER_ALIGN = Buffer.from([ESCPOSCommands.ESC, 0x61, 0x01]); // ESC a 1
  static RIGHT_ALIGN = Buffer.from([ESCPOSCommands.ESC, 0x61, 0x02]); // ESC a 2

  // Styles de texte
  static BOLD_ON = Buffer.from([ESCPOSCommands.ESC, 0x45, 0x01]); // ESC E 1
  static BOLD_OFF = Buffer.from([ESCPOSCommands.ESC, 0x45, 0x00]); // ESC E 0
  static UNDERLINE_ON = Buffer.from([ESCPOSCommands.ESC, 0x2D, 0x01]); // ESC - 1
  static UNDERLINE_OFF = Buffer.from([ESCPOSCommands.ESC, 0x2D, 0x00]); // ESC - 0
  static ITALIC_ON = Buffer.from([ESCPOSCommands.ESC, 0x34, 0x01]); // ESC 4 1
  static ITALIC_OFF = Buffer.from([ESCPOSCommands.ESC, 0x34, 0x00]); // ESC 4 0

  // Taille du texte
  static NORMAL_SIZE = Buffer.from([ESCPOSCommands.GS, 0x21, 0x00]); // GS ! 0
  static DOUBLE_HEIGHT = Buffer.from([ESCPOSCommands.GS, 0x21, 0x01]); // GS ! 1
  static DOUBLE_WIDTH = Buffer.from([ESCPOSCommands.GS, 0x21, 0x10]); // GS ! 16
  static DOUBLE_SIZE = Buffer.from([ESCPOSCommands.GS, 0x21, 0x11]); // GS ! 17

  // Coupe du papier
  static FULL_CUT = Buffer.from([ESCPOSCommands.GS, 0x56, 0x00]); // GS V 0
  static PARTIAL_CUT = Buffer.from([ESCPOSCommands.GS, 0x56, 0x01]); // GS V 1

  // Tiroir-caisse
  static CASH_DRAWER_1 = Buffer.from([ESCPOSCommands.ESC, 0x70, 0x00, 0x19, 0xFA]); // ESC p 0
  static CASH_DRAWER_2 = Buffer.from([ESCPOSCommands.ESC, 0x70, 0x01, 0x19, 0xFA]); // ESC p 1

  // Beep
  static BEEP = Buffer.from([ESCPOSCommands.ESC, 0x42, 0x01, 0x01]); // ESC B n t

  // Saut de ligne
  static LINE_FEED = Buffer.from([ESCPOSCommands.NL]);
  static CARRIAGE_RETURN = Buffer.from([ESCPOSCommands.CR]);
  static NEW_LINE = Buffer.from([ESCPOSCommands.CR, ESCPOSCommands.NL]);

  // Espacement des lignes
  static LINE_SPACING_DEFAULT = Buffer.from([ESCPOSCommands.ESC, 0x32]); // ESC 2
  static LINE_SPACING = (n: number) => Buffer.from([ESCPOSCommands.ESC, 0x33, n]); // ESC 3 n

  // Encodage des caractères
  static CHARSET_UTF8 = Buffer.from([ESCPOSCommands.ESC, 0x74, 0x0F]); // ESC t 15
  static CHARSET_CP437 = Buffer.from([ESCPOSCommands.ESC, 0x74, 0x00]); // ESC t 0
  static CHARSET_CP850 = Buffer.from([ESCPOSCommands.ESC, 0x74, 0x02]); // ESC t 2

  /**
   * Créer une ligne de séparation
   */
  static separator(width: number = 32, char: string = '-'): Buffer {
    return Buffer.from(char.repeat(width) + '\n');
  }

  /**
   * Centrer du texte
   */
  static centerText(text: string, width: number = 32): string {
    const padding = Math.max(0, Math.floor((width - text.length) / 2));
    return ' '.repeat(padding) + text;
  }

  /**
   * Aligner du texte à droite
   */
  static rightAlign(text: string, width: number = 32): string {
    const padding = Math.max(0, width - text.length);
    return ' '.repeat(padding) + text;
  }

  /**
   * Créer une ligne avec texte à gauche et à droite
   */
  static leftRight(left: string, right: string, width: number = 32): string {
    const space = Math.max(1, width - left.length - right.length);
    return left + ' '.repeat(space) + right;
  }

  /**
   * Formatter un tableau en colonnes
   */
  static columns(items: string[], widths: number[]): string {
    let result = '';
    items.forEach((item, index) => {
      const width = widths[index] || 10;
      result += item.substring(0, width).padEnd(width, ' ');
    });
    return result;
  }

  /**
   * Convertir du texte en buffer avec encodage
   */
  static textToBuffer(text: string, charset: string = 'utf8'): Buffer {
    // Remplacer les caractères spéciaux français si nécessaire
    if (charset === 'cp437' || charset === 'ascii') {
      text = this.replaceSpecialChars(text);
    }
    return Buffer.from(text, charset as BufferEncoding);
  }

  /**
   * Remplacer les caractères spéciaux pour l'ASCII
   */
  private static replaceSpecialChars(text: string): string {
    const replacements: { [key: string]: string } = {
      'é': 'e', 'è': 'e', 'ê': 'e', 'ë': 'e',
      'à': 'a', 'â': 'a', 'ä': 'a',
      'ô': 'o', 'ö': 'o',
      'ù': 'u', 'û': 'u', 'ü': 'u',
      'ç': 'c',
      'É': 'E', 'È': 'E', 'Ê': 'E', 'Ë': 'E',
      'À': 'A', 'Â': 'A', 'Ä': 'A',
      'Ô': 'O', 'Ö': 'O',
      'Ù': 'U', 'Û': 'U', 'Ü': 'U',
      'Ç': 'C',
      '€': 'EUR',
      '°': 'o',
      '²': '2',
      '³': '3'
    };

    for (const [char, replacement] of Object.entries(replacements)) {
      text = text.replace(new RegExp(char, 'g'), replacement);
    }

    return text;
  }

  /**
   * Créer un builder pour construire une séquence de commandes
   */
  static createBuilder(paperWidth: number = 32): CommandBuilder {
    return new CommandBuilder(paperWidth);
  }
}

/**
 * Builder pour construire une séquence de commandes ESC/POS
 */
export class CommandBuilder {
  private commands: Buffer[] = [];
  private paperWidth: number;
  private charset: string = 'utf8';

  constructor(paperWidth: number = 32) {
    this.paperWidth = paperWidth;
    this.init();
  }

  /**
   * Initialiser l'imprimante
   */
  init(): this {
    this.commands.push(ESCPOSCommands.INIT);
    return this;
  }

  /**
   * Définir l'encodage
   */
  setCharset(charset: 'utf8' | 'cp437' | 'cp850'): this {
    this.charset = charset;
    switch (charset) {
      case 'utf8':
        this.commands.push(ESCPOSCommands.CHARSET_UTF8);
        break;
      case 'cp437':
        this.commands.push(ESCPOSCommands.CHARSET_CP437);
        break;
      case 'cp850':
        this.commands.push(ESCPOSCommands.CHARSET_CP850);
        break;
    }
    return this;
  }

  /**
   * Ajouter du texte
   */
  text(text: string): this {
    this.commands.push(ESCPOSCommands.textToBuffer(text, this.charset));
    return this;
  }

  /**
   * Ajouter une ligne de texte
   */
  line(text: string = ''): this {
    this.text(text);
    this.newLine();
    return this;
  }

  /**
   * Nouvelle ligne
   */
  newLine(count: number = 1): this {
    for (let i = 0; i < count; i++) {
      this.commands.push(ESCPOSCommands.NEW_LINE);
    }
    return this;
  }

  /**
   * Alignement
   */
  align(alignment: 'left' | 'center' | 'right'): this {
    switch (alignment) {
      case 'left':
        this.commands.push(ESCPOSCommands.LEFT_ALIGN);
        break;
      case 'center':
        this.commands.push(ESCPOSCommands.CENTER_ALIGN);
        break;
      case 'right':
        this.commands.push(ESCPOSCommands.RIGHT_ALIGN);
        break;
    }
    return this;
  }

  /**
   * Texte en gras
   */
  bold(enabled: boolean = true): this {
    this.commands.push(enabled ? ESCPOSCommands.BOLD_ON : ESCPOSCommands.BOLD_OFF);
    return this;
  }

  /**
   * Texte souligné
   */
  underline(enabled: boolean = true): this {
    this.commands.push(enabled ? ESCPOSCommands.UNDERLINE_ON : ESCPOSCommands.UNDERLINE_OFF);
    return this;
  }

  /**
   * Taille du texte
   */
  size(size: 'normal' | 'double-height' | 'double-width' | 'double'): this {
    switch (size) {
      case 'normal':
        this.commands.push(ESCPOSCommands.NORMAL_SIZE);
        break;
      case 'double-height':
        this.commands.push(ESCPOSCommands.DOUBLE_HEIGHT);
        break;
      case 'double-width':
        this.commands.push(ESCPOSCommands.DOUBLE_WIDTH);
        break;
      case 'double':
        this.commands.push(ESCPOSCommands.DOUBLE_SIZE);
        break;
    }
    return this;
  }

  /**
   * Ligne de séparation
   */
  separator(char: string = '-'): this {
    this.commands.push(ESCPOSCommands.separator(this.paperWidth, char));
    return this;
  }

  /**
   * Texte centré
   */
  centerText(text: string): this {
    const centered = ESCPOSCommands.centerText(text, this.paperWidth);
    this.line(centered);
    return this;
  }

  /**
   * Ligne avec texte à gauche et à droite
   */
  leftRight(left: string, right: string): this {
    const line = ESCPOSCommands.leftRight(left, right, this.paperWidth);
    this.line(line);
    return this;
  }

  /**
   * Tableau en colonnes
   */
  columns(items: string[], widths?: number[]): this {
    const defaultWidth = Math.floor(this.paperWidth / items.length);
    const columnWidths = widths || items.map(() => defaultWidth);
    const line = ESCPOSCommands.columns(items, columnWidths);
    this.line(line);
    return this;
  }

  /**
   * Couper le papier
   */
  cut(partial: boolean = false): this {
    this.newLine(3); // Quelques lignes avant de couper
    this.commands.push(partial ? ESCPOSCommands.PARTIAL_CUT : ESCPOSCommands.FULL_CUT);
    return this;
  }

  /**
   * Ouvrir le tiroir-caisse
   */
  openCashDrawer(drawer: 1 | 2 = 1): this {
    this.commands.push(drawer === 1 ? ESCPOSCommands.CASH_DRAWER_1 : ESCPOSCommands.CASH_DRAWER_2);
    return this;
  }

  /**
   * Émettre un beep
   */
  beep(): this {
    this.commands.push(ESCPOSCommands.BEEP);
    return this;
  }

  /**
   * Obtenir le buffer complet
   */
  build(): Buffer {
    return Buffer.concat(this.commands);
  }

  /**
   * Réinitialiser le builder
   */
  reset(): this {
    this.commands = [];
    return this.init();
  }
}