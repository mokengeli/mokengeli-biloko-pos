// src/components/kitchen/OrderQueue.tsx
import React, { useState } from 'react';
import { View, StyleSheet, FlatList, Dimensions } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { OrderCard } from './OrderCard';
import { DomainOrder, DomainOrderItem } from '../../api/orderService';

interface OrderQueueProps {
  orders: DomainOrder[];
  status: 'PENDING' | 'READY';
  onMarkAsReady: (itemId: number) => void;
  onReject: (itemId: number) => void;
}

export const OrderQueue: React.FC<OrderQueueProps> = ({
  orders,
  status,
  onMarkAsReady,
  onReject,
}) => {
  const theme = useTheme();
  const windowWidth = Dimensions.get('window').width;
  const isTablet = windowWidth >= 768;
  
  // Vérifier s'il y a des commandes
  if (orders.length === 0) {
    return (
      <View style={styles.emptyContainer}>
        <Text style={styles.emptyText}>
          {status === 'PENDING' 
            ? 'Aucune commande à préparer' 
            : 'Aucune commande prête à servir'}
        </Text>
      </View>
    );
  }

  return (
    <FlatList
      data={orders}
      keyExtractor={(item) => item.id.toString()}
      numColumns={isTablet ? 2 : 1}
      columnWrapperStyle={isTablet ? styles.columnWrapperStyle : undefined}
      renderItem={({ item }) => (
        <OrderCard
          order={item}
          status={status}
          onMarkAsReady={onMarkAsReady}
          onReject={onReject}
          style={isTablet ? styles.tabletCard : styles.phoneCard}
        />
      )}
      contentContainerStyle={styles.contentContainer}
    />
  );
};

const styles = StyleSheet.create({
  contentContainer: {
    paddingBottom: 20,
  },
  columnWrapperStyle: {
    justifyContent: 'space-between',
    marginBottom: 12,
  },
  emptyContainer: {
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: '#f9f9f9',
    borderRadius: 8,
  },
  emptyText: {
    fontSize: 16,
    opacity: 0.7,
  },
  tabletCard: {
    width: '49%',
  },
  phoneCard: {
    width: '100%',
    marginBottom: 12,
  },
});