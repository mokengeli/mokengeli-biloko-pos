// src/theme/theme.ts
import { MD3LightTheme, MD3DarkTheme } from "react-native-paper";

// Définition des couleurs principales de l'application pour le mode clair
const lightColors = {
  primary: "#0066CC", // Bleu principal
  accent: "#FF9500", // Orange accent
  background: "#F5F5F5", // Fond clair
  surface: "#FFFFFF", // Surface des cartes et éléments
  text: "#212121", // Texte principal
  error: "#D32F2F", // Rouge pour les erreurs
  warning: "#FFA500", // Orange pour les avertissements
  success: "#4CAF50", // Vert pour les succès
  disabled: "#9E9E9E", // Gris pour les éléments désactivés
  placeholder: "#9E9E9E", // Texte placeholder
  backdrop: "rgba(0, 0, 0, 0.5)", // Arrière-plan modal
};

// Définition des couleurs principales pour le mode sombre
const darkColors = {
  primary: "#0066CC",
  accent: "#FF9500",
  background: "#121212", // Fond sombre
  surface: "#1E1E1E", // Surface sombre
  text: "#FFFFFF", // Texte principal
  error: "#CF6679", // Rouge pour les erreurs en mode sombre
  warning: "#FFA500",
  success: "#4CAF50",
  disabled: "#9E9E9E",
  placeholder: "#9E9E9E",
  backdrop: "rgba(0, 0, 0, 0.5)",
};

// Création des thèmes personnalisés
export const lightTheme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    ...lightColors,
  },
  roundness: 8,
  animation: {
    scale: 1.0,
  },
};

export const darkTheme = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    ...darkColors,
  },
  roundness: 8,
  animation: {
    scale: 1.0,
  },
};

// Types pour utiliser le thème dans l'application
export type AppTheme = typeof lightTheme;