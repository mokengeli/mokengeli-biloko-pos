// src/components/common/SnackbarContainer.tsx
import React from 'react';
import { View, StyleSheet, Platform } from 'react-native';
import { Portal } from 'react-native-paper';

interface SnackbarContainerProps {
  children: React.ReactNode;
  bottomOffset?: number; // Décalage par rapport au bas de l'écran
}

/**
 * Conteneur spécialisé pour les Snackbars qui garantit un affichage cohérent
 * sur iOS et Android, même en présence d'un footer fixe ou de SafeAreaView.
 *
 * @param children Le Snackbar à afficher
 * @param bottomOffset Décalage par rapport au bas de l'écran (pour éviter le footer par exemple)
 */
export const SnackbarContainer: React.FC<SnackbarContainerProps> = ({ 
  children, 
  bottomOffset = 70 // Valeur par défaut à ajuster selon la hauteur de votre footer
}) => {
  return (
    <Portal>
      <View style={[
        styles.container,
        { bottom: bottomOffset }
      ]}>
        {children}
      </View>
    </Portal>
  );
};

const styles = StyleSheet.create({
  container: {
    position: 'absolute',
    left: 8,
    right: 8,
    zIndex: 1000,
    // Spécifique à Android pour garantir que le Snackbar reste visible
    ...Platform.select({
      android: {
        elevation: 10, // S'assure que le conteneur est au-dessus des autres éléments
      },
    }),
  },
});

export default SnackbarContainer;