// src/utils/navigationHelper.ts
import { NavigationProp } from '@react-navigation/native';
import env from '../config/environment';
import { RolesUtils, Role } from "./roles";

/**
 * Helper pour naviguer vers des routes conditionnelles de manière sûre
 */
export class NavigationHelper {
  /**
   * Vérifie si on est en mode développement
   */
  static isDevelopment(): boolean {
    return env.environment === 'development' || __DEV__;
  }

  /**
   * Navigation sécurisée vers l'écran de debug
   */
  static navigateToDebug(navigation: NavigationProp<any>): void {
    if (this.isDevelopment()) {
      navigation.navigate('SocketIODebug' as never);
    } else {
      console.warn('Debug screen is not available in production mode');
    }
  }

  /**
   * Vérifie si une route existe avant de naviguer
   */
  static safeNavigate(
    navigation: NavigationProp<any>, 
    routeName: string, 
    params?: any
  ): void {
    try {
      // Vérifier si la route existe
      const state = navigation.getState();
      const routeExists = state.routeNames.includes(routeName);
      
      if (routeExists) {
        navigation.navigate(routeName as never, params);
      } else {
        console.warn(`Route "${routeName}" does not exist in current navigator`);
      }
    } catch (error) {
      console.error('Navigation error:', error);
    }
  }

  /**
   * Obtenir la liste des routes disponibles
   */
  static getAvailableRoutes(navigation: NavigationProp<any>): string[] {
    try {
      const state = navigation.getState();
      return state.routeNames || [];
    } catch {
      return [];
    }
  }

  /**
   * Détermine l'écran d'accueil contextuel selon les rôles de l'utilisateur
   * @param userRoles Liste des rôles de l'utilisateur
   * @returns Nom de l'écran d'accueil contextuel
   */
  static getContextualHomeScreen(userRoles: string[] | undefined): string {
    if (!userRoles || userRoles.length === 0) return "ServerHome";

    // Priorité des rôles pour la redirection contextuelle
    if (RolesUtils.hasRole(userRoles, Role.MANAGER)) {
      return "ManagerHome";
    } else if (RolesUtils.hasRole(userRoles, Role.CASHIER)) {
      return "CashierHome";  // ← Caissier va vers CashierHome
    } else if (RolesUtils.hasRole(userRoles, Role.SERVER)) {
      return "ServerHome";
    } else if (RolesUtils.hasRole(userRoles, Role.COOK)) {
      return "KitchenHome";
    } else if (RolesUtils.hasRole(userRoles, Role.ADMIN)) {
      return "ProfilHome";
    } else {
      return "ServerHome";
    }
  }

  /**
   * Navigue vers l'écran d'accueil contextuel selon le rôle
   * @param navigation Objet de navigation React Navigation
   * @param userRoles Liste des rôles de l'utilisateur
   */
  static navigateToContextualHome(navigation: NavigationProp<any>, userRoles: string[] | undefined): void {
    const homeScreen = this.getContextualHomeScreen(userRoles);
    this.safeNavigate(navigation, homeScreen);
  }

  /**
   * Vérifie si l'utilisateur est un caissier
   * @param userRoles Liste des rôles de l'utilisateur
   * @returns true si l'utilisateur a le rôle CASHIER
   */
  static isCashier(userRoles: string[] | undefined): boolean {
    return RolesUtils.hasRole(userRoles, Role.CASHIER);
  }

  /**
   * Vérifie si l'utilisateur est un serveur
   * @param userRoles Liste des rôles de l'utilisateur
   * @returns true si l'utilisateur a le rôle SERVER
   */
  static isServer(userRoles: string[] | undefined): boolean {
    return RolesUtils.hasRole(userRoles, Role.SERVER);
  }

  /**
   * Vérifie si l'utilisateur est un manager
   * @param userRoles Liste des rôles de l'utilisateur
   * @returns true si l'utilisateur a le rôle MANAGER
   */
  static isManager(userRoles: string[] | undefined): boolean {
    return RolesUtils.hasRole(userRoles, Role.MANAGER);
  }
}