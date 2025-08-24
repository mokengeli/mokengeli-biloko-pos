// src/components/common/NotificationSnackbar.tsx
import React from 'react';
import { View, StyleSheet } from 'react-native';
import { Snackbar, Text, useTheme, IconButton } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { OrderNotification, OrderNotificationStatus } from '../../services/types/WebSocketTypes';

import { getNotificationMessage, getNotificationColor } from '../../utils/notificationHelpers';

interface NotificationSnackbarProps {
  notification: OrderNotification | null;
  visible: boolean;
  onDismiss: () => void;
  onAction?: () => void;
  actionLabel?: string;
  duration?: number;
  wrapperStyle?: object; // Style supplémentaire pour le wrapper Snackbar
}

export const NotificationSnackbar: React.FC<NotificationSnackbarProps> = ({
  notification,
  visible,
  onDismiss,
  onAction,
  actionLabel = 'Voir',
  duration = 4000,
  wrapperStyle = {},
}) => {
  const theme = useTheme();
  
  if (!notification) return null;
  
  // Déterminer l'icône en fonction du type de notification
  const getNotificationIcon = (notification: OrderNotification): string => {
    switch (notification.orderStatus) {
      case OrderNotificationStatus.PAYMENT_UPDATE:
        return notification.newState === 'FULLY_PAID' ? 'cash-check' : 'cash-clock';
      
      case OrderNotificationStatus.DISH_UPDATE:
        if (notification.newState === 'REJECTED') return 'food-off';
        if (notification.newState === 'READY' || notification.newState === 'COOKED') return 'food';
        if (notification.newState === 'SERVED') return 'silverware';
        return 'food-variant';
      
      case OrderNotificationStatus.NEW_ORDER:
        return 'receipt';
      
      default:
        return 'bell';
    }
  };
  
  // Générer le message de notification
  const message = getNotificationMessage(notification);
  
  // Obtenir la couleur de fond
  const backgroundColor = getNotificationColor(notification);
  
  // Déterminer si on doit montrer une action
  const shouldShowAction = !!onAction;
  
  return (
    <Snackbar
      visible={visible}
      onDismiss={onDismiss}
      duration={duration}
      style={[styles.snackbar, { backgroundColor }]}
      wrapperStyle={[styles.wrapper, wrapperStyle]} // Important: style du wrapper pour corriger le positionnement
      action={shouldShowAction ? {
        label: actionLabel,
        onPress: onAction,
        color: 'white',
      } : undefined}
    >
      <View style={styles.contentContainer}>
        <Icon 
          name={getNotificationIcon(notification)} 
          size={20} 
          color="white" 
          style={styles.icon}
        />
        <Text style={styles.message}>{message}</Text>
      </View>
    </Snackbar>
  );
};

const styles = StyleSheet.create({
  wrapper: {
    position: 'relative', // Neutralise le positionnement absolu par défaut
  },
  snackbar: {
    borderRadius: 8,
    marginBottom: 0, // Supprime la marge par défaut car le conteneur s'en charge
  },
  contentContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  icon: {
    marginRight: 12,
  },
  message: {
    color: 'white',
    flex: 1,
  },
});