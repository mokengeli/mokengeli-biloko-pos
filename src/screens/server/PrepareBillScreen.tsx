// src/screens/server/PrepareBillScreen.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, ScrollView, Alert } from 'react-native';
import { 
  Appbar, 
  Text, 
  Card, 
  Divider, 
  Button, 
  Surface, 
  useTheme,
  ActivityIndicator,
  IconButton,
  DataTable,
  ToggleButton,
  TextInput,
  Chip,
  Snackbar,
  TouchableRipple
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { Dimensions } from 'react-native';
import { useAuth } from '../../contexts/AuthContext';
import orderService, { DomainOrder, DomainOrderItem } from '../../api/orderService';
import { 
  webSocketService, 
  OrderNotification, 
  OrderNotificationStatus 
} from '../../services/WebSocketService';
import { NotificationSnackbar } from '../../components/common/NotificationSnackbar';
import { SnackbarContainer } from '../../components/common/SnackbarContainer';
import { getNotificationMessage } from '../../utils/notificationHelpers';

// Type définitions pour la navigation
type PrepareBillParamList = {
  PrepareBill: {
    orderId: number;
    tableId?: number;
    tableName?: string;
  };
  PaymentScreen: {
    orderId: number;
    tableName?: string;
    tableId?: number;
    selectedItems?: DomainOrderItem[];
    totalAmount: number;
    paidAmount: number; // Montant déjà payé
    remainingAmount: number; // Montant restant à payer
    currency: string;
    paymentMode: 'items' | 'amount';
    customAmount?: number;
  };
};

type PrepareBillScreenRouteProp = RouteProp<PrepareBillParamList, 'PrepareBill'>;
type PrepareBillScreenNavigationProp = StackNavigationProp<PrepareBillParamList, 'PrepareBill'>;

interface PrepareBillScreenProps {
  navigation: PrepareBillScreenNavigationProp;
  route: PrepareBillScreenRouteProp;
}

// Interface pour les éléments d'addition
interface BillItem extends DomainOrderItem {
  selected: boolean;
  discount?: number;
}

export const PrepareBillScreen: React.FC<PrepareBillScreenProps> = ({ navigation, route }) => {
  const { orderId, tableId, tableName } = route.params;
  const { user } = useAuth();
  const theme = useTheme();
  const windowWidth = Dimensions.get('window').width;
  const isTablet = windowWidth >= 768;
  
  // États
  const [isLoading, setIsLoading] = useState(true);
  const [order, setOrder] = useState<DomainOrder | null>(null);
  const [billItems, setBillItems] = useState<BillItem[]>([]);
  const [paymentMode, setPaymentMode] = useState<'items' | 'amount'>('items');
  const [customAmount, setCustomAmount] = useState('');
  const [allSelected, setAllSelected] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [orderSummaryExpanded, setOrderSummaryExpanded] = useState(false);
  
  // États pour les notifications WebSocket
  const [currentNotification, setCurrentNotification] = useState<OrderNotification | null>(null);
  const [notificationVisible, setNotificationVisible] = useState(false);
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  
  // Afficher une notification snackbar
  const showSnackbar = (message: string) => {
    setSnackbarMessage(message);
    setSnackbarVisible(true);
  };
  
  // Chargement des données de la commande
  const loadOrderDetails = useCallback(async () => {
    if (!orderId) {
      setError('ID de commande non spécifié');
      setIsLoading(false);
      return null;
    }
    
    setIsLoading(true);
    setError(null);
    
    try {
      // Récupérer les détails de la commande
      const targetOrder = await orderService.getOrderById(orderId);
      setOrder(targetOrder);
      
      // Convertir les articles de commande en articles d'addition
      const items: BillItem[] = targetOrder.items.map(item => ({
        ...item,
        selected: true // Tous les articles sont sélectionnés par défaut
      }));
      
      setBillItems(items);
      
      // Initialiser le montant personnalisé avec le montant restant à payer
      if (targetOrder.remainingAmount !== undefined) {
        setCustomAmount(targetOrder.remainingAmount.toString());
      } else {
        // Fallback au montant total si remainingAmount n'est pas disponible
        setCustomAmount(targetOrder.totalPrice.toString());
      }
      
      return targetOrder;
    } catch (err: any) {
      console.error('Error loading order details:', err);
      setError(err.message || 'Erreur lors du chargement des détails de la commande');
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [orderId]);
  
  // Gestionnaire de notifications WebSocket
  const handleOrderNotification = useCallback((notification: OrderNotification) => {
    console.log('WebSocket notification received:', notification);
    
    // Ne traiter que les notifications pour cette commande
    if (notification.orderId === orderId) {
      // Stocker la notification courante pour l'afficher
      setCurrentNotification(notification);
      setNotificationVisible(true);
      
      // Utiliser le nouveau champ orderStatus pour mieux cibler les actions
      switch (notification.orderStatus) {
        case OrderNotificationStatus.PAYMENT_UPDATE:
          // Un paiement a été effectué - priorité maximale
          
          // Messages plus détaillés et personnalisés selon le status de paiement
          if (notification.newState === 'FULLY_PAID') {
            // Vérifier le montant restant et rediriger si nécessaire
            loadOrderDetails().then(updatedOrder => {
              if ((updatedOrder?.remainingAmount || 0) <= 0) {
                Alert.alert(
                  'Commande entièrement payée',
                  'Cette commande a été entièrement payée. Vous allez être redirigé vers l\'écran d\'accueil.',
                  [
                    {
                      text: 'OK',
                      onPress: () => navigation.navigate('ServerHome')
                    }
                  ]
                );
              }
            });
          } else {
            loadOrderDetails(); // Recharger pour voir les changements
          }
          break;
          
        case OrderNotificationStatus.DISH_UPDATE:
          // Mise à jour des plats - message précis selon le changement
          loadOrderDetails(); // Recharger les détails car le total ou les articles ont changé
          break;
          
        case OrderNotificationStatus.NEW_ORDER:
          // Normalement pas pertinent sur cet écran qui traite d'une commande existante
          break;
          
        default:
          // Pour toute autre notification concernant cette commande, rafraîchir les données
          loadOrderDetails();
          break;
      }
    }
  }, [orderId, loadOrderDetails, navigation]);
  
  // Gérer l'action de la notification
  const handleNotificationAction = useCallback(() => {
    setNotificationVisible(false);
    
    // Rafraîchir les données ou naviguer selon le type de notification
    if (currentNotification) {
      loadOrderDetails();
    }
  }, [currentNotification, loadOrderDetails]);
  
  // Configurer la connexion WebSocket
  useEffect(() => {
    if (!user?.tenantCode) return;
    
    // Se connecter au WebSocket
    webSocketService.connect(user.tenantCode).catch(error => {
      console.error('WebSocket connection error:', error);
      setError('Erreur de connexion au service de notification en temps réel');
    });
    
    // S'abonner aux notifications
    const unsubscribe = webSocketService.addSubscription(
      user.tenantCode,
      handleOrderNotification
    );
    
    // Nettoyage à la destruction du composant
    return () => {
      unsubscribe();
    };
  }, [user?.tenantCode, handleOrderNotification]);
  
  // Calculer le total des articles sélectionnés
  const calculateSelectedTotal = useCallback(() => {
    return billItems
      .filter(item => item.selected && !['REJECTED', 'PAID'].includes(item.state))
      .reduce((total, item) => {
        const itemPrice = item.unitPrice * item.count;
        const discount = item.discount || 0;
        const discountedPrice = itemPrice * (1 - discount / 100);
        return total + discountedPrice;
      }, 0);
  }, [billItems]);
  
  // Calculer le montant total de la commande
  const calculateOrderTotal = useCallback((): number => {
    return order?.totalPrice || 0;
  }, [order]);

  // Calculer le montant déjà payé
  const calculatePaidAmount = useCallback((): number => {
    return order?.paidAmount || 0;
  }, [order]);

  // Calculer le montant restant à payer
  const calculateRemainingAmount = useCallback((): number => {
    const orderTotal = calculateOrderTotal();
    const paidAmount = calculatePaidAmount();
    return Math.max(0, orderTotal - paidAmount);
  }, [calculateOrderTotal, calculatePaidAmount]);
  
  // Calculer le montant personnalisé à payer (ne doit pas dépasser le montant restant)
  const calculateCustomAmount = useCallback((): number => {
    const customAmountValue = parseFloat(customAmount.replace(',', '.'));
    const remainingAmount = calculateRemainingAmount();
    
    if (isNaN(customAmountValue) || customAmountValue <= 0) {
      return 0;
    }
    
    return Math.min(customAmountValue, remainingAmount);
  }, [customAmount, calculateRemainingAmount]);
  
  // Gérer la sélection/désélection d'un article
  const toggleItemSelection = (itemId: number) => {
    setBillItems(prevItems => {
      const updatedItems = prevItems.map(item => 
        item.id === itemId ? { ...item, selected: !item.selected } : item
      );
      
      // Mettre à jour l'état de sélection globale
      const allItemsSelected = updatedItems.every(item => item.selected);
      setAllSelected(allItemsSelected);
      
      return updatedItems;
    });
  };
  
  // Gérer la sélection/désélection de tous les articles
  const toggleAllSelection = () => {
    const newAllSelected = !allSelected;
    setAllSelected(newAllSelected);
    
    setBillItems(prevItems => 
      prevItems.map(item => ({ ...item, selected: newAllSelected }))
    );
  };
  
  // Mettre à jour le montant personnalisé
  const updateCustomAmount = (value: string) => {
    // Autoriser uniquement les nombres et la virgule/point
    const numericValue = value.replace(/[^0-9.,]/g, '');
    setCustomAmount(numericValue);
  };
  
  // Passer à l'écran de paiement
  const proceedToPayment = () => {
    const remainingAmount = calculateRemainingAmount();
    
    // Si le montant restant est 0, afficher un message et ne pas continuer
    if (remainingAmount <= 0) {
      Alert.alert(
        "Commande déjà payée",
        "Cette commande a été entièrement payée.",
        [{ text: "OK", onPress: () => navigation.navigate('ServerHome') }]
      );
      return;
    }
    
    if (paymentMode === 'items') {
      // Vérifier qu'au moins un article est sélectionné
      const selectedItems = billItems.filter(item => item.selected);
      if (selectedItems.length === 0) {
        Alert.alert(
          "Aucun article sélectionné",
          "Veuillez sélectionner au moins un article pour l'addition.",
          [{ text: "OK" }]
        );
        return;
      }

      // Calculer le montant des articles sélectionnés (ne pas dépasser le montant restant)
      const selectedTotal = Math.min(calculateSelectedTotal(), remainingAmount);

      // Naviguer vers l'écran de paiement avec les articles sélectionnés
      navigation.navigate('PaymentScreen', {
        orderId,
        tableName,
        tableId,
        selectedItems,
        totalAmount: calculateOrderTotal(),
        paidAmount: calculatePaidAmount(),
        remainingAmount: remainingAmount,
        currency: order?.currency.code || 'EUR',
        paymentMode: 'items'
      });
    } else {
      // Mode montant
      const customAmountValue = calculateCustomAmount();
      
      if (customAmountValue <= 0) {
        Alert.alert(
          "Montant invalide",
          "Veuillez saisir un montant valide supérieur à 0.",
          [{ text: "OK" }]
        );
        return;
      }
      
      // Naviguer vers l'écran de paiement avec le montant personnalisé
      navigation.navigate('PaymentScreen', {
        orderId,
        tableName,
        totalAmount: calculateOrderTotal(),
        paidAmount: calculatePaidAmount(),
        remainingAmount: remainingAmount,
        currency: order?.currency.code || 'EUR',
        paymentMode: 'amount',
        customAmount: customAmountValue
      });
    }
  };
  
  // Obtenir la couleur en fonction du statut
  const getStatusColor = (status: DomainOrderItem['state']) => {
    switch (status) {
      case 'PENDING':
      case 'IN_PREPARATION':
        return '#FF9800'; // Orange
      case 'READY':
      case 'COOKED':
        return '#4CAF50'; // Vert
      case 'SERVED':
        return '#2196F3'; // Bleu
      case 'REJECTED':
        return '#F44336'; // Rouge
      case 'PAID':
        return '#9E9E9E'; // Gris
      default:
        return '#9E9E9E'; // Gris par défaut
    }
  };
  
  // Obtenir le texte du statut
  const getStatusText = (status: DomainOrderItem['state']) => {
    switch (status) {
      case 'PENDING':
        return 'En attente';
      case 'IN_PREPARATION':
        return 'En préparation';
      case 'READY':
      case 'COOKED':
        return 'Prêt';
      case 'SERVED':
        return 'Servi';
      case 'REJECTED':
        return 'Rejeté';
      case 'PAID':
        return 'Payé';
      default:
        return 'Inconnu';
    }
  };
  
  // Charger les données au chargement de l'écran
  useEffect(() => {
    loadOrderDetails();
  }, [loadOrderDetails]);
  
  // Rendu d'un article d'addition
  const renderBillItem = (item: BillItem) => {
    const isDisabled = ['REJECTED', 'PAID'].includes(item.state);
    const itemTotal = (item.unitPrice * item.count) * (1 - (item.discount || 0) / 100);
    
    return (
      <Card 
        key={item.id} 
        style={[
          styles.itemCard,
          isDisabled ? styles.disabledItemCard : null
        ]}
      >
        <View style={styles.itemCardContent}>
          {/* Checkbox avec icône pour meilleure visibilité iOS */}
          <TouchableRipple 
            onPress={() => !isDisabled && toggleItemSelection(item.id)}
            disabled={isDisabled || paymentMode === 'amount'}
            style={styles.checkboxContainer}
          >
            <Icon 
              name={item.selected ? "checkbox-marked" : "checkbox-blank-outline"} 
              size={24} 
              color={isDisabled || paymentMode === 'amount' ? theme.colors.disabled : theme.colors.primary}
              style={styles.checkboxIcon} 
            />
          </TouchableRipple>
          
          <View style={styles.itemDetails}>
            {/* En-tête avec nom et prix */}
            <View style={styles.itemHeader}>
              <Text style={styles.itemName} numberOfLines={1} ellipsizeMode="tail">
                {item.count}x {item.dishName}
              </Text>
              <Text style={styles.itemPrice}>
                {itemTotal.toFixed(2)} {order?.currency.code}
              </Text>
            </View>
            
            {/* Note (si présente) */}
            {item.note && (
              <Text style={styles.itemNote} numberOfLines={1} ellipsizeMode="tail">
                Note: {item.note}
              </Text>
            )}
            
            {/* Statut de l'article */}
            <View style={styles.itemFooter}>
              <View style={styles.statusContainer}>
                <View 
                  style={[
                    styles.statusBadge,
                    { backgroundColor: getStatusColor(item.state) }
                  ]}
                >
                  <Text style={styles.statusText}>
                    {getStatusText(item.state)}
                  </Text>
                </View>
              </View>
            </View>
          </View>
        </View>
      </Card>
    );
  };
  
  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => navigation.goBack()} />
        <Appbar.Content 
          title="Préparer l'addition" 
          subtitle={tableName ? `Table: ${tableName}` : `Commande #${orderId}`} 
        />
      </Appbar.Header>
      
      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Chargement de la commande...</Text>
        </View>
      ) : error ? (
        <Surface style={styles.errorContainer}>
          <Icon name="alert-circle-outline" size={24} color={theme.colors.error} />
          <Text style={styles.errorText}>{error}</Text>
          <Button mode="contained" onPress={loadOrderDetails} style={styles.retryButton}>
            Réessayer
          </Button>
        </Surface>
      ) : (
        <View style={styles.content}>
          <ScrollView 
            contentContainerStyle={{paddingBottom: 150}}
            showsVerticalScrollIndicator={true}
          >
            {/* Résumé de la commande avec en-tête cliquable */}
            <Surface style={styles.orderSummaryContainer}>
              <TouchableRipple
                onPress={() => setOrderSummaryExpanded(!orderSummaryExpanded)}
                style={styles.orderSummaryHeader}
              >
                <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', width: '100%' }}>
                  <Text style={styles.cardTitle}>Résumé de la commande</Text>
                  <Icon 
                    name={orderSummaryExpanded ? "chevron-up" : "chevron-down"} 
                    size={24} 
                    color={theme.colors.primary} 
                  />
                </View>
              </TouchableRipple>
              
              {orderSummaryExpanded && (
                <View style={styles.orderSummaryContent}>
                  <Divider style={styles.divider} />
                  
                  <View style={styles.orderInfoRow}>
                    <Text style={styles.orderInfoLabel}>Commande #{order?.id}</Text>
                    <Text style={styles.orderInfoValue}>{new Date(order?.orderDate || '').toLocaleDateString()}</Text>
                  </View>
                  
                  <View style={styles.orderInfoRow}>
                    <Text style={styles.orderInfoLabel}>Montant total:</Text>
                    <Text style={styles.orderInfoValue}>{calculateOrderTotal().toFixed(2)} {order?.currency.code}</Text>
                  </View>
                  
                  <View style={styles.orderInfoRow}>
                    <Text style={styles.orderInfoLabel}>Déjà payé:</Text>
                    <Text style={[
                      styles.orderInfoValue, 
                      { color: calculatePaidAmount() > 0 ? theme.colors.success : theme.colors.text }
                    ]}>
                      {calculatePaidAmount().toFixed(2)} {order?.currency.code}
                    </Text>
                  </View>
                  
                  <View style={styles.orderInfoRow}>
                    <Text style={[styles.orderInfoLabel, { fontWeight: 'bold' }]}>Reste à payer:</Text>
                    <Text style={[
                      styles.orderInfoValue, 
                      { fontWeight: 'bold', color: theme.colors.primary }
                    ]}>
                      {calculateRemainingAmount().toFixed(2)} {order?.currency.code}
                    </Text>
                  </View>
                </View>
              )}
            </Surface>
            
            {/* Sélection du mode de paiement */}
            <Surface style={styles.modeSelectionContainer}>
              <Text style={styles.modeSelectionLabel}>Mode de paiement:</Text>
              <ToggleButton.Row
                onValueChange={value => value && setPaymentMode(value as 'items' | 'amount')}
                value={paymentMode}
                style={styles.toggleRow}
              >
                <ToggleButton
                  icon="silverware-fork-knife"
                  value="items"
                  accessibilityLabel="Payer des plats spécifiques"
                />
                <ToggleButton
                  icon="cash"
                  value="amount"
                  accessibilityLabel="Payer un montant spécifique"
                />
              </ToggleButton.Row>
              <Text style={styles.modeDescription}>
                {paymentMode === 'items' 
                  ? 'Sélectionnez les plats à payer' 
                  : 'Saisissez le montant à payer'}
              </Text>
              
              {/* Section de montant personnalisé (visible uniquement en mode montant) */}
              {paymentMode === 'amount' && (
                <View style={styles.customAmountSection}>
                  <View style={styles.amountInputContainer}>
                    <Text style={styles.amountLabel}>Montant à payer:</Text>
                    <TextInput
                      mode="outlined"
                      value={customAmount}
                      onChangeText={updateCustomAmount}
                      keyboardType="numeric"
                      right={<TextInput.Affix text={order?.currency.code} />}
                      style={styles.amountInput}
                    />
                    
                    {parseFloat(customAmount.replace(',', '.')) > calculateRemainingAmount() && (
                      <View style={styles.warningContainer}>
                        <Icon name="information-outline" size={16} color={theme.colors.primary} />
                        <Text style={styles.warningText}>
                          Le montant saisi dépasse le reste à payer. Seul {calculateRemainingAmount().toFixed(2)} {order?.currency.code} sera encaissé.
                        </Text>
                      </View>
                    )}
                  </View>
                  
                  <View style={styles.amountRow}>
                    <Text style={styles.amountLabel}>Montant effectif:</Text>
                    <Text style={[styles.amountValue, { color: theme.colors.primary }]}>
                      {calculateCustomAmount().toFixed(2)} {order?.currency.code}
                    </Text>
                  </View>
                </View>
              )}
            </Surface>
            
            {/* En-tête avec sélection globale (visible uniquement en mode plats) */}
            {paymentMode === 'items' && (
              <Surface style={styles.selectionHeader}>
                <View style={styles.selectionHeaderContent}>
                  <TouchableRipple 
                    onPress={toggleAllSelection} 
                    style={styles.selectAllContainer}
                  >
                    <View style={styles.checkboxWrapper}>
                      <Icon 
                        name={allSelected ? "checkbox-marked" : "checkbox-blank-outline"} 
                        size={24} 
                        color={theme.colors.primary}
                        style={styles.checkboxIcon} 
                      />
                      <Text style={styles.selectAllText}>
                        Tout sélectionner
                      </Text>
                    </View>
                  </TouchableRipple>
                  
                  <View style={styles.orderInfo}>
                    <Text style={styles.orderIdText}>
                      #{order?.id}
                    </Text>
                    <Text style={styles.orderDateText}>
                      {new Date(order?.orderDate || '').toLocaleTimeString()}
                    </Text>
                  </View>
                </View>
              </Surface>
            )}
            
            {/* Liste des articles (visible dans les deux modes) */}
            {paymentMode === 'items' && (
              <View style={styles.itemsContainer}>
                <Text style={styles.sectionTitle}>
                  Sélectionnez les plats à payer:
                </Text>
                
                {billItems.length === 0 ? (
                  <View style={styles.emptyContainer}>
                    <Text style={styles.emptyText}>Aucun article dans cette commande</Text>
                  </View>
                ) : (
                  billItems.map(renderBillItem)
                )}
              </View>
            )}
          </ScrollView>
          
          {/* Pied avec totaux et actions */}
          <Surface style={styles.footer}>
            <DataTable style={styles.summaryTable}>
              <DataTable.Row>
                <DataTable.Cell>
                  {paymentMode === 'items' ? 'Sous-total sélectionné:' : 'Montant à payer:'}
                </DataTable.Cell>
                <DataTable.Cell numeric>
                  {paymentMode === 'items' 
                    ? `${Math.min(calculateSelectedTotal(), calculateRemainingAmount()).toFixed(2)} ${order?.currency.code}` 
                    : `${calculateCustomAmount().toFixed(2)} ${order?.currency.code}`}
                </DataTable.Cell>
              </DataTable.Row>
              
              <DataTable.Row>
                <DataTable.Cell style={styles.totalCell}>
                  <Text style={styles.totalText}>Reste à payer:</Text>
                </DataTable.Cell>
                <DataTable.Cell numeric style={styles.totalCell}>
                  <Text style={styles.totalAmount}>
                    {calculateRemainingAmount().toFixed(2)} {order?.currency.code}
                  </Text>
                </DataTable.Cell>
              </DataTable.Row>
            </DataTable>
            
            {/* Boutons d'action */}
            <View style={styles.actionButtons}>
              <Button
                mode="outlined"
                onPress={() => navigation.goBack()}
                style={styles.cancelButton}
              >
                Annuler
              </Button>
              <Button
                mode="contained"
                onPress={proceedToPayment}
                style={styles.continueButton}
                icon="cash-register"
                disabled={
                  (paymentMode === 'items' && calculateSelectedTotal() <= 0) ||
                  (paymentMode === 'amount' && calculateCustomAmount() <= 0) ||
                  calculateRemainingAmount() <= 0
                }
              >
                Procéder au paiement
              </Button>
            </View>
          </Surface>
        </View>
      )}

      {/* Snackbar pour les notifications */}
      <SnackbarContainer bottomOffset={150}>
  {currentNotification ? (
    <NotificationSnackbar
      notification={currentNotification}
      visible={notificationVisible}
      onDismiss={() => setNotificationVisible(false)}
      onAction={handleNotificationAction}
      actionLabel="Voir"
    />
  ) : snackbarVisible ? (
    <Snackbar
      visible={true}
      onDismiss={() => setSnackbarVisible(false)}
      duration={3000}
      style={{ backgroundColor: theme.colors.primary }}
      wrapperStyle={{ position: 'relative' }}
    >
      {snackbarMessage}
    </Snackbar>
  ) : null}
</SnackbarContainer>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  content: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
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
  // Résumé de la commande
  orderSummaryContainer: {
    padding: 0,
    margin: 16,
    marginBottom: 8,
    borderRadius: 8,
    overflow: 'hidden',
  },
  orderSummaryHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#F5F5F5',
  },
  orderSummaryContent: {
    padding: 16,
    paddingTop: 8,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  divider: {
    marginBottom: 16,
  },
  orderInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  orderInfoLabel: {
    fontSize: 15,
    fontWeight: '500',
  },
  orderInfoValue: {
    fontSize: 15,
  },
  // Sélection du mode
  modeSelectionContainer: {
    padding: 16,
    margin: 16,
    marginTop: 8,
    marginBottom: 8,
    borderRadius: 8,
  },
  modeSelectionLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  toggleRow: {
    alignSelf: 'flex-start',
    marginBottom: 8,
  },
  modeDescription: {
    fontSize: 14,
    opacity: 0.7,
    marginBottom: 8,
  },
  customAmountSection: {
    marginTop: 16,
    paddingTop: 16,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  amountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 12,
  },
  amountLabel: {
    fontSize: 16,
    fontWeight: '500',
  },
  amountValue: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  amountInputContainer: {
    marginBottom: 16,
  },
  amountInput: {
    marginTop: 8,
    backgroundColor: 'transparent',
  },
  warningContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#E3F2FD',
    padding: 8,
    borderRadius: 4,
    marginTop: 8,
  },
  warningText: {
    fontSize: 12,
    marginLeft: 8,
    flex: 1,
    color: '#0066CC',
  },
  selectionHeader: {
    padding: 16,
    margin: 16,
    marginTop: 8,
    borderRadius: 8,
  },
  selectionHeaderContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  selectAllContainer: {
    flexGrow: 1,
    marginRight: 8,
    borderRadius: 8,
  },
  checkboxWrapper: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 8,
  },
  checkboxIcon: {
    marginRight: 8,
  },
  selectAllText: {
    fontSize: 16,
    flexShrink: 1,
  },
  orderInfo: {
    flexShrink: 0,
    alignItems: 'flex-end',
  },
  orderIdText: {
    fontWeight: 'bold',
    fontSize: 14,
  },
  orderDateText: {
    fontSize: 12,
    opacity: 0.7,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 12,
    paddingHorizontal: 16,
  },
  itemsContainer: {
    padding: 16,
    paddingTop: 8,
    paddingBottom: 200, // Augmenté de 150 à 200 pour éviter le chevauchement avec le footer flottant
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
  },
  emptyText: {
    fontSize: 16,
    opacity: 0.7,
  },
  itemCard: {
    marginBottom: 12,
    borderRadius: 8,
  },
  disabledItemCard: {
    opacity: 0.7,
  },
  itemCardContent: {
    flexDirection: 'row',
    padding: 12,
  },
  checkboxContainer: {
    width: 40,
    alignItems: 'center',
    justifyContent: 'flex-start',
    paddingTop: 8,
  },
  itemDetails: {
    flex: 1,
    marginLeft: 8,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 6,
  },
  itemName: {
    fontSize: 16,
    fontWeight: '500',
    flex: 1,
    marginRight: 8,
  },
  itemPrice: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  itemNote: {
    fontSize: 14,
    fontStyle: 'italic',
    opacity: 0.7,
    marginBottom: 6,
  },
  itemFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  statusContainer: {
    flex: 1,
    marginRight: 8,
  },
  statusBadge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 12,
    alignSelf: 'flex-start',
    minWidth: 70,
  },
  statusText: {
    color: 'white',
    fontSize: 12,
    fontWeight: 'bold',
    textAlign: 'center',
  },
  footer: {
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: 'white',
    padding: 16,
    paddingBottom: 24, // Augmenté pour plus d'espace sur les appareils avec barre de navigation
    elevation: 8,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    zIndex: 10, // S'assurer que le footer reste au-dessus des autres éléments
  },
  summaryTable: {
    marginBottom: 16,
  },
  totalCell: {
    height: 48,
  },
  totalText: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  totalAmount: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#4CAF50',
  },
  actionButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  cancelButton: {
    flex: 1,
    marginRight: 8,
  },
  continueButton: {
    flex: 2,
  },
});

export default PrepareBillScreen;