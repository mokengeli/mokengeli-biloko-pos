// src/utils/notificationHelpers.ts
import { OrderNotification, OrderNotificationStatus } from '../services/types/WebSocketTypes';
import { formatDistanceToNow } from 'date-fns';
import { fr } from 'date-fns/locale';

/**
 * Génère un message user-friendly basé sur une notification WebSocket
 */
export const getNotificationMessage = (notification: OrderNotification): string => {
  // Obtenir un timestamp formaté si disponible
  const timeAgo = notification.timestamp 
    ? formatDistanceToNow(new Date(notification.timestamp), { addSuffix: true, locale: fr })
    : '';
  
  // Déterminer le message en fonction du type de notification et des états
  switch (notification.orderStatus) {
    case OrderNotificationStatus.PAYMENT_UPDATE:
      return formatPaymentNotification(notification, timeAgo);
      
    case OrderNotificationStatus.DISH_UPDATE:
      return formatDishNotification(notification, timeAgo);
      
    case OrderNotificationStatus.NEW_ORDER:
      return `Nouvelle commande #${notification.orderId} créée ${timeAgo}`;
      
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
  switch (notification.newState) {
    case 'FULLY_PAID':
      return `Commande #${notification.orderId} entièrement payée ${timeAgo}`;
      
    case 'PARTIALLY_PAID':
      return `Paiement partiel reçu pour la commande #${notification.orderId} ${timeAgo}`;
      
    case 'PAID_WITH_DISCOUNT':
      return `Paiement avec remise pour la commande #${notification.orderId} ${timeAgo}`;
      
    case 'UNPAID':
      return `La commande #${notification.orderId} est marquée comme non payée ${timeAgo}`;
      
    default:
      return `Statut de paiement mis à jour: ${notification.newState.toLowerCase().replace('_', ' ')} ${timeAgo}`;
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
      
    default:
      return '#757575'; // Gris
  }
};