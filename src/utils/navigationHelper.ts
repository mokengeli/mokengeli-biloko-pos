// src/utils/navigationHelper.ts
import { NavigationProp } from '@react-navigation/native';
import env from '../config/environment';

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
}