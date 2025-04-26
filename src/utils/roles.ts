// src/utils/roles.ts

/**
 * Énumération des rôles disponibles dans l'application
 */
export enum Role {
    ADMIN = 'ROLE_ADMIN',
    USER = 'ROLE_USER',
    MANAGER = 'ROLE_MANAGER',
    SERVER = 'ROLE_SERVER',
    COOK = 'ROLE_COOK'
  }
  
  /**
   * Description des rôles pour l'affichage
   */
  export const RoleDescription: Record<Role, string> = {
    [Role.ADMIN]: 'Administrateur du système',
    [Role.USER]: 'Utilisateur standard',
    [Role.MANAGER]: 'Responsable du lounge/restaurant',
    [Role.SERVER]: 'Serveur dans le lounge/restaurant',
    [Role.COOK]: 'Cuisinier dans le lounge/restaurant'
  };
  
  /**
   * Classe utilitaire pour gérer les rôles
   */
  export class RolesUtils {
    /**
     * Vérifie si l'utilisateur a un rôle spécifique
     * @param userRoles Liste des rôles de l'utilisateur
     * @param role Rôle à vérifier
     * @returns true si l'utilisateur a le rôle spécifié
     */
    static hasRole(userRoles: string[] | undefined, role: Role): boolean {
      if (!userRoles || userRoles.length === 0) return false;
      return userRoles.includes(role);
    }
  
    /**
     * Vérifie si l'utilisateur a au moins un des rôles spécifiés
     * @param userRoles Liste des rôles de l'utilisateur
     * @param roles Liste des rôles à vérifier
     * @returns true si l'utilisateur a au moins un des rôles spécifiés
     */
    static hasAnyRole(userRoles: string[] | undefined, roles: Role[]): boolean {
      if (!userRoles || userRoles.length === 0) return false;
      return roles.some(role => userRoles.includes(role));
    }
  
    /**
     * Vérifie si l'utilisateur a tous les rôles spécifiés
     * @param userRoles Liste des rôles de l'utilisateur
     * @param roles Liste des rôles à vérifier
     * @returns true si l'utilisateur a tous les rôles spécifiés
     */
    static hasAllRoles(userRoles: string[] | undefined, roles: Role[]): boolean {
      if (!userRoles || userRoles.length === 0) return false;
      return roles.every(role => userRoles.includes(role));
    }
  
    /**
     * Obtient la description d'un rôle pour l'affichage
     * @param role Rôle dont on veut la description
     * @returns Description du rôle
     */
    static getRoleDescription(role: string): string {
      return Object.values(Role).includes(role as Role) 
        ? RoleDescription[role as Role] 
        : 'Rôle inconnu';
    }
  
  /**
   * Détermine l'écran d'accueil approprié en fonction des rôles de l'utilisateur
   * @param userRoles Liste des rôles de l'utilisateur
   * @returns Nom de l'écran d'accueil approprié
   */
  static getHomeScreenForRoles(userRoles: string[] | undefined): string {
  
    if (!userRoles || userRoles.length === 0) return 'ServerHome';

    if (this.hasRole(userRoles, Role.SERVER)) {
      return 'ServerHome';
    } else if (this.hasRole(userRoles, Role.COOK)) {
      return 'KitchenHome';
    } else if (this.hasRole(userRoles, Role.MANAGER) || this.hasRole(userRoles, Role.ADMIN)) {
      return 'AdminHome';
    } else {
      return 'ServerHome'; // Page par défaut
    }
  }
  }