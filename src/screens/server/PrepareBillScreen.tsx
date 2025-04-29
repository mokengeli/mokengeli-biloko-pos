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
  Chip
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { TouchableRipple } from 'react-native-paper';
import { Dimensions } from 'react-native';
import { useAuth } from '../../contexts/AuthContext';
import orderService, { DomainOrder, DomainOrderItem } from '../../api/orderService';

// Type définitions pour la navigation
type PrepareBillParamList = {
  PrepareBill: {
    orderId: number;
    tableId?: string;
    tableName?: string;
  };
  PaymentScreen: {
    orderId: number;
    tableName?: string;
    selectedItems?: DomainOrderItem[];
    totalAmount: number;
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
  
  // Chargement des données de la commande
  const loadOrderDetails = useCallback(async () => {
    if (!orderId) {
      setError('ID de commande non spécifié');
      setIsLoading(false);
      return;
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
      
      // Initialiser le montant personnalisé avec le total de la commande
      setCustomAmount(targetOrder.totalPrice.toString());
    } catch (err: any) {
      console.error('Error loading order details:', err);
      setError(err.message || 'Erreur lors du chargement des détails de la commande');
    } finally {
      setIsLoading(false);
    }
  }, [orderId]);
  
  // Charger les données au chargement de l'écran
  useEffect(() => {
    loadOrderDetails();
  }, [loadOrderDetails]);
  
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
  
  // Calculer le montant restant après paiement partiel
  const calculateRemainingAmount = useCallback(() => {
    const orderTotal = order?.totalPrice || 0;
    const customAmountValue = parseFloat(customAmount.replace(',', '.'));
    
    if (isNaN(customAmountValue) || customAmountValue <= 0) {
      return orderTotal;
    }
    
    return Math.max(0, orderTotal - customAmountValue);
  }, [order, customAmount]);
  
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

      // Naviguer vers l'écran de paiement avec les articles sélectionnés
      navigation.navigate('PaymentScreen', {
        orderId,
        tableName,
        selectedItems,
        totalAmount: calculateSelectedTotal(),
        currency: order?.currency.code || 'EUR',
        paymentMode: 'items'
      });
    } else {
      // Mode montant
      const amountValue = parseFloat(customAmount.replace(',', '.'));
      
      if (isNaN(amountValue) || amountValue <= 0) {
        Alert.alert(
          "Montant invalide",
          "Veuillez saisir un montant valide supérieur à 0.",
          [{ text: "OK" }]
        );
        return;
      }
      
      if (amountValue > (order?.totalPrice || 0)) {
        Alert.alert(
          "Montant trop élevé",
          `Le montant ne peut pas dépasser le total de la commande (${order?.totalPrice.toFixed(2)} ${order?.currency.code}).`,
          [{ text: "OK" }]
        );
        return;
      }
      
      // Naviguer vers l'écran de paiement avec le montant personnalisé
      navigation.navigate('PaymentScreen', {
        orderId,
        tableName,
        totalAmount: amountValue,
        currency: order?.currency.code || 'EUR',
        paymentMode: 'amount',
        customAmount: amountValue
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
          <ScrollView>
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
                  <View style={styles.amountRow}>
                    <Text style={styles.amountLabel}>Montant total:</Text>
                    <Text style={styles.amountValue}>
                      {order?.totalPrice.toFixed(2)} {order?.currency.code}
                    </Text>
                  </View>
                  
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
                  </View>
                  
                  <View style={styles.amountRow}>
                    <Text style={styles.amountLabel}>Restera à payer:</Text>
                    <Text style={[styles.amountValue, { color: theme.colors.primary }]}>
                      {calculateRemainingAmount().toFixed(2)} {order?.currency.code}
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
            <View style={styles.itemsContainer}>
              <Text style={styles.sectionTitle}>
                {paymentMode === 'items' ? 'Sélectionnez les plats à payer:' : 'Liste des plats:'}
              </Text>
              
              {billItems.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <Text style={styles.emptyText}>Aucun article dans cette commande</Text>
                </View>
              ) : (
                billItems.map(renderBillItem)
              )}
            </View>
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
                    ? `${calculateSelectedTotal().toFixed(2)} ${order?.currency.code}` 
                    : `${parseFloat(customAmount || '0').toFixed(2)} ${order?.currency.code}`}
                </DataTable.Cell>
              </DataTable.Row>
              
              <DataTable.Row>
                <DataTable.Cell style={styles.totalCell}>
                  <Text style={styles.totalText}>Total commande:</Text>
                </DataTable.Cell>
                <DataTable.Cell numeric style={styles.totalCell}>
                  <Text style={styles.totalAmount}>
                    {order?.totalPrice.toFixed(2)} {order?.currency.code}
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
              >
                Procéder au paiement
              </Button>
            </View>
          </Surface>
        </View>
      )}
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
  modeSelectionContainer: {
    padding: 16,
    margin: 16,
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
    marginBottom: 12,
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
  selectionHeader: {
    padding: 16,
    margin: 16,
    marginTop: 0,
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
    paddingTop: 0,
    paddingBottom: 150, // Espace pour le footer
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
    elevation: 8,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
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