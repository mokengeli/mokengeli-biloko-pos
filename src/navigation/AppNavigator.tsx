// src/navigation/AppNavigator.tsx
import React from "react";
import { NavigationContainer } from "@react-navigation/native";
import { createStackNavigator } from "@react-navigation/stack";

import { LoginScreen } from "../screens/LoginScreen";
import { ServerHomeScreen } from "../screens/server/ServerHomeScreen";
import { CreateOrderScreen } from "../screens/server/CreateOrderScreen";
import { DishCustomizationScreen } from "../screens/server/DishCustomizationScreen";
import { ReadyDishesScreen } from "../screens/server/ReadyDishesScreen";
import { ProfilScreen } from "../screens/ProfilScreen";
import { DishCustomizationParamList } from "../screens/server/DishCustomizationScreen";
import { KitchenHomeScreen } from "../screens/kitchen/KitchenHomeScreen";
import { RolesUtils } from "../utils/roles";
import { PrepareBillScreen } from "../screens/server/PrepareBillScreen";
import { PaymentScreen } from "../screens/server/PaymentScreen";
import { DomainOrderItem } from "../api/orderService";
import { ManagerHomeScreen } from "../screens/manager/ManagerHomeScreen";
import { CloseWithDebtScreen } from "../screens/server/CloseWithDebtScreen";
import { PendingValidationsScreen } from "../screens/manager/PendingValidationsScreen";
import { useAuth } from "../contexts/AuthContext";
import { ActivityIndicator, View, StyleSheet, Text } from "react-native";
import { useTheme } from "react-native-paper";


// Types des paramètres pour les routes d'authentification
export type AuthStackParamList = {
  Login: undefined;
};

// Types des paramètres pour les routes principales
// Types des paramètres pour les routes principales
export type MainStackParamList = {
  ServerHome: undefined;
  KitchenHome: undefined;
  ProfilHome: undefined;
  ManagerHome: undefined;
  CreateOrder: {
    tableId: number;
    tableName: string;
  };
  DishCustomization: DishCustomizationParamList["DishCustomization"];
  ReadyDishes: {
    tableId?: string;
    tableName?: string;
  };
  PrepareBill: {
    orderId: number;
    tableId?: string;
    tableName?: string;
  };
  PaymentScreen: {
    orderId: number;
    tableName?: string;
    tableId: number;
    selectedItems?: DomainOrderItem[];
    totalAmount: number;
    paidAmount: number;
    remainingAmount: number;
    currency: string;
    paymentMode: "items" | "amount";
    customAmount?: number;
  };
  CloseWithDebt: {
    orderId: number;
    tableName: string;
    tableId: number;
    remainingAmount: number;
    currency: string;
  };
  PendingValidations: undefined;
  SplitBill: {
    orderId: number;
    tableName?: string;
    billItems: any[];
    totalAmount: number;
    splitType: "perPerson" | "custom";
    numberOfPeople: number;
    currency: string;
  };
};

// Créer les navigateurs
const AuthStack = createStackNavigator<AuthStackParamList>();
const MainStack = createStackNavigator<MainStackParamList>();

// Composant pour les routes d'authentification
const AuthNavigator = () => {
  const theme = useTheme();
  return (
    <AuthStack.Navigator
      screenOptions={{
        headerShown: false,
        cardStyle: { backgroundColor: theme.colors.background },
      }}
    >
      <AuthStack.Screen name="Login" component={LoginScreen} />
    </AuthStack.Navigator>
  );
};

// Composant pour les routes principales (authentifiées)
const MainNavigator: React.FC = () => {
  const { user } = useAuth();
  const theme = useTheme();

  // Déterminer l'écran initial en fonction du rôle de l'utilisateur
  const getInitialRouteName = () => {
    if (!user) {
      return "ServerHome"; // Écran par défaut si pas d'utilisateur
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
        cardStyle: { backgroundColor: theme.colors.background },
      }}
    >
      <MainStack.Screen name="ServerHome" component={ServerHomeScreen} />
      <MainStack.Screen name="CreateOrder" component={CreateOrderScreen} />
      <MainStack.Screen
        name="DishCustomization"
        component={DishCustomizationScreen}
      />
      <MainStack.Screen name="ReadyDishes" component={ReadyDishesScreen} />
      <MainStack.Screen name="KitchenHome" component={KitchenHomeScreen} />
      <MainStack.Screen name="ProfilHome" component={ProfilScreen} />
      <MainStack.Screen name="ManagerHome" component={ManagerHomeScreen} />

      {/* Écrans de paiement */}
      <MainStack.Screen name="PrepareBill" component={PrepareBillScreen} />
      <MainStack.Screen name="PaymentScreen" component={PaymentScreen} />
      <MainStack.Screen name="CloseWithDebt" component={CloseWithDebtScreen} />
      <MainStack.Screen name="PendingValidations" component={PendingValidationsScreen} />
    </MainStack.Navigator>
  );
};

// Composant de navigation principale
export const AppNavigator: React.FC = () => {
  const { user, isLoading } = useAuth();
  const theme = useTheme();

  // Afficher un indicateur de chargement pendant la vérification de l'authentification
  if (isLoading) {
    return (
      <View
        style={[styles.loadingContainer, { backgroundColor: theme.colors.background }]}
      >
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={[styles.loadingText, { color: theme.colors.primary }]}>Chargement...</Text>
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
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
  },
});
