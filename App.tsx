// App.tsx
import React from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Provider as PaperProvider } from 'react-native-paper';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from './src/contexts/AuthContext';
import { CartProvider } from './src/contexts/CartContext';
import { AppNavigator } from './src/navigation/AppNavigator';
import { theme } from './src/theme/theme';

export default function App() {
  return (
    <SafeAreaProvider>
      <PaperProvider theme={theme}>
        <StatusBar style="auto" />
        <AuthProvider>
          <CartProvider>
            <AppNavigator />
          </CartProvider>
        </AuthProvider>
      </PaperProvider>
    </SafeAreaProvider>
  );
}