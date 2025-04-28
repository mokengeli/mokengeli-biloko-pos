// src/screens/server/PrepareBillScreen.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, ScrollView, Alert } from 'react-native';
import { 
  Appbar, 
  Text, 
  Card, 
  Checkbox, 
  Divider, 
  Button, 
  Surface, 
  useTheme,
  ActivityIndicator,
  IconButton,
  Chip,
  DataTable
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useAuth } from '../../contexts/AuthContext';
import orderService, { DomainOrder, DomainOrderItem } from '../../api/orderService';

type PrepareBillParamList = {
  PrepareBill: {
    orderId: number;
    tableId?: string;
    tableName?: string;
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
  selected: boolean; // Pour la sélection d'articles
  discount?: number; // Remise éventuelle en pourcentage
}

// Type de répartition
type SplitType = 'total' | 'perPerson' | 'custom';

export const PrepareBillScreen: React.FC<PrepareBillScreenProps> = ({ navigation, route }) => {
  const { orderId, tableId, tableName } = route.params;
  const { user } = useAuth();
  const theme = useTheme();
  
  // États
  const [isLoading, setIsLoading] = useState(true);
  const [order, setOrder] = useState<DomainOrder | null>(null);
  const [billItems, setBillItems] = useState<BillItem[]>([]);
  const [splitType, setSplitType] = useState<SplitType>('total');
  const [numberOfPeople, setNumberOfPeople] = useState(1);
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
      // Utiliser la nouvelle méthode getOrderById pour récupérer les détails de la commande
      const targetOrder = await orderService.getOrderById(orderId);
      
      setOrder(targetOrder);
      
      // Convertir les articles de commande en articles d'addition
      const items: BillItem[] = targetOrder.items.map(item => ({
        ...item,
        selected: true, // Tous les articles sont sélectionnés par défaut
      }));
      
      setBillItems(items);
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
  
  // Calculer le total de l'addition
  const calculateTotal = useCallback(() => {
    return billItems
      .filter(item => item.selected && !['REJECTED', 'PAID'].includes(item.state))
      .reduce((total, item) => {
        const itemPrice = item.unitPrice * item.count;
        const discount = item.discount || 0;
        const discountedPrice = itemPrice * (1 - discount / 100);
        return total + discountedPrice;
      }, 0);
  }, [billItems]);
  
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
  
  // Appliquer une remise à un article
  const applyDiscount = (itemId: number, discount: number) => {
    setBillItems(prevItems => 
      prevItems.map(item => 
        item.id === itemId ? { ...item, discount } : item
      )
    );
  };
  
  // Passer à l'écran suivant (répartition ou paiement)
  const proceedToNextScreen = () => {
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
    
    // En fonction du type de répartition, naviguer vers l'écran approprié
    if (splitType === 'total') {
      // Addition totale: aller directement à l'écran de paiement
      // Créer un tableau avec une seule facture pour l'addition totale
      const bills = [{
        personId: 1,
        personName: 'Addition totale',
        amount: calculateTotal(),
        items: selectedItems
      }];
      
      navigation.navigate('PaymentScreen', {
        orderId,
        tableName,
        bills, // Passer le tableau de factures formaté correctement
        totalAmount: calculateTotal(),
        currency: order?.currency.code || 'EUR'
      });
    } else {
      // Addition divisée: aller à l'écran de répartition
      navigation.navigate('SplitBill', {
        orderId,
        tableName,
        billItems: billItems.filter(item => item.selected),
        totalAmount: calculateTotal(),
        splitType,
        numberOfPeople,
        currency: order?.currency.code || 'EUR'
      });
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
          <View style={styles.checkboxContainer}>
            <Checkbox
              status={item.selected ? 'checked' : 'unchecked'}
              onPress={() => toggleItemSelection(item.id)}
              disabled={isDisabled}
            />
          </View>
          
          <View style={styles.itemDetails}>
            <View style={styles.itemHeader}>
              <Text style={styles.itemName}>{item.count}x {item.dishName}</Text>
              <Text style={styles.itemPrice}>
                {itemTotal.toFixed(2)} {order?.currency.code}
              </Text>
            </View>
            
            {item.note && (
              <Text style={styles.itemNote}>Note: {item.note}</Text>
            )}
            
            <View style={styles.itemFooter}>
              <Chip 
                style={[
                  styles.statusChip,
                  { backgroundColor: getStatusColor(item.state) }
                ]}
                textStyle={{ color: 'white' }}
                compact
              >
                {getStatusText(item.state)}
              </Chip>
              
              {!isDisabled && (
                <Button
                  mode="text"
                  compact
                  onPress={() => {
                    // Ouvrir une boîte de dialogue pour la remise
                    Alert.prompt(
                      "Appliquer une remise",
                      "Entrez le pourcentage de remise (0-100)",
                      [
                        { text: "Annuler", style: "cancel" },
                        {
                          text: "Appliquer",
                          onPress: (value) => {
                            const discount = parseInt(value || '0', 10);
                            if (discount >= 0 && discount <= 100) {
                              applyDiscount(item.id, discount);
                            } else {
                              Alert.alert(
                                "Valeur invalide",
                                "La remise doit être comprise entre 0 et 100%"
                              );
                            }
                          }
                        }
                      ],
                      "plain-text",
                      item.discount?.toString() || "0"
                    );
                  }}
                  style={styles.discountButton}
                  labelStyle={{ fontSize: 12 }}
                >
                  {item.discount ? `Remise ${item.discount}%` : "Remise"}
                </Button>
              )}
            </View>
          </View>
        </View>
      </Card>
    );
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
            {/* En-tête avec sélection globale */}
            <Surface style={styles.selectionHeader}>
  <View style={styles.selectionHeaderContent}>
    <View style={styles.selectAllContainer}>
      <Checkbox
        status={allSelected ? 'checked' : 'unchecked'}
        onPress={toggleAllSelection}
      />
      <Text style={styles.selectAllText} numberOfLines={1} ellipsizeMode="tail">
        Tout sélectionner
      </Text>
    </View>
    
    <View style={styles.orderInfo}>
      <Text style={styles.orderIdText} numberOfLines={1}>
        #{order?.id}
      </Text>
      <Text style={styles.orderDateText} numberOfLines={1}>
        {new Date(order?.orderDate || '').toLocaleTimeString()}
      </Text>
    </View>
  </View>
</Surface>
            
            {/* Liste des articles */}
            <View style={styles.itemsContainer}>
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
            <View style={styles.splitTypeContainer}>
              <Text style={styles.splitTypeLabel}>Type d'addition:</Text>
              <View style={styles.splitTypeButtons}>
                <Button
                  mode={splitType === 'total' ? 'contained' : 'outlined'}
                  onPress={() => setSplitType('total')}
                  style={styles.splitButton}
                >
                  Totale
                </Button>
                <Button
                  mode={splitType === 'perPerson' ? 'contained' : 'outlined'}
                  onPress={() => setSplitType('perPerson')}
                  style={styles.splitButton}
                >
                  Par personne
                </Button>
                <Button
                  mode={splitType === 'custom' ? 'contained' : 'outlined'}
                  onPress={() => setSplitType('custom')}
                  style={styles.splitButton}
                >
                  Personnalisée
                </Button>
              </View>
            </View>
            
            {/* Sélecteur de nombre de personnes (visible uniquement si répartition par personne) */}
            {splitType !== 'total' && (
              <View style={styles.peopleCountContainer}>
                <Text style={styles.peopleCountLabel}>Nombre de personnes:</Text>
                <View style={styles.peopleCountControls}>
                  <IconButton
                    icon="minus"
                    size={20}
                    onPress={() => setNumberOfPeople(prev => Math.max(1, prev - 1))}
                    disabled={numberOfPeople <= 1}
                  />
                  <Text style={styles.peopleCountValue}>{numberOfPeople}</Text>
                  <IconButton
                    icon="plus"
                    size={20}
                    onPress={() => setNumberOfPeople(prev => prev + 1)}
                  />
                </View>
              </View>
            )}
            
            <Divider style={styles.divider} />
            
            {/* Récapitulatif */}
            <DataTable style={styles.summaryTable}>
              <DataTable.Row>
                <DataTable.Cell>Sous-total</DataTable.Cell>
                <DataTable.Cell numeric>
                  {calculateTotal().toFixed(2)} {order?.currency.code}
                </DataTable.Cell>
              </DataTable.Row>
              
              {/* Ici, vous pourriez ajouter d'autres lignes pour taxes, service, etc. */}
              
              <DataTable.Row>
                <DataTable.Cell style={styles.totalCell}>
                  <Text style={styles.totalText}>Total</Text>
                </DataTable.Cell>
                <DataTable.Cell numeric style={styles.totalCell}>
                  <Text style={styles.totalAmount}>
                    {calculateTotal().toFixed(2)} {order?.currency.code}
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
                onPress={proceedToNextScreen}
                style={styles.continueButton}
                icon={splitType === 'total' ? 'cash-register' : 'account-multiple'}
              >
                {splitType === 'total' ? 'Procéder au paiement' : 'Répartir l\'addition'}
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
  content: {
    flex: 1,
    display: 'flex',
    flexDirection: 'column',
  },
  selectionHeader: {
    padding: 12,
    marginBottom: 8,
    elevation: 2,
  },
  selectionHeaderContent: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  selectAllContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 3, // Donner plus d'espace au texte de sélection
  },
  selectAllText: {
    marginLeft: 8,
    fontSize: 14, // Réduire la taille de police
  },
  orderInfo: {
    flex: 2, // Donner moins d'espace mais suffisant pour le numéro de commande
    alignItems: 'flex-end',
  },
  orderIdText: {
    fontWeight: 'bold',
    fontSize: 14, // Réduire légèrement la taille
  },
  orderDateText: {
    fontSize: 12, // Réduire la taille pour la date
    opacity: 0.7,
  },
  itemsContainer: {
    padding: 16,
    paddingBottom: 150, // Espace supplémentaire pour le footer
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
    justifyContent: 'center',
    marginRight: 8,
  },
  itemDetails: {
    flex: 1,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
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
    marginTop: 4,
  },
  itemFooter: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: 8,
  },
  statusChip: {
    height: 24,
  },
  discountButton: {
    marginLeft: 8,
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
  splitTypeContainer: {
    marginBottom: 16,
  },
  splitTypeLabel: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  splitTypeButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  splitButton: {
    flex: 1,
    marginHorizontal: 4,
  },
  peopleCountContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  peopleCountLabel: {
    fontSize: 16,
  },
  peopleCountControls: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  peopleCountValue: {
    fontSize: 18,
    fontWeight: 'bold',
    marginHorizontal: 8,
    minWidth: 24,
    textAlign: 'center',
  },
  divider: {
    marginBottom: 16,
  },
  summaryTable: {
    marginBottom: 16,
  },
  totalCell: {
    height: 48,
  },
  totalText: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  totalAmount: {
    fontSize: 18,
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
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 32,
  },
  emptyText: {
    fontSize: 16,
    opacity: 0.7,
  },
});