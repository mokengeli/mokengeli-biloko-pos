// src/theme/theme.ts
import { DefaultTheme } from 'react-native-paper';

// Définition des couleurs principales de l'application
const colors = {
  primary: '#0066CC',       // Bleu principal
  accent: '#FF9500',        // Orange accent
  background: '#F5F5F5',    // Fond clair
  surface: '#FFFFFF',       // Surface des cartes et éléments
  text: '#212121',          // Texte principal
  error: '#D32F2F',         // Rouge pour les erreurs
  warning: '#FFA500',       // Orange pour les avertissements
  success: '#4CAF50',       // Vert pour les succès
  disabled: '#9E9E9E',      // Gris pour les éléments désactivés
  placeholder: '#9E9E9E',   // Texte placeholder
  backdrop: 'rgba(0, 0, 0, 0.5)', // Arrière-plan modal
};

// Création du thème personnalisé
export const theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    ...colors,
  },
  roundness: 8,
  animation: {
    scale: 1.0,
  },
};

// Types pour utiliser le thème dans l'application
export type AppTheme = typeof theme;