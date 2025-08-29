// src/utils/waiterHelpers.ts
import { DomainOrder } from '../api/orderService';

/**
 * Interface pour représenter un serveur unique
 */
export interface WaiterInfo {
  identifier: string;
  name: string;
}

/**
 * Fonction helper pour gérer les noms de serveur avec fallback
 * @param waiterName - Nom du serveur (peut être null, undefined ou vide)
 * @returns Nom d'affichage ou "Non défini"
 */
export const getWaiterDisplayName = (waiterName?: string | null): string => {
  if (!waiterName || waiterName.trim() === '') {
    return 'Non défini';
  }
  return waiterName.trim();
};

/**
 * Obtient l'identifiant du serveur (priorité à waiterIdentifier puis employeeNumber)
 * @param order - Commande
 * @returns Identifiant du serveur
 */
export const getWaiterIdentifier = (order: DomainOrder): string => {
  return order.waiterIdentifier || order.employeeNumber || '';
};

/**
 * Extrait les informations du serveur d'une commande
 * @param order - Commande
 * @returns Informations du serveur
 */
export const getWaiterInfo = (order: DomainOrder): WaiterInfo => {
  return {
    identifier: getWaiterIdentifier(order),
    name: getWaiterDisplayName(order.waiterName)
  };
};

/**
 * Extrait les serveurs uniques d'une liste de commandes
 * @param orders - Liste des commandes
 * @returns Liste des serveurs uniques
 */
export const getUniqueWaiters = (orders: DomainOrder[]): WaiterInfo[] => {
  const waiters = orders.map(order => getWaiterInfo(order));
  
  // Déduplication par identifier
  return waiters.filter((waiter, index, self) => 
    index === self.findIndex(w => w.identifier === waiter.identifier)
  );
};

/**
 * Formate la liste des serveurs pour l'affichage
 * @param orders - Liste des commandes
 * @returns Chaîne formatée des serveurs
 */
export const formatWaitersDisplay = (orders: DomainOrder[]): string => {
  if (orders.length === 0) {
    return 'Aucun serveur';
  }

  const uniqueWaiters = getUniqueWaiters(orders);
  
  if (uniqueWaiters.length === 0) {
    return 'Non défini';
  }
  
  if (uniqueWaiters.length === 1) {
    return `Serveur: ${uniqueWaiters[0].name}`;
  }
  
  if (uniqueWaiters.length === 2) {
    return `Serveurs: ${uniqueWaiters[0].name}, ${uniqueWaiters[1].name}`;
  }
  
  // Plus de 2 serveurs : format condensé
  return `${uniqueWaiters.length} serveurs actifs`;
};

/**
 * Obtient les initiales d'un nom de serveur pour les badges
 * @param waiterName - Nom du serveur
 * @returns Initiales (max 2 caractères)
 */
export const getWaiterInitials = (waiterName?: string | null): string => {
  const name = getWaiterDisplayName(waiterName);
  
  if (name === 'Non défini') {
    return 'ND';
  }
  
  const words = name.split(' ').filter(word => word.length > 0);
  
  if (words.length === 0) {
    return 'ND';
  }
  
  if (words.length === 1) {
    return words[0].charAt(0).toUpperCase();
  }
  
  // Prendre la première lettre des deux premiers mots
  return (words[0].charAt(0) + words[1].charAt(0)).toUpperCase();
};

/**
 * Vérifie si plusieurs serveurs sont impliqués dans les commandes d'une table
 * @param orders - Liste des commandes
 * @returns true si plusieurs serveurs, false sinon
 */
export const hasMultipleWaiters = (orders: DomainOrder[]): boolean => {
  return getUniqueWaiters(orders).length > 1;
};