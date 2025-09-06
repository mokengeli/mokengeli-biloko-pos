// src/utils/notificationHelpers.ts
import { OrderNotification, OrderNotificationStatus } from '../services/types/WebSocketTypes';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';

/**
 * ✅ CORRECTION CRITIQUE: Fonction helper sécurisée pour formater les timestamps
 * Protège contre les objets malformés qui causent l'erreur React {sessionId, timestamp}
 */
function safeFormatTimestamp(timestamp: any): string {
  try {
    // Validation stricte du type timestamp
    if (!timestamp) {
      return '';
    }
    
    // ✅ PROTECTION: Rejeter les objets complexes (comme {sessionId, timestamp})
    if (typeof timestamp === 'object' && timestamp !== null) {
      console.warn('[notificationHelpers] Invalid timestamp object received:', timestamp);
      return '';
    }
    
    // Accepter seulement string ou number
    if (typeof timestamp !== 'string' && typeof timestamp !== 'number') {
      console.warn('[notificationHelpers] Invalid timestamp type:', typeof timestamp, timestamp);
      return '';
    }
    
    // Créer la date de manière sécurisée
    const date = new Date(timestamp);
    
    // Vérifier que la date est valide
    if (isNaN(date.getTime())) {
      console.warn('[notificationHelpers] Invalid date from timestamp:', timestamp);
      return '';
    }
    
    // Formater avec date-fns
    return formatDistanceToNow(date, { addSuffix: true, locale: fr });
    
  } catch (error) {
    console.error('[notificationHelpers] Error formatting timestamp:', error, timestamp);
    return '';
  }
}

/**
 * Génère un message user-friendly basé sur une notification WebSocket
 */
export const getNotificationMessage = (notification: OrderNotification): string => {
  // ✅ CORRECTION CRITIQUE: Utiliser la fonction sécurisée
  const timeAgo = safeFormatTimestamp(notification.timestamp);
  
  // Déterminer le message en fonction du type de notification et des états
  switch (notification.orderStatus) {
    case OrderNotificationStatus.PAYMENT_UPDATE:
      return formatPaymentNotification(notification, timeAgo);
      
    case OrderNotificationStatus.DISH_UPDATE:
      return formatDishNotification(notification, timeAgo);
      
    case OrderNotificationStatus.NEW_ORDER:
      return `Nouvelle commande #${notification.orderId} créée ${timeAgo}`;
      
    case OrderNotificationStatus.DEBT_VALIDATION_REQUEST:
      return `Demande de validation d'impayé pour la commande #${notification.orderId} ${timeAgo}`;
      
    case OrderNotificationStatus.DEBT_VALIDATION_APPROVED:
      return `Validation d'impayé approuvée pour la commande #${notification.orderId} ${timeAgo}`;
      
    case OrderNotificationStatus.DEBT_VALIDATION_REJECTED:
      return `Validation d'impayé rejetée pour la commande #${notification.orderId} ${timeAgo}`;
      
    default:
      return `Mise à jour de la commande #${notification.orderId} ${timeAgo}`;
  }
};

/**
 * Formate les messages pour les notifications de paiement
 */
const formatPaymentNotification = (
  notification: OrderNotification, 
  timeAgo: string
): string => {
  // Message générique pour éviter la confusion
  // Ne pas indiquer "entièrement payée" car cela peut être trompeur
  switch (notification.newState) {
    case 'FULLY_PAID':
      return `Paiement reçu - Commande #${notification.orderId} soldée ${timeAgo}`;
      
    case 'PARTIALLY_PAID':
      return `Paiement reçu - Commande #${notification.orderId} ${timeAgo}`;
      
    case 'PAID_WITH_DISCOUNT':
      return `Paiement avec remise appliqué - Commande #${notification.orderId} ${timeAgo}`;
      
    case 'UNPAID':
      return `La commande #${notification.orderId} est marquée comme non payée ${timeAgo}`;
      
    default:
      // Message générique neutre
      return `Statut de paiement mis à jour pour la commande #${notification.orderId} ${timeAgo}`;
  }
};

/**
 * Formate les messages pour les notifications de mise à jour des plats
 */
const formatDishNotification = (
  notification: OrderNotification, 
  timeAgo: string
): string => {
  // Si c'est un nouvel élément ajouté
  if (notification.previousState === '' && notification.newState === 'PENDING') {
    return `Nouveau(x) plat(s) ajouté(s) à la commande #${notification.orderId} ${timeAgo}`;
  }
  
  // Selon l'état du plat
  switch (notification.newState) {
    case 'PENDING':
      return `Plat(s) en attente pour la commande #${notification.orderId} ${timeAgo}`;
      
    case 'IN_PREPARATION':
      return `Plat(s) en préparation pour la commande #${notification.orderId} ${timeAgo}`;
      
    case 'READY':
    case 'COOKED':
      return `Plat(s) prêt(s) à servir pour la commande #${notification.orderId} ${timeAgo}`;
      
    case 'SERVED':
      return `Plat(s) servi(s) pour la commande #${notification.orderId} ${timeAgo}`;
      
    case 'REJECTED':
      return `Plat(s) rejeté(s) pour la commande #${notification.orderId} ${timeAgo}`;
      
    case 'PAID':
      return `Plat(s) payé(s) pour la commande #${notification.orderId} ${timeAgo}`;
      
    default:
      return `Statut des plats mis à jour: ${notification.newState.toLowerCase()} ${timeAgo}`;
  }
};

/**
 * Détermine si une notification nécessite une attention immédiate de l'utilisateur
 */
export const isUrgentNotification = (notification: OrderNotification): boolean => {
  // Les paiements sont toujours urgents
  if (notification.orderStatus === OrderNotificationStatus.PAYMENT_UPDATE) {
    return true;
  }
  
  // Les plats prêts ou rejetés sont urgents
  if (notification.orderStatus === OrderNotificationStatus.DISH_UPDATE &&
      (notification.newState === 'READY' || 
       notification.newState === 'COOKED' ||
       notification.newState === 'REJECTED')) {
    return true;
  }
  
  // Les nouvelles commandes sont urgentes
  if (notification.orderStatus === OrderNotificationStatus.NEW_ORDER) {
    return true;
  }
  
  // Les demandes de validation d'impayé sont urgentes
  if (notification.orderStatus === OrderNotificationStatus.DEBT_VALIDATION_REQUEST) {
    return true;
  }
  
  // Les réponses de validation sont importantes
  if (notification.orderStatus === OrderNotificationStatus.DEBT_VALIDATION_APPROVED ||
      notification.orderStatus === OrderNotificationStatus.DEBT_VALIDATION_REJECTED) {
    return true;
  }
  
  return false;
};

/**
 * Obtient une couleur appropriée pour la notification
 */
export const getNotificationColor = (notification: OrderNotification): string => {
  // Couleurs selon le type de notification
  switch (notification.orderStatus) {
    case OrderNotificationStatus.PAYMENT_UPDATE:
      return notification.newState === 'FULLY_PAID' ? '#4CAF50' : '#2196F3';
      
    case OrderNotificationStatus.DISH_UPDATE:
      if (notification.newState === 'REJECTED') return '#F44336'; // Rouge
      if (notification.newState === 'READY' || notification.newState === 'COOKED') return '#FF9800'; // Orange
      return '#2196F3'; // Bleu par défaut
      
    case OrderNotificationStatus.NEW_ORDER:
      return '#4CAF50'; // Vert
      
    case OrderNotificationStatus.DEBT_VALIDATION_REQUEST:
      return '#FF9800'; // Orange - demande d'attention
      
    case OrderNotificationStatus.DEBT_VALIDATION_APPROVED:
      return '#4CAF50'; // Vert - succès
      
    case OrderNotificationStatus.DEBT_VALIDATION_REJECTED:
      return '#F44336'; // Rouge - rejeté
      
    default:
      return '#757575'; // Gris
  }
};