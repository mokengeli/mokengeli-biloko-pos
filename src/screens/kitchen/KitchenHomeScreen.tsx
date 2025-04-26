// src/screens/kitchen/KitchenHomeScreen.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, RefreshControl, ScrollView } from 'react-native';
import { Appbar, Text, ActivityIndicator, Surface, useTheme, Chip, Divider } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { useAuth } from '../../contexts/AuthContext';
import { RolesUtils, Role } from '../../utils/roles';
import { OrderQueue } from '../../components/kitchen/OrderQueue';
import { KitchenFilter } from '../../components/kitchen/KitchenFilter';
import { NotAvailableDialog } from '../../components/common/NotAvailableDialog';
import orderService, { DomainOrder } from '../../api/orderService';

export const KitchenHomeScreen = () => {
  const { user, logout } = useAuth();
  const theme = useTheme();
  
  // États
  const [pendingOrders, setPendingOrders] = useState<DomainOrder[]>([]);
  const [readyOrders, setReadyOrders] = useState<DomainOrder[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [selectedCategories, setSelectedCategories] = useState<string[]>([]);
  const [notAvailableDialog, setNotAvailableDialog] = useState({
    visible: false,
    featureName: '',
  });
  
  // Charger les commandes
  const loadOrders = useCallback(async () => {
    if (!user?.tenantCode) {
      setError('Code de restaurant non disponible');
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Charger les commandes en attente
      const pendingResponse = await orderService.getOrdersByState('PENDING');
      setPendingOrders(pendingResponse);
      
      // Charger les commandes prêtes
      const readyResponse = await orderService.getOrdersByState('READY');
      setReadyOrders(readyResponse);
      
    } catch (err: any) {
      console.error('Error loading orders:', err);
      setError(err.message || 'Erreur lors du chargement des commandes');
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [user?.tenantCode]);

  // Actualiser les données
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadOrders();
  }, [loadOrders]);

  // Filtrer les commandes par catégorie
  const handleCategorySelect = (category: string) => {
    setSelectedCategories(prev => 
      prev.includes(category) 
        ? prev.filter(cat => cat !== category) 
        : [...prev, category]
    );
  };

  // Marquer un plat comme prêt
  const handleMarkAsReady = async (itemId: number) => {
    try {
      await orderService.prepareOrderItem(itemId);
      // Recharger les commandes après la mise à jour
      loadOrders();
    } catch (err) {
      console.error('Error marking item as ready:', err);
      setError('Erreur lors de la mise à jour du statut du plat');
    }
  };

  // Rejeter un plat
  const handleRejectItem = async (itemId: number) => {
    try {
      await orderService.rejectDish(itemId);
      // Recharger les commandes après la mise à jour
      loadOrders();
    } catch (err) {
      console.error('Error rejecting item:', err);
      setError('Erreur lors du rejet du plat');
    }
  };

  // Extraire toutes les catégories uniques des commandes
  const getAllCategories = () => {
    const categories = new Set<string>();
    
    // Parcourir toutes les commandes et leurs items pour extraire les catégories
    [...pendingOrders, ...readyOrders].forEach(order => {
      order.items.forEach(item => {
        if (item.categories && item.categories.length > 0) {
          item.categories.forEach(category => categories.add(category));
        }
      });
    });
    
    return Array.from(categories);
  };

  // Effet pour charger les commandes au démarrage et à chaque focus
  useEffect(() => {
    loadOrders();
  }, [loadOrders]);

  useFocusEffect(
    useCallback(() => {
      loadOrders();
    }, [loadOrders])
  );

  // Filtrer les commandes selon les catégories sélectionnées
  const getFilteredOrders = (orders: DomainOrder[]) => {
    if (selectedCategories.length === 0) return orders;
    
    return orders.map(order => ({
      ...order,
      items: order.items.filter(item => 
        item.categories && 
        item.categories.some(category => selectedCategories.includes(category))
      )
    })).filter(order => order.items.length > 0);
  };

  const filteredPendingOrders = getFilteredOrders(pendingOrders);
  const filteredReadyOrders = getFilteredOrders(readyOrders);

  // Affichage de chargement
  if (isLoading && !refreshing) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.loadingText}>Chargement des commandes...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <Appbar.Header style={styles.appbar}>
        <Appbar.Content 
          title="Mokengeli Biloko POS - Cuisine" 
          subtitle={`${RolesUtils.getRoleDescription(Role.COOK)}: ${user?.firstName || ''} ${user?.lastName || ''}`}
        />
        <Appbar.Action icon="refresh" onPress={onRefresh} disabled={refreshing} />
        <Appbar.Action icon="logout" onPress={logout} />
      </Appbar.Header>
      
      {/* Filtres de catégories */}
      <KitchenFilter 
        categories={getAllCategories()}
        selectedCategories={selectedCategories}
        onSelectCategory={handleCategorySelect}
      />
      
      {error ? (
        <Surface style={styles.errorContainer}>
          <Text style={styles.errorText}>{error}</Text>
        </Surface>
      ) : (
        <ScrollView
          style={styles.content}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
          }
        >
          {/* Commandes en attente */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Commandes à préparer ({filteredPendingOrders.length})</Text>
            <Divider style={styles.divider} />
            <OrderQueue 
              orders={filteredPendingOrders}
              status="PENDING"
              onMarkAsReady={handleMarkAsReady}
              onReject={handleRejectItem}
            />
          </View>
          
          {/* Commandes prêtes */}
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>Commandes prêtes à servir ({filteredReadyOrders.length})</Text>
            <Divider style={styles.divider} />
            <OrderQueue 
              orders={filteredReadyOrders}
              status="READY"
              onMarkAsReady={handleMarkAsReady}
              onReject={handleRejectItem}
            />
          </View>
        </ScrollView>
      )}
      
      {/* Dialogue pour les fonctionnalités non disponibles */}
      <NotAvailableDialog
        visible={notAvailableDialog.visible}
        onDismiss={() => setNotAvailableDialog({ visible: false, featureName: '' })}
        featureName={notAvailableDialog.featureName}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  appbar: {
    height: 56,
    paddingTop: 0,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
  },
  content: {
    flex: 1,
    padding: 12,
  },
  section: {
    marginBottom: 20,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  divider: {
    marginBottom: 16,
  },
  errorContainer: {
    margin: 16,
    padding: 16,
    borderRadius: 8,
    backgroundColor: '#ffe6e6',
  },
  errorText: {
    color: '#d32f2f',
    textAlign: 'center',
  },
});