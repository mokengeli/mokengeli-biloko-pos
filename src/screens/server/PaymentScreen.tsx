// src/screens/server/PaymentScreen.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, ScrollView, Alert } from 'react-native';
import { 
  Appbar, 
  Text, 
  Card, 
  Button, 
  Divider, 
  Surface, 
  useTheme,
  TextInput,
  ActivityIndicator,
  Portal,
  Modal,
  List,
  Chip,
  Snackbar,
  HelperText
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { CommonActions } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { DomainOrderItem } from '../../api/orderService';
import orderService from '../../api/orderService';
import { usePrinter } from '../../hooks/usePrinter';
import { Dimensions } from 'react-native';
import { useAuth } from '../../contexts/AuthContext';
import { webSocketService, OrderNotification, OrderNotificationStatus } from '../../services/WebSocketService';

// Type définitions pour la navigation
type PaymentParamList = {
  PaymentScreen: {
    orderId: number;
    tableName?: string;
    selectedItems?: DomainOrderItem[];
    totalAmount: number;
    paidAmount: number; // Montant déjà payé
    remainingAmount: number; // Montant restant à payer
    currency: string;
    paymentMode: 'items' | 'amount';
    customAmount?: number; // Montant personnalisé spécifié par l'utilisateur
  };
};

type PaymentScreenRouteProp = RouteProp<PaymentParamList, 'PaymentScreen'>;
type PaymentScreenNavigationProp = StackNavigationProp<PaymentParamList, 'PaymentScreen'>;

interface PaymentScreenProps {
  navigation: PaymentScreenNavigationProp;
  route: PaymentScreenRouteProp;
}

export const PaymentScreen: React.FC<PaymentScreenProps> = ({ navigation, route }) => {
  const { 
    orderId, 
    tableName, 
    selectedItems,
    totalAmount, 
    paidAmount = 0, // Valeur par défaut à 0 si non fournie
    remainingAmount, 
    currency,
    paymentMode,
    customAmount
  } = route.params;
  
  const { user } = useAuth();
  const theme = useTheme();
  const { printDocument } = usePrinter();
  const windowWidth = Dimensions.get('window').width;
  const isTablet = windowWidth >= 768;
  
  // États
  // Initialize amountTendered based on selected items, customAmount, or remaining amount
  const initialAmount = useCallback(() => {
    if (paymentMode === 'items' && selectedItems) {
      const selectedItemsTotal = selectedItems.reduce((total, item) => 
        total + (item.unitPrice * item.count), 0);
      return Math.min(selectedItemsTotal, remainingAmount).toFixed(2);
    } else if (paymentMode === 'amount' && customAmount !== undefined) {
      // Utiliser le montant personnalisé s'il est fourni
      return customAmount.toString();
    } else {
      return remainingAmount.toFixed(2);
    }
  }, [paymentMode, selectedItems, remainingAmount, customAmount]);
  
  const [amountTendered, setAmountTendered] = useState<string>(initialAmount());
  const [paymentMethod] = useState<string>('cash'); // Pour l'instant, uniquement en espèces
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receiptModalVisible, setReceiptModalVisible] = useState(false);
  
  // États pour les notifications WebSocket
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [currentRemaining, setCurrentRemaining] = useState<number>(remainingAmount);
  const [orderChanged, setOrderChanged] = useState<boolean>(false);

  // Afficher une notification snackbar
  const showSnackbar = (message: string) => {
    setSnackbarMessage(message);
    setSnackbarVisible(true);
  };

  // Rafraîchir les données de la commande
  const refreshOrderData = useCallback(async () => {
    try {
      const updatedOrder = await orderService.getOrderById(orderId);
      
      // Calculer le montant restant
      const updatedRemaining = updatedOrder.remainingAmount !== undefined 
        ? updatedOrder.remainingAmount 
        : Math.max(0, updatedOrder.totalPrice - (updatedOrder.paidAmount || 0));
      
      // Mettre à jour l'état
      setCurrentRemaining(updatedRemaining);
      
      // Si le montant a changé, marquer la commande comme modifiée
      if (updatedRemaining !== remainingAmount) {
        setOrderChanged(true);
      }
      
      // Si la commande est entièrement payée, informer l'utilisateur
      if (updatedRemaining <= 0) {
        Alert.alert(
          "Commande entièrement payée",
          "Cette commande a été entièrement payée. Vous allez être redirigé vers l'écran d'accueil.",
          [
            {
              text: "OK",
              onPress: () => navigation.dispatch(
                CommonActions.reset({
                  index: 0,
                  routes: [{ name: 'ServerHome' }]
                })
              )
            }
          ]
        );
      }
      
      return updatedRemaining;
    } catch (err: any) {
      console.error('Error refreshing order data:', err);
      return remainingAmount; // En cas d'erreur, retourner le montant initial
    }
  }, [orderId, remainingAmount, navigation]);

  // Gestionnaire de notifications WebSocket
  const handleOrderNotification = useCallback((notification: OrderNotification) => {
    console.log('WebSocket notification received:', notification);
    
    // Ne traiter que les notifications pour cette commande
    if (notification.orderId === orderId) {
      // Utiliser le nouveau champ orderStatus pour mieux cibler les actions
      switch (notification.orderStatus) {
        case OrderNotificationStatus.PAYMENT_UPDATE:
          // Mise à jour du paiement - priorité maximale
          
          // Formater le message de notification
          const statusMessage = notification.newState
            .replace('_', ' ')
            .toLowerCase();
          
          showSnackbar(`Statut de paiement mis à jour: ${statusMessage}`);
          
          // Si la commande est maintenant entièrement payée
          if (notification.newState === 'FULLY_PAID') {
            // Vérifier d'abord que le montant restant est effectivement 0
            refreshOrderData().then(updatedRemaining => {
              if (updatedRemaining <= 0) {
                Alert.alert(
                  'Commande entièrement payée',
                  'Cette commande a été entièrement payée par un autre terminal. Vous allez être redirigé vers l\'écran d\'accueil.',
                  [
                    {
                      text: 'OK',
                      onPress: () => navigation.dispatch(
                        CommonActions.reset({
                          index: 0,
                          routes: [{ name: 'ServerHome' }]
                        })
                      )
                    }
                  ]
                );
              }
            });
          } else {
            // Rafraîchir les données pour mettre à jour le montant restant
            refreshOrderData();
          }
          break;
          
        case OrderNotificationStatus.DISH_UPDATE:
          // Mise à jour des plats (ajout, modification, rejet)
          
          // Message plus précis selon le changement d'état
          if (notification.newState === 'REJECTED') {
            showSnackbar('Un plat a été rejeté dans cette commande');
          } else if (notification.previousState === '' && notification.newState === 'PENDING') {
            showSnackbar('De nouveaux plats ont été ajoutés à la commande');
          } else {
            showSnackbar('Des modifications ont été apportées aux plats de la commande');
          }
          
          // Rafraîchir les données car le total peut avoir changé
          refreshOrderData();
          break;
          
        case OrderNotificationStatus.NEW_ORDER:
          // Traiter uniquement si pertinent pour l'écran de paiement
          // Dans ce cas, c'est probablement une erreur ou non pertinent
          break;
          
        default:
          // Pour toute autre notification concernant cette commande, rafraîchir les données
          refreshOrderData();
          break;
      }
    }
  }, [orderId, refreshOrderData, navigation, showSnackbar]);
  
  // Calculer la monnaie à rendre
  const calculateChange = (): number => {
    const tendered = parseFloat(amountTendered.replace(',', '.'));
    if (isNaN(tendered) || tendered < 0) return 0;
    
    return Math.max(0, tendered - Math.min(currentRemaining, tendered));
  };
  
  // Calculer le montant effectif à encaisser (ne pas dépasser le montant restant)
  const calculateEffectivePayment = (): number => {
    // Si on est en mode articles sélectionnés, le montant effectif est le total des articles sélectionnés
    if (paymentMode === 'items' && selectedItems) {
      const selectedItemsTotal = selectedItems.reduce((total, item) => 
        total + (item.unitPrice * item.count), 0);
      return Math.min(selectedItemsTotal, currentRemaining);
    }
    
    // Sinon, c'est basé sur le montant entré ou personnalisé
    const tendered = parseFloat(amountTendered.replace(',', '.'));
    if (isNaN(tendered) || tendered <= 0) return 0;
    
    // S'assurer que nous ne dépassons pas le montant restant à payer
    return Math.min(currentRemaining, tendered);
  };
  
  // Mettre à jour le montant reçu
  const updateAmountTendered = (value: string) => {
    // Autoriser uniquement les nombres et la virgule/point
    const numericValue = value.replace(/[^0-9.,]/g, '');
    setAmountTendered(numericValue);
  };
  
  // Définir un montant exact
  const setExactAmount = () => {
    setAmountTendered(currentRemaining.toFixed(2));
  };
  
  // Ajouter un montant prédéfini
  const addPresetAmount = (amount: number) => {
    const currentAmount = amountTendered === '' ? 0 : parseFloat(amountTendered.replace(',', '.'));
    if (isNaN(currentAmount)) return;
    
    const newAmount = (currentAmount + amount).toFixed(2);
    setAmountTendered(newAmount);
  };
  
  // Traiter le paiement
  const processPayment = async () => {
    // Vérifier si la commande a été mise à jour pendant que l'utilisateur était sur cet écran
    if (orderChanged) {
      const updatedRemaining = await refreshOrderData();
      
      if (updatedRemaining <= 0) {
        // La commande a été entièrement payée entre-temps
        return; // L'alerte est déjà affichée dans refreshOrderData
      }
      
      // Mise à jour du montant effectif
      const newEffectivePayment = calculateEffectivePayment();
      
      if (newEffectivePayment !== parseFloat(amountTendered.replace(',', '.'))) {
        Alert.alert(
          "Commande modifiée",
          `Le montant restant à payer a été mis à jour à ${updatedRemaining.toFixed(2)} ${currency}. Voulez-vous continuer avec un paiement de ${newEffectivePayment.toFixed(2)} ${currency}?`,
          [
            { text: "Annuler", style: "cancel" },
            { 
              text: "Continuer", 
              onPress: () => finalizePendingPayment(newEffectivePayment) 
            }
          ]
        );
        return;
      }
    }
    
    // Procéder au paiement normal
    const tenderedAmount = parseFloat(amountTendered.replace(',', '.'));
    const effectiveAmount = calculateEffectivePayment();
    
    // Vérifier que le montant donné est supérieur à zéro
    if (tenderedAmount <= 0) {
      Alert.alert(
        "Montant invalide",
        "Veuillez entrer un montant supérieur à zéro.",
        [{ text: "OK" }]
      );
      return;
    }
    
    finalizePendingPayment(effectiveAmount);
  };
  
  // Finaliser un paiement en attente
  const finalizePendingPayment = async (effectiveAmount: number) => {
    setIsProcessing(true);
    setError(null);
    
    try {
      // Enregistrer le paiement avec le montant effectif (limité au montant restant)
      const paymentRequest = {
        orderId: orderId,
        amount: effectiveAmount,
        paymentMethod: paymentMethod,
        notes: paymentMode === 'items' ? 'Paiement par sélection d\'articles' : 'Paiement par montant personnalisé'
      };
      
      await orderService.recordPayment(paymentRequest);
      
      // Si mode par articles, marquer les articles sélectionnés comme payés
      if (paymentMode === 'items' && selectedItems) {
        await Promise.all(
          selectedItems.map(item => orderService.markDishAsPaid(item.id))
        );
      }
      
      // Afficher la modale du reçu
      setReceiptModalVisible(true);
    } catch (err: any) {
      console.error('Error processing payment:', err);
      setError(err.message || 'Erreur lors du traitement du paiement');
      
      Alert.alert(
        "Erreur",
        err.message || 'Une erreur s\'est produite lors du traitement du paiement',
        [{ text: "OK" }]
      );
    } finally {
      setIsProcessing(false);
    }
  };
  
  // Imprimer un reçu
  const printReceipt = async () => {
    try {
      // Formater le reçu
      const receipt = `
        RESTAURANT XYZ
        -----------------------------------
        Table: ${tableName || 'N/A'}
        Commande #${orderId}
        Date: ${new Date().toLocaleString()}
        -----------------------------------
        Montant total: ${totalAmount.toFixed(2)} ${currency}
        Montant payé précédemment: ${paidAmount.toFixed(2)} ${currency}
        Montant de ce paiement: ${calculateEffectivePayment().toFixed(2)} ${currency}
        Montant reçu: ${parseFloat(amountTendered.replace(',', '.')).toFixed(2)} ${currency}
        Monnaie rendue: ${calculateChange().toFixed(2)} ${currency}
        Reste à payer: ${Math.max(0, currentRemaining - calculateEffectivePayment()).toFixed(2)} ${currency}
        -----------------------------------
        Mode de paiement: Espèces
        
        Merci de votre visite!
      `;
      
      // Imprimer le reçu
      await printDocument(receipt);
      
      // Fermer la modale et retourner à l'écran d'accueil
      setReceiptModalVisible(false);
      navigation.dispatch(
        CommonActions.reset({
          index: 0,
          routes: [{ name: 'ServerHome' }]
        })
      );
    } catch (err: any) {
      console.error('Error printing receipt:', err);
      setError(err.message || 'Erreur lors de l\'impression du reçu');
      
      Alert.alert(
        "Erreur d'impression",
        err.message || 'Une erreur s\'est produite lors de l\'impression du reçu',
        [{ text: "OK" }]
      );
    }
  };
  
  // Terminer sans imprimer
  const finishWithoutPrinting = () => {
    setReceiptModalVisible(false);
    navigation.dispatch(
      CommonActions.reset({
        index: 0,
        routes: [{ name: 'ServerHome' }]
      })
    );
  };
  
  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => navigation.goBack()} />
        <Appbar.Content 
          title="Paiement" 
          subtitle={tableName ? `Table: ${tableName}` : `Commande #${orderId}`} 
        />
      </Appbar.Header>
      
      <ScrollView style={styles.scrollView}>
        <Surface style={styles.paymentCard}>
          <Text style={styles.cardTitle}>Détails du paiement</Text>
          <Divider style={styles.divider} />
          
          <View style={styles.amountRow}>
            <Text style={styles.amountLabel}>Montant total:</Text>
            <Text style={styles.amountValue}>{totalAmount.toFixed(2)} {currency}</Text>
          </View>
          
          <View style={styles.amountRow}>
            <Text style={styles.amountLabel}>Déjà payé:</Text>
            <Text style={[styles.amountValue, { color: paidAmount > 0 ? theme.colors.success : theme.colors.text }]}>
              {paidAmount.toFixed(2)} {currency}
            </Text>
          </View>
          
          <View style={styles.amountRow}>
            <Text style={[styles.amountLabel, { fontWeight: 'bold' }]}>Reste à payer:</Text>
            <Text style={[styles.amountValue, { fontWeight: 'bold', color: theme.colors.primary }]}>
              {currentRemaining.toFixed(2)} {currency}
            </Text>
          </View>
          
          {orderChanged && (
            <View style={styles.warningContainer}>
              <Icon name="alert-circle-outline" size={16} color={theme.colors.warning} />
              <Text style={[styles.warningText, { color: theme.colors.warning }]}>
                Des modifications ont été apportées à cette commande par un autre terminal.
              </Text>
            </View>
          )}
          
          <Divider style={[styles.divider, { marginVertical: 16 }]} />
          
          <View style={styles.amountInputContainer}>
            <Text style={styles.amountInputLabel}>Montant reçu:</Text>
            <TextInput
              mode="outlined"
              value={amountTendered}
              onChangeText={updateAmountTendered}
              keyboardType="numeric"
              right={<TextInput.Affix text={currency} />}
              style={styles.amountInput}
              disabled={paymentMode === 'items'} // Désactivé en mode items
              error={false}
            />
            
            {paymentMode === 'items' && (
              <HelperText type="info" visible={true}>
                Le montant est calculé automatiquement d'après les plats sélectionnés.
              </HelperText>
            )}
            
            {parseFloat(amountTendered.replace(',', '.')) > currentRemaining && (
              <View style={styles.warningContainer}>
                <Icon name="information-outline" size={16} color={theme.colors.primary} />
                <Text style={styles.warningText}>
                  Le montant saisi dépasse le reste à payer. Seul {currentRemaining.toFixed(2)} {currency} sera encaissé.
                </Text>
              </View>
            )}
          </View>
          
          <View style={styles.quickAmountContainer}>
            <Button 
              mode="outlined" 
              onPress={setExactAmount} 
              style={styles.exactButton}
              disabled={paymentMode === 'items'} // Désactivé en mode items
            >
              Montant exact
            </Button>
            
            <View style={styles.presetAmounts}>
              <Button 
                mode="outlined" 
                onPress={() => addPresetAmount(5)} 
                style={styles.presetButton}
                disabled={paymentMode === 'items'} // Désactivé en mode items
              >+5</Button>
              <Button 
                mode="outlined" 
                onPress={() => addPresetAmount(10)} 
                style={styles.presetButton}
                disabled={paymentMode === 'items'} // Désactivé en mode items
              >+10</Button>
              <Button 
                mode="outlined" 
                onPress={() => addPresetAmount(20)} 
                style={styles.presetButton}
                disabled={paymentMode === 'items'} // Désactivé en mode items
              >+20</Button>
              <Button 
                mode="outlined" 
                onPress={() => addPresetAmount(50)} 
                style={styles.presetButton}
                disabled={paymentMode === 'items'} // Désactivé en mode items
              >+50</Button>
            </View>
          </View>
          
          <View style={styles.paymentInfoContainer}>
            <View style={styles.paymentInfoRow}>
              <Text style={styles.paymentInfoLabel}>Montant à encaisser:</Text>
              <Text style={[styles.paymentInfoValue, { color: theme.colors.success }]}>
                {calculateEffectivePayment().toFixed(2)} {currency}
              </Text>
            </View>
            
            <View style={styles.paymentInfoRow}>
              <Text style={styles.paymentInfoLabel}>À rendre:</Text>
              <Text style={[styles.paymentInfoValue, { color: theme.colors.accent }]}>
                {calculateChange().toFixed(2)} {currency}
              </Text>
            </View>
          </View>
        </Surface>
        
        {paymentMode === 'items' && selectedItems && (
          <Surface style={styles.itemsCard}>
            <Text style={styles.cardTitle}>Articles payés</Text>
            <Divider style={styles.divider} />
            
            <List.Section>
              {selectedItems.map(item => (
                <List.Item
                  key={item.id}
                  title={`${item.count}x ${item.dishName}`}
                  right={() => <Text style={styles.itemPrice}>{(item.unitPrice * item.count).toFixed(2)} {currency}</Text>}
                  left={props => <List.Icon {...props} icon="check" />}
                />
              ))}
            </List.Section>
          </Surface>
        )}
      </ScrollView>
      
      <Surface style={styles.footer}>
        <Button 
          mode="outlined"
          onPress={() => navigation.goBack()}
          style={styles.cancelButton}
          disabled={isProcessing}
        >
          Annuler
        </Button>
        
        <Button 
          mode="contained"
          onPress={processPayment}
          style={styles.payButton}
          loading={isProcessing}
          disabled={isProcessing || parseFloat(amountTendered.replace(',', '.')) <= 0 || currentRemaining <= 0}
          icon="cash-register"
        >
          {isProcessing ? 'Traitement...' : 'Valider le paiement'}
        </Button>
      </Surface>
      
      {/* Modal pour le reçu */}
      <Portal>
        <Modal
          visible={receiptModalVisible}
          onDismiss={finishWithoutPrinting}
          contentContainerStyle={styles.receiptModal}
        >
          <View style={styles.receiptModalContent}>
            <Text style={styles.receiptModalTitle}>Paiement effectué avec succès</Text>
            <Divider style={styles.modalDivider} />
            
            <View style={styles.receiptSummary}>
              <Text style={styles.receiptText}>
                Montant total: {totalAmount.toFixed(2)} {currency}
              </Text>
              <Text style={styles.receiptText}>
                Payé précédemment: {paidAmount.toFixed(2)} {currency}
              </Text>
              <Text style={styles.receiptText}>
                Ce paiement: {calculateEffectivePayment().toFixed(2)} {currency}
              </Text>
              <Text style={styles.receiptText}>
                Reste à payer: {Math.max(0, currentRemaining - calculateEffectivePayment()).toFixed(2)} {currency}
              </Text>
              <Text style={styles.receiptText}>
                Monnaie rendue: {calculateChange().toFixed(2)} {currency}
              </Text>
            </View>
            
            <View style={styles.receiptActions}>
              <Button
                mode="outlined"
                onPress={finishWithoutPrinting}
                style={styles.receiptButton}
              >
                Terminer sans imprimer
              </Button>
              
              <Button
                mode="contained"
                onPress={printReceipt}
                style={styles.printButton}
                icon="printer"
              >
                Imprimer reçu
              </Button>
            </View>
          </View>
        </Modal>
      </Portal>
      
      {/* Snackbar pour les notifications */}
      <Snackbar
        visible={snackbarVisible}
        onDismiss={() => setSnackbarVisible(false)}
        duration={3000}
        style={{ backgroundColor: theme.colors.primary }}
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
  scrollView: {
    flex: 1,
  },
  paymentCard: {
    margin: 16,
    padding: 16,
    borderRadius: 8,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  divider: {
    marginBottom: 16,
  },
  amountRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  amountLabel: {
    fontSize: 16,
    fontWeight: '500',
  },
  amountValue: {
    fontSize: 16,
    fontWeight: '500',
  },
  amountInputContainer: {
    marginBottom: 16,
  },
  amountInputLabel: {
    fontSize: 16,
    fontWeight: '500',
    marginBottom: 8,
  },
  amountInput: {
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
  quickAmountContainer: {
    marginBottom: 16,
  },
  exactButton: {
    marginBottom: 8,
  },
  presetAmounts: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    flexWrap: 'wrap',
  },
  presetButton: {
    marginBottom: 8,
    flex: 1,
    marginHorizontal: 4,
  },
  paymentInfoContainer: {
    backgroundColor: '#F5F5F5',
    padding: 16,
    borderRadius: 8,
    marginTop: 8,
  },
  paymentInfoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  paymentInfoLabel: {
    fontSize: 16,
    fontWeight: '500',
  },
  paymentInfoValue: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  itemsCard: {
    margin: 16,
    marginTop: 0,
    padding: 16,
    borderRadius: 8,
  },
  itemPrice: {
    fontWeight: 'bold',
  },
  footer: {
    backgroundColor: 'white',
    padding: 16,
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  cancelButton: {
    flex: 1,
    marginRight: 8,
  },
  payButton: {
    flex: 2,
  },
  receiptModal: {
    backgroundColor: 'white',
    margin: 20,
    borderRadius: 8,
    padding: 0,
    overflow: 'hidden',
  },
  receiptModalContent: {
    padding: 16,
  },
  receiptModalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  modalDivider: {
    marginBottom: 16,
  },
  receiptSummary: {
    marginBottom: 24,
  },
  receiptText: {
    fontSize: 16,
    marginBottom: 8,
  },
  receiptActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  receiptButton: {
    flex: 1,
    marginRight: 8,
  },
  printButton: {
    flex: 1,
  },
});

export default PaymentScreen;