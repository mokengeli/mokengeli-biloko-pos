// src/theme/theme.ts
import { DefaultTheme } from 'react-native-paper';

// Définition des couleurs principales de l'application
// Palette inspirée des tendances modernes (bleu/indigo + gris clair)
const colors = {
  primary: '#4F46E5',        // Indigo vif pour les éléments principaux
  accent: '#10B981',         // Vert émeraude pour les actions secondaires
  background: '#F9FAFB',     // Gris très clair pour l'arrière-plan
  surface: '#FFFFFF',        // Surfaces (cartes, feuilles)
  text: '#111827',           // Texte principal presque noir
  error: '#EF4444',          // Rouge moderne pour les erreurs
  warning: '#F59E0B',        // Orange/ambre pour les avertissements
  success: '#10B981',        // Vert pour les succès
  disabled: '#9CA3AF',       // Gris pour les éléments désactivés
  placeholder: '#9CA3AF',    // Couleur du texte placeholder
  backdrop: 'rgba(17, 24, 39, 0.5)', // Arrière-plan modal assombri
};

// Création du thème personnalisé
export const theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    ...colors,
  },
  // Bords légèrement plus arrondis pour un rendu plus moderne
  roundness: 12,
  animation: {
    scale: 1.0,
  },
};

// Types pour utiliser le thème dans l'application
export type AppTheme = typeof theme;
