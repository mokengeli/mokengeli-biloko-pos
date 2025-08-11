// App.tsx
import React, { useEffect } from 'react';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { Provider as PaperProvider } from 'react-native-paper';
import { StatusBar } from 'expo-status-bar';
import { AuthProvider } from './src/contexts/AuthContext';
import { CartProvider } from './src/contexts/CartContext';
import { AppNavigator } from './src/navigation/AppNavigator';
import { theme } from './src/theme/theme';
import { testConnection } from './src/api/apiConfig';
import { PrintersProvider } from './src/contexts/PrintersContext';

export default function App() {
  useEffect(() => {
  testConnection().then(connected => {
    console.log('API connection status:', connected);
  });
}, []);
  return (
    <SafeAreaProvider>
      <PaperProvider theme={theme}>
        <StatusBar style="auto" />
        <AuthProvider>
          <CartProvider>
            <PrintersProvider>
              <AppNavigator />
            </PrintersProvider>
          </CartProvider>
        </AuthProvider>
      </PaperProvider>
    </SafeAreaProvider>
  );
}