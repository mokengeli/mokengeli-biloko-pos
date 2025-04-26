// src/navigation/AppNavigator.tsx
import React from 'react';
import { NavigationContainer } from '@react-navigation/native';
import { createStackNavigator } from '@react-navigation/stack';

import { LoginScreen } from '../screens/LoginScreen';
import { ServerHomeScreen } from '../screens/server/ServerHomeScreen';
import { CreateOrderScreen } from '../screens/server/CreateOrderScreen';
import { DishCustomizationScreen } from '../screens/server/DishCustomizationScreen';
import { HomeScreen } from '../screens/HomeScreen'; // Conservé pour KitchenHome et AdminHome temporaires
import { useAuth } from '../contexts/AuthContext';
import { ActivityIndicator, View, StyleSheet, Text } from 'react-native';
import { DishCustomizationParamList } from '../screens/server/DishCustomizationScreen';
import { KitchenHomeScreen } from '../screens/kitchen/KitchenHomeScreen';
import { RolesUtils } from '../utils/roles';

// Types des paramètres pour les routes d'authentification
export type AuthStackParamList = {
  Login: undefined;
};

// Types des paramètres pour les routes principales
export type MainStackParamList = {
  ServerHome: undefined;
  KitchenHome: undefined; // À implémenter plus tard
  AdminHome: undefined;   // À implémenter plus tard
  CreateOrder: {
    tableId: number;
    tableName: string;
  };
  DishCustomization: DishCustomizationParamList['DishCustomization'];
};

// Créer les navigateurs
const AuthStack = createStackNavigator<AuthStackParamList>();
const MainStack = createStackNavigator<MainStackParamList>();

// Composant pour les routes d'authentification
const AuthNavigator = () => {
  return (
    <AuthStack.Navigator
      screenOptions={{
        headerShown: false,
        cardStyle: { backgroundColor: '#f5f5f5' },
      }}
    >
      <AuthStack.Screen name="Login" component={LoginScreen} />
    </AuthStack.Navigator>
  );
};

// Composant pour les routes principales (authentifiées)
const MainNavigator: React.FC = () => {
  const { user } = useAuth();
  
  // Déterminer l'écran initial en fonction du rôle de l'utilisateur
  const getInitialRouteName = () => {
    if (!user) {
      return 'ServerHome'; // Écran par défaut si pas d'utilisateur
    }
    
    // Utiliser la méthode existante dans RolesUtils
    return RolesUtils.getHomeScreenForRoles(user.roles);
  };
  
  // Déterminer l'écran initial
  const initialRoute = getInitialRouteName();

  return (
    <MainStack.Navigator
  initialRouteName={initialRoute}
  screenOptions={{
    headerShown: false,
    cardStyle: { backgroundColor: '#f5f5f5' },
  }}
>
  <MainStack.Screen name="ServerHome" component={ServerHomeScreen} />
  <MainStack.Screen name="CreateOrder" component={CreateOrderScreen} />
  <MainStack.Screen name="DishCustomization" component={DishCustomizationScreen} />
  {/* Utiliser le vrai écran de cuisine au lieu du placeholder */}
  <MainStack.Screen name="KitchenHome" component={KitchenHomeScreen} />
  {/* L'écran AdminHome reste un placeholder pour l'instant */}
  <MainStack.Screen name="AdminHome" component={HomeScreen} />
</MainStack.Navigator>
  );
};

// Composant de navigation principale
export const AppNavigator: React.FC = () => {
  const { user, isLoading } = useAuth();

  // Afficher un indicateur de chargement pendant la vérification de l'authentification
  if (isLoading) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color="#0066CC" />
        <Text style={styles.loadingText}>Chargement...</Text>
      </View>
    );
  }

  return (
    <NavigationContainer>
      {user ? <MainNavigator /> : <AuthNavigator />}
    </NavigationContainer>
  );
};

const styles = StyleSheet.create({
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: '#f5f5f5',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    color: '#0066CC',
  },
});