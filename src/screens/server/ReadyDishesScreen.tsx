// src/screens/server/ReadyDishesScreen.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, FlatList, ActivityIndicator } from 'react-native';
import { Appbar, Card, Text, Divider, Button, Chip, Badge, Surface, useTheme, Snackbar } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StackNavigationProp } from '@react-navigation/stack';
import { RouteProp } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useAuth } from '../../contexts/AuthContext';
import orderService, { DomainOrder, DomainOrderItem } from '../../api/orderService';

type ReadyDishesParamList = {
  ReadyDishes: {
    tableId?: string;
    tableName?: string;
  };
};

type ReadyDishesScreenRouteProp = RouteProp<ReadyDishesParamList, 'ReadyDishes'>;
type ReadyDishesScreenNavigationProp = StackNavigationProp<ReadyDishesParamList, 'ReadyDishes'>;

interface ReadyDishesScreenProps {
  navigation: ReadyDishesScreenNavigationProp;
  route: ReadyDishesScreenRouteProp;
}

export const ReadyDishesScreen: React.FC<ReadyDishesScreenProps> = ({ navigation, route }) => {
  const { tableId, tableName } = route.params || {};
  const { user } = useAuth();
  const theme = useTheme();
  
  // États
  const [isLoading, setIsLoading] = useState(true);
  const [orders, setOrders] = useState<DomainOrder[]>([]);
  const [selectedOrder, setSelectedOrder] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [processingItems, setProcessingItems] = useState<number[]>([]);
  
  // Charger les plats prêts à servir
  const loadReadyDishes = useCallback(async () => {
    if (!user?.tenantCode) {
      setError('Code de restaurant non disponible');
      setIsLoading(false);
      return;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      // Récupérer toutes les commandes avec des plats prêts
      const readyOrders = await orderService.getOrdersByState("READY");
      
      // Si un tableId est spécifié, filtrer pour cette table uniquement
      const filteredOrders = tableId 
        ? readyOrders.filter(order => order.tableId.toString() === tableId)
        : readyOrders;
      
      // Filtrer pour ne garder que les commandes qui ont des plats prêts
      const ordersWithReadyItems = filteredOrders.map(order => ({
        ...order,
        items: order.items.filter(item => item.state === "READY" || item.state === "COOKED")
      })).filter(order => order.items.length > 0);
      
      // Trier par date de commande (plus anciennes d'abord)
      const sortedOrders = ordersWithReadyItems.sort((a, b) => 
        new Date(a.orderDate).getTime() - new Date(b.orderDate).getTime()
      );
      
      setOrders(sortedOrders);
    } catch (err: any) {
      console.error('Error loading ready dishes:', err);
      setError(err.message || 'Erreur lors du chargement des plats prêts');
    } finally {
      setIsLoading(false);
    }
  }, [user?.tenantCode, tableId]);
  
  // Charger les données au chargement de l'écran
  useEffect(() => {
    loadReadyDishes();
  }, [loadReadyDishes]);
  
  // Rafraîchir les données
  const handleRefresh = () => {
    loadReadyDishes();
  };
  
  // Marquer un plat comme servi
  const markAsServed = async (itemId: number) => {
    try {
      // Ajouter l'itemId à la liste des items en cours de traitement
      setProcessingItems(prev => [...prev, itemId]);
      
      // Appeler l'API pour marquer le plat comme servi
      await orderService.markDishAsServed(itemId);
      
      // Mise à jour locale de l'état pour refléter le changement
      setOrders(prevOrders => 
        prevOrders.map(order => ({
          ...order,
          items: order.items.filter(item => item.id !== itemId)
        })).filter(order => order.items.length > 0)
      );
      
      // Afficher un message de succès
      setSnackbarMessage("Plat marqué comme servi avec succès");
      setSnackbarVisible(true);
    } catch (err: any) {
      console.error('Error marking dish as served:', err);
      setError(err.message || "Erreur lors du marquage du plat comme servi");
    } finally {
      // Retirer l'itemId de la liste des items en cours de traitement
      setProcessingItems(prev => prev.filter(id => id !== itemId));
    }
  };
  
  // Marquer tous les plats d'une commande comme servis
  const markAllAsServed = async (orderId: number) => {
    const orderToUpdate = orders.find(order => order.id === orderId);
    if (!orderToUpdate) return;
    
    try {
      // Ajouter tous les IDs d'items de cette commande à la liste des items en cours de traitement
      const itemIds = orderToUpdate.items.map(item => item.id);
      setProcessingItems(prev => [...prev, ...itemIds]);
      
      // Appeler l'API pour chaque plat
      await Promise.all(
        orderToUpdate.items.map(item => orderService.markDishAsServed(item.id))
      );
      
      // Mise à jour locale de l'état
      setOrders(prevOrders => prevOrders.filter(order => order.id !== orderId));
      
      // Afficher un message de succès
      setSnackbarMessage(`Tous les plats de la commande #${orderId} marqués comme servis`);
      setSnackbarVisible(true);
    } catch (err: any) {
      console.error('Error marking all dishes as served:', err);
      setError(err.message || "Erreur lors du marquage des plats comme servis");
    } finally {
      // Nettoyer la liste des items en cours de traitement
      const itemIds = orderToUpdate.items.map(item => item.id);
      setProcessingItems(prev => prev.filter(id => !itemIds.includes(id)));
    }
  };
  
  // Calculer le temps d'attente
  const getWaitTime = (dateString: string) => {
    const orderTime = new Date(dateString).getTime();
    const currentTime = new Date().getTime();
    const diffMinutes = Math.floor((currentTime - orderTime) / (1000 * 60));
    
    if (diffMinutes < 1) return "À l'instant";
    if (diffMinutes === 1) return "1 minute";
    if (diffMinutes < 60) return `${diffMinutes} minutes`;
    
    const hours = Math.floor(diffMinutes / 60);
    const minutes = diffMinutes % 60;
    return `${hours}h ${minutes}m`;
  };
  
  // Obtenir la couleur selon le temps d'attente
  const getWaitTimeColor = (dateString: string) => {
    const diffMinutes = Math.floor(
      (new Date().getTime() - new Date(dateString).getTime()) / (1000 * 60)
    );
    
    if (diffMinutes < 5) return theme.colors.success; // < 5 min: vert
    if (diffMinutes < 15) return theme.colors.warning; // 5-15 min: orange
    return theme.colors.error; // > 15 min: rouge
  };
  
  // Rendu d'un élément de commande (plat)
  const renderOrderItem = ({ item, orderId }: { item: DomainOrderItem, orderId: number }) => {
    const isProcessing = processingItems.includes(item.id);
    
    return (
      <Card style={styles.dishCard}>
        <View style={styles.dishCardInner}>
          <View style={styles.dishInfo}>
            <Text style={styles.dishName}>{item.count}x {item.dishName}</Text>
            {item.note && (
              <Text style={styles.dishNote}>Note: {item.note}</Text>
            )}
          </View>
          <Button
            mode="contained"
            onPress={() => markAsServed(item.id)}
            style={styles.serveButton}
            loading={isProcessing}
            disabled={isProcessing}
          >
            Servir
          </Button>
        </View>
      </Card>
    );
  };
  
  // Rendu d'une commande
  const renderOrder = ({ item: order }: { item: DomainOrder }) => {
    const isExpanded = selectedOrder === order.id;
    const orderItemsIds = order.items.map(item => item.id);
    const isProcessingOrder = orderItemsIds.some(id => processingItems.includes(id));
    
    return (
      <Card style={styles.orderCard}>
        <Card.Content>
          <View style={styles.orderHeader}>
            <View style={styles.orderTitleContainer}>
              <Text style={styles.orderTitle}>Commande #{order.id}</Text>
              <Text style={styles.tableText}>Table: {order.tableName}</Text>
            </View>
            <Badge
              style={[
                styles.waitTimeBadge,
                { backgroundColor: getWaitTimeColor(order.orderDate) }
              ]}
            >
              {getWaitTime(order.orderDate)}
            </Badge>
          </View>
          
          <View style={styles.statsRow}>
            <Chip icon="silverware" style={styles.statsChip}>{order.items.length} plats prêts</Chip>
            <Button
              mode="outlined"
              icon={isExpanded ? "chevron-up" : "chevron-down"}
              onPress={() => setSelectedOrder(isExpanded ? null : order.id)}
            >
              {isExpanded ? "Réduire" : "Détails"}
            </Button>
          </View>
          
          {isExpanded && (
            <View style={styles.expandedContent}>
              <Divider style={styles.divider} />
              
              {order.items.map(item => renderOrderItem({ item, orderId: order.id }))}
              
              <Button
                mode="contained"
                icon="check-all"
                onPress={() => markAllAsServed(order.id)}
                style={styles.markAllButton}
                loading={isProcessingOrder}
                disabled={isProcessingOrder}
              >
                Tout servir
              </Button>
            </View>
          )}
        </Card.Content>
      </Card>
    );
  };
  
  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => navigation.goBack()} />
        <Appbar.Content 
          title="Plats prêts à servir" 
          subtitle={tableName ? `Table: ${tableName}` : undefined} 
        />
        <Appbar.Action icon="refresh" onPress={handleRefresh} />
      </Appbar.Header>
      
      {isLoading && orders.length === 0 ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Chargement des plats...</Text>
        </View>
      ) : error ? (
        <Surface style={styles.errorContainer}>
          <Icon name="alert-circle-outline" size={24} color={theme.colors.error} />
          <Text style={styles.errorText}>{error}</Text>
          <Button mode="contained" onPress={handleRefresh} style={styles.retryButton}>
            Réessayer
          </Button>
        </Surface>
      ) : orders.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Icon name="check-circle" size={64} color={theme.colors.primary} />
          <Text style={styles.emptyTitle}>Tous les plats ont été servis</Text>
          <Text style={styles.emptyText}>
            Il n'y a actuellement aucun plat prêt à servir
            {tableName ? ` pour la table ${tableName}` : ''}.
          </Text>
          <Button 
            mode="outlined" 
            icon="refresh" 
            onPress={handleRefresh}
            style={styles.refreshButton}
          >
            Rafraîchir
          </Button>
        </View>
      ) : (
        <FlatList
          data={orders}
          renderItem={renderOrder}
          keyExtractor={item => item.id.toString()}
          contentContainerStyle={styles.listContent}
          ItemSeparatorComponent={() => <View style={styles.separator} />}
          showsVerticalScrollIndicator={true}
        />
      )}
      
      <Snackbar
        visible={snackbarVisible}
        onDismiss={() => setSnackbarVisible(false)}
        duration={3000}
        style={{ backgroundColor: theme.colors.success }}
      >
        {snackbarMessage}
      </Snackbar>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
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
  errorContainer: {
    margin: 16,
    padding: 24,
    borderRadius: 8,
    alignItems: 'center',
  },
  errorText: {
    fontSize: 16,
    textAlign: 'center',
    marginVertical: 12,
    color: '#d32f2f',
  },
  retryButton: {
    marginTop: 8,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 16,
    textAlign: 'center',
    opacity: 0.7,
    marginBottom: 24,
  },
  refreshButton: {
    marginTop: 8,
  },
  listContent: {
    padding: 16,
  },
  separator: {
    height: 12,
  },
  orderCard: {
    borderRadius: 8,
  },
  orderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  orderTitleContainer: {
    flex: 1,
  },
  orderTitle: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  tableText: {
    fontSize: 14,
    opacity: 0.7,
    marginTop: 4,
  },
  waitTimeBadge: {
    fontSize: 12,
    fontWeight: 'bold',
    paddingHorizontal: 8,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
  },
  statsChip: {
    backgroundColor: '#E3F2FD',
  },
  expandedContent: {
    marginTop: 8,
  },
  divider: {
    marginVertical: 12,
  },
  dishCard: {
    marginVertical: 6,
    backgroundColor: '#F9FAFE',
  },
  dishCardInner: {
    padding: 12,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  dishInfo: {
    flex: 1,
  },
  dishName: {
    fontSize: 16,
    fontWeight: '500',
  },
  dishNote: {
    fontSize: 14,
    opacity: 0.7,
    fontStyle: 'italic',
    marginTop: 4,
  },
  serveButton: {
    marginLeft: 12,
  },
  markAllButton: {
    marginTop: 16,
    alignSelf: 'flex-end',
  }
});