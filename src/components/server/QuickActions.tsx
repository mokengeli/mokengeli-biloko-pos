// src/components/server/QuickActions.tsx
import React from 'react';
import { View, StyleSheet, ScrollView, Dimensions } from 'react-native';
import { Button, useTheme, Badge } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

interface QuickActionButtonProps {
  icon: string;
  label: string;
  onPress: () => void;
  badgeCount?: number;
  disabled?: boolean;
}

const QuickActionButton: React.FC<QuickActionButtonProps> = ({
  icon,
  label,
  onPress,
  badgeCount,
  disabled = false,
}) => {
  const theme = useTheme();
  const windowWidth = Dimensions.get('window').width;
  const isCompact = windowWidth < 500;

  return (
    <View style={styles.actionButtonContainer}>
      {(badgeCount !== undefined && badgeCount > 0) && (
        <Badge style={styles.badge} size={24}>{badgeCount}</Badge>
      )}
      <Button
        mode="contained"
        icon={({ size, color }) => <Icon name={icon} size={size} color={color} />}
        onPress={onPress}
        style={[styles.actionButton, { backgroundColor: theme.colors.primary }]}
        contentStyle={styles.actionButtonContent}
        labelStyle={styles.actionButtonLabel}
        disabled={disabled}
        compact={isCompact}
      >
        {label}
      </Button>
    </View>
  );
};

interface QuickActionsProps {
  onNewOrder: () => void;
  onTakeout: () => void;
  onMyOrders: () => void;
  onReady: () => void;
  readyCount?: number;
  disabled?: boolean;
}

export const QuickActions: React.FC<QuickActionsProps> = ({
  onNewOrder,
  onTakeout,
  onMyOrders,
  onReady,
  readyCount = 0,
  disabled = false,
}) => {
  const windowWidth = Dimensions.get('window').width;
  const isTablet = windowWidth >= 768;

  return (
    <View style={[styles.container, isTablet ? styles.tabletContainer : {}]}>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.scrollViewContent}
      >
        <QuickActionButton
          icon="silverware-fork-knife"
          label="Nouvelle commande"
          onPress={onNewOrder}
          disabled={disabled}
        />
        <QuickActionButton
          icon="food-takeout-box"
          label="À emporter"
          onPress={onTakeout}
          disabled={disabled}
        />
        <QuickActionButton
          icon="clipboard-list"
          label="Mes commandes"
          onPress={onMyOrders}
          disabled={disabled}
        />
        <QuickActionButton
          icon="bell"
          label="Plats prêts"
          onPress={onReady}
          badgeCount={readyCount}
          disabled={disabled}
        />
      </ScrollView>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    paddingVertical: 8,
    backgroundColor: 'white',
    elevation: 2,
  },
  tabletContainer: {
    paddingHorizontal: 12,
  },
  scrollViewContent: {
    paddingHorizontal: 12,
    gap: 8,
  },
  actionButtonContainer: {
    position: 'relative',
    marginVertical: 4, // Ajout de marge verticale
  },
  actionButton: {
    marginHorizontal: 4,
    borderRadius: 8,
  },
  actionButtonContent: {
    paddingHorizontal: 10,
    height: 48,
  },
  actionButtonLabel: {
    fontSize: 14,
  },
  badge: {
    position: 'absolute',
    top: -6,  // Position ajustée pour éviter la troncature
    right: -4,
    zIndex: 1,
    backgroundColor: '#d32f2f', // Rouge pour plus de visibilité
  },
});