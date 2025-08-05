// src/theme/theme.ts
import { MD3LightTheme, MD3DarkTheme } from 'react-native-paper';

// Définition des couleurs principales pour le thème clair
const lightColors = {
  primary: '#4F46E5', // Indigo vif pour les éléments principaux
  accent: '#10B981', // Vert émeraude pour les actions secondaires
  background: '#F9FAFB', // Gris très clair pour l'arrière-plan
  surface: '#FFFFFF', // Surfaces (cartes, feuilles)
  text: '#111827', // Texte principal presque noir
  error: '#EF4444', // Rouge moderne pour les erreurs
  warning: '#F59E0B', // Orange/ambre pour les avertissements
  success: '#10B981', // Vert pour les succès
  disabled: '#9CA3AF', // Gris pour les éléments désactivés
  placeholder: '#9CA3AF', // Couleur du texte placeholder
  backdrop: 'rgba(17, 24, 39, 0.5)', // Arrière-plan modal assombri
};

// Palette de couleurs pour le thème sombre
const darkColors = {
  primary: '#818CF8', // Indigo clair pour contraste sur fond sombre
  accent: '#34D399', // Vert émeraude lumineux
  background: '#1F2937', // Gris foncé pour l'arrière-plan
  surface: '#111827', // Surfaces sombres
  text: '#F9FAFB', // Texte clair
  error: '#F87171', // Rouge plus clair
  warning: '#FBBF24', // Jaune ambré
  success: '#34D399', // Vert pour les succès
  disabled: '#6B7280', // Gris pour les éléments désactivés
  placeholder: '#9CA3AF',
  backdrop: 'rgba(0, 0, 0, 0.5)',
};

// Thème clair
export const lightTheme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    ...lightColors,
  },
  roundness: 12,
  animation: { scale: 1.0 },
};

// Thème sombre
export const darkTheme = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    ...darkColors,
  },
  roundness: 12,
  animation: { scale: 1.0 },
};

// Types pour utiliser le thème dans l'application
export type AppTheme = typeof lightTheme;

// Export par défaut pour compatibilité
export const theme = lightTheme;
