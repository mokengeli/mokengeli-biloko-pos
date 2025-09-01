// src/components/server/TableDetailDialog.tsx
import React from 'react';
import { StyleSheet, View, ScrollView } from 'react-native';
import { Dialog, Portal, Text, Button, Divider, Chip, useTheme, List } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { TableWithStatus } from './TableGrid';
import { DomainOrder, DomainOrderItem } from '../../api/orderService';
import orderService from '../../api/orderService';
import { useCart, CartMode } from '../../contexts/CartContext';
import { formatWaitersDisplay, getWaiterDisplayName, hasMultipleWaiters, getUniqueWaiters } from '../../utils/waiterHelpers';
import { useAuth } from '../../contexts/AuthContext';
import { NavigationHelper } from '../../utils/navigationHelper';

interface TableDetailDialogProps {
  visible: boolean;
  onDismiss: () => void;
  table: TableWithStatus | null;
  orders: DomainOrder[];
  onNewOrder: () => void;
  onAddToOrder: (order: DomainOrder) => void;
  onRequestBill: (order: DomainOrder) => void;
  onPrintTicket: (order: DomainOrder) => void;
  onServeReadyDishes: (order: DomainOrder) => void;
  onRefreshOrders?: () => void; // Nouvelle prop pour rafraîchir les commandes
}

export const TableDetailDialog: React.FC<TableDetailDialogProps> = ({
  visible,
  onDismiss,
  table,
  orders,
  onNewOrder,
  onAddToOrder,
  onRequestBill,
  onPrintTicket,
  onServeReadyDishes,
  onRefreshOrders,
}) => {
  const theme = useTheme();
  const { setEditMode } = useCart();
  const { user } = useAuth();

  // Vérifier si l'utilisateur est un manager
  const isManager = NavigationHelper.isManager(user?.roles);

  if (!table) return null;

  // Formatter le temps d'occupation
  const formatOccupationTime = (minutes?: number) => {
    if (!minutes) return 'Non spécifié';
    
    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;
    
    if (hours > 0) {
      return `${hours}h ${mins}m`;
    } else {
      return `${mins} minutes`;
    }
  };

  // Obtenir la couleur et le texte du statut
  const getStatusColor = (status: TableWithStatus['status']) => {
    switch (status) {
      case 'free':
        return theme.colors.primary;
      case 'occupied':
        return theme.colors.error;
      default:
        return theme.colors.text;
    }
  };

  const getStatusText = (status: TableWithStatus['status']) => {
    switch (status) {
      case 'free':
        return 'Libre';
      case 'occupied':
        return 'Occupée';
      default:
        return '';
    }
  };

  // Obtenir le texte du statut d'un élément de commande
  const getOrderItemStatusText = (status: DomainOrderItem['state']) => {
    switch (status) {
      case 'PENDING':
        return 'En attente';
      case 'IN_PREPARATION':
        return 'En préparation';
      case 'COOKED':
        return 'Prêt';
      case 'READY':
        return 'À servir';
      case 'SERVED':
        return 'Servi';
      case 'REJECTED':
        return 'Rejeté';
      case 'RETURNED':
        return 'Retourné';
      case 'PAID':
        return 'Payé';
      default:
        return 'Inconnu';
    }
  };

  // Fonction pour obtenir un style de texte selon le statut
  const getStatusTextStyle = (status: DomainOrderItem['state']) => {
    switch (status) {
      case 'READY':
      case 'COOKED':
        return { color: theme.colors.success, fontWeight: 'bold' as const };
      case 'PENDING':
      case 'IN_PREPARATION':
        return { color: theme.colors.warning || '#FF9800', fontWeight: 'bold' as const };
      case 'REJECTED':
        return { color: theme.colors.error, fontWeight: 'bold' as const };
      case 'RETURNED':
        return { color: theme.colors.disabled, fontWeight: 'bold' as const };
      default:
        return {};
    }
  };

  // Vérifier si une commande a des plats prêts à servir
  const hasReadyDishes = (order: DomainOrder): boolean => {
    return order.items.some(item => 
      item.state === 'READY' || item.state === 'COOKED'
    );
  };

  // Compter les plats prêts dans une commande
  const countReadyDishes = (order: DomainOrder): number => {
    return order.items.filter(item => 
      item.state === 'READY' || item.state === 'COOKED'
    ).length;
  };

  // Vérifier si un plat peut être retourné
  const canReturnDish = (item: DomainOrderItem): boolean => {
    return item.state === 'PENDING' || item.state === 'IN_PREPARATION';
  };

  // Fonction pour retourner un plat
  const handleReturnDish = async (item: DomainOrderItem) => {
    try {
      await orderService.returnDish(item.id);
      // Rafraîchir les commandes si la fonction est fournie
      if (onRefreshOrders) {
        onRefreshOrders();
      }
    } catch (error) {
      console.error('Erreur lors du retour du plat:', error);
      // Ici on pourrait ajouter une notification d'erreur
    }
  };

  // Fonction pour gérer l'ajout d'articles à une commande existante
  const handleAddToExistingOrder = (order: DomainOrder) => {
    // Configure le panier en mode ajout avec l'ordre existant
    setEditMode(order.id, order);
    
    // Ferme le dialogue et navigue vers l'écran de création de commande
    onDismiss();
    onAddToOrder(order);
  };

  return (
    <Portal>
      <View style={styles.dialogWrapper}>
        <Dialog
          visible={visible}
          onDismiss={onDismiss}
          style={styles.dialog}
        >
          <View style={styles.dialogContent}>
            <Dialog.Title>
              <View style={styles.titleContainer}>
                <Text style={styles.tableName}>{table.tableData.name}</Text>
                <Chip 
                  mode="outlined" 
                  style={[styles.statusChip, { borderColor: getStatusColor(table.status) }]}
                  textStyle={{ color: getStatusColor(table.status) }}
                >
                  {getStatusText(table.status)}
                </Chip>
              </View>
            </Dialog.Title>
            
            <Dialog.Content>
              <View style={styles.infoContainer}>
                <View style={styles.infoRow}>
                  <Text style={styles.infoLabel}>Temps d'occupation:</Text>
                  <Text style={styles.infoValue}>{formatOccupationTime(table.occupationTime)}</Text>
                </View>
                
                {/* Nouvelle section : Informations des serveurs */}
                {orders.length > 0 && (
                  <View style={styles.infoRow}>
                    <Text style={styles.infoLabel}>
                      {hasMultipleWaiters(orders) ? 'Serveurs:' : 'Serveur:'}
                    </Text>
                    <View style={styles.waitersContainer}>
                      <Text style={styles.infoValue}>
                        {formatWaitersDisplay(orders)}
                      </Text>
                      {hasMultipleWaiters(orders) && (
                        <View style={styles.waiterChips}>
                          {getUniqueWaiters(orders).map((waiter, index) => (
                            <Chip
                              key={waiter.identifier}
                              mode="outlined"
                              compact
                              style={styles.waiterChip}
                              textStyle={styles.waiterChipText}
                            >
                              {waiter.name}
                            </Chip>
                          ))}
                        </View>
                      )}
                    </View>
                  </View>
                )}
                
                <Divider style={styles.divider} />
                
                {orders.length > 0 ? (
                  <>
                    <Text style={styles.sectionTitle}>Commandes actives</Text>
                    
                    <View style={styles.ordersContainer}>
                      {orders.map((order) => (
                        <View key={order.id} style={styles.accordionWrapper}>
                          <List.Accordion
                            title={`Commande #${order.id}`}
                            description={`${order.items.length} articles - ${order.totalPrice.toFixed(2)} ${order.currency.code} • ${getWaiterDisplayName(order.waiterName)}`}
                            left={props => <List.Icon {...props} icon="receipt" />}
                            style={styles.orderAccordion}
                          >
                            <ScrollView 
                              style={styles.orderItemsContainer}
                              showsVerticalScrollIndicator={true}
                              nestedScrollEnabled={true}
                            >
                              {order.items.map((item) => (
                                <View key={item.id} style={styles.dishItemContainer}>
                                  <List.Item
                                    title={`${item.count}x ${item.dishName}`}
                                    description={getOrderItemStatusText(item.state)}
                                    descriptionStyle={getStatusTextStyle(item.state)}
                                    left={props => <List.Icon {...props} icon="food" />}
                                    right={props => (
                                      <Text {...props} style={styles.priceText}>
                                        {(item.unitPrice * item.count).toFixed(2)} {order.currency.code}
                                      </Text>
                                    )}
                                    style={styles.orderItem}
                                  />
                                  {canReturnDish(item) && isManager && (
                                    <View style={styles.dishActions}>
                                      <Button
                                        mode="text"
                                        icon="undo-variant"
                                        onPress={() => handleReturnDish(item)}
                                        style={styles.returnButton}
                                        labelStyle={styles.returnButtonLabel}
                                        compact
                                      >
                                        Retourner
                                      </Button>
                                    </View>
                                  )}
                                </View>
                              ))}
                            </ScrollView>
                            
                            <View style={styles.orderActions}>
                              <ScrollView 
                                horizontal 
                                showsHorizontalScrollIndicator={false}
                                contentContainerStyle={styles.actionButtonsContainer}
                              >
                                <Button 
                                  mode="outlined" 
                                  icon="plus" 
                                  onPress={() => handleAddToExistingOrder(order)}
                                  style={styles.actionButton}
                                >
                                  Ajouter
                                </Button>
                                
                                {/* Nouveau bouton Servir */}
                                {hasReadyDishes(order) && (
                                  <Button 
                                    mode="outlined" 
                                    icon="silverware" 
                                    onPress={() => onServeReadyDishes(order)}
                                    style={[
                                      styles.actionButton, 
                                      styles.serveButton
                                    ]}
                                  >
                                    Servir {countReadyDishes(order) > 1 ? `(${countReadyDishes(order)})` : ''}
                                  </Button>
                                )}
                                
                                <Button 
                                  mode="outlined" 
                                  icon="printer" 
                                  onPress={() => onPrintTicket(order)}
                                  style={styles.actionButton}
                                >
                                  Imprimer
                                </Button>
                                {isManager && (
                                  <Button 
                                    mode="outlined" 
                                    icon="cash-register" 
                                    onPress={() => onRequestBill(order)}
                                    style={styles.actionButton}
                                  >
                                    Addition
                                  </Button>
                                )}
                              </ScrollView>
                            </View>
                          </List.Accordion>
                        </View>
                      ))}
                    </View>
                  </>
                ) : (
                  <View style={styles.emptyContainer}>
                    <Icon name="information-outline" size={32} color={theme.colors.primary} />
                    <Text style={styles.emptyText}>
                      {table.status === 'free'
                        ? 'Table libre. Créez une nouvelle commande.'
                        : 'Aucune commande active pour cette table.'}
                    </Text>
                  </View>
                )}
              </View>
            </Dialog.Content>
            
            <Dialog.Actions style={styles.actions}>
              <Button onPress={onDismiss}>Fermer</Button>
              {table.status === 'free' && (
                <Button 
                  mode="contained" 
                  onPress={() => {
                    onDismiss(); // Fermer le dialogue
                    onNewOrder(); // Appeler la fonction de création de commande
                  }}
                >
                  Créer commande
                </Button>
              )}
            </Dialog.Actions>
          </View>
        </Dialog>
      </View>
    </Portal>
  );
};

const styles = StyleSheet.create({
  dialogWrapper: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  dialog: {
    borderRadius: 12,
    marginHorizontal: 16,
    maxHeight: '90%', // Augmentation de la hauteur maximale pour plus d'espace
  },
  dialogContent: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  tableName: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  statusChip: {
    borderWidth: 1,
  },
  infoContainer: {
    marginTop: 8,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  infoLabel: {
    fontWeight: '600',
    opacity: 0.7,
  },
  infoValue: {
    fontWeight: '500',
  },
  waitersContainer: {
    flex: 1,
    alignItems: 'flex-end',
  },
  waiterChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    marginTop: 4,
  },
  waiterChip: {
    marginLeft: 4,
    marginBottom: 2,
  },
  waiterChipText: {
    fontSize: 12,
  },
  divider: {
    marginVertical: 12,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  ordersContainer: {
    maxHeight: 400,
  },
  accordionWrapper: {
    marginBottom: 8,
    borderRadius: 8,
    overflow: 'hidden',
  },
  orderAccordion: {
    backgroundColor: '#f5f5f5',
  },
  orderItemsContainer: {
    maxHeight: 300, // Hauteur maximale pour permettre le défilement
  },
  orderItem: {
    paddingLeft: 16,
  },
  dishItemContainer: {
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
    paddingBottom: 4,
    marginBottom: 4,
  },
  dishActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    paddingHorizontal: 16,
    paddingBottom: 8,
  },
  returnButton: {
    backgroundColor: '#ffebee',
    borderWidth: 1,
    borderColor: '#ffcdd2',
  },
  returnButtonLabel: {
    color: '#d32f2f',
    fontSize: 12,
  },
  orderActions: {
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  actionButtonsContainer: {
    paddingRight: 8, // Espacement supplémentaire pour le dernier bouton
  },
  actionButton: {
    marginHorizontal: 4,
    minWidth: 110, // Largeur minimale pour assurer la lisibilité
  },
  serveButton: {
    borderColor: '#4CAF50',
    borderWidth: 1.5,
  },
  priceText: {
    fontWeight: '600',
    opacity: 0.8,
  },
  emptyContainer: {
    alignItems: 'center',
    padding: 24,
  },
  emptyText: {
    textAlign: 'center',
    marginTop: 8,
    opacity: 0.7,
  },
  actions: {
    justifyContent: 'space-between',
    paddingHorizontal: 16,
  },
});