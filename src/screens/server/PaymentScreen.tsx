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
  Chip
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

// Type définitions pour la navigation
type PaymentParamList = {
  PaymentScreen: {
    orderId: number;
    tableName?: string;
    selectedItems?: DomainOrderItem[];
    totalAmount: number;
    paidAmount?: number; // Montant déjà payé
    remainingAmount: number; // Montant restant à payer
    currency: string;
    paymentMode: 'items' | 'amount';
    customAmount?: number;
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
  
  const theme = useTheme();
  const { printDocument } = usePrinter();
  const windowWidth = Dimensions.get('window').width;
  const isTablet = windowWidth >= 768;
  
  // États
  // Initialize amountTendered based on selected items or remaining amount
  const initialAmount = useCallback(() => {
    if (paymentMode === 'items' && selectedItems) {
      const selectedItemsTotal = selectedItems.reduce((total, item) => 
        total + (item.unitPrice * item.count), 0);
      return Math.min(selectedItemsTotal, remainingAmount).toFixed(2);
    } else {
      return remainingAmount.toFixed(2);
    }
  }, [paymentMode, selectedItems, remainingAmount]);
  
  const [amountTendered, setAmountTendered] = useState<string>(initialAmount());
  const [paymentMethod] = useState<string>('cash'); // Pour l'instant, uniquement en espèces
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receiptModalVisible, setReceiptModalVisible] = useState(false);
  
  // Calculer la monnaie à rendre
  const calculateChange = (): number => {
    const tendered = parseFloat(amountTendered.replace(',', '.'));
    if (isNaN(tendered) || tendered < 0) return 0;
    
    return Math.max(0, tendered - Math.min(remainingAmount, tendered));
  };
  
  // Calculer le montant effectif à encaisser (ne pas dépasser le montant restant)
  const calculateEffectivePayment = (): number => {
    // Si on est en mode articles sélectionnés, le montant effectif est le total des articles sélectionnés
    if (paymentMode === 'items' && selectedItems) {
      const selectedItemsTotal = selectedItems.reduce((total, item) => 
        total + (item.unitPrice * item.count), 0);
      return Math.min(selectedItemsTotal, remainingAmount);
    }
    
    // Sinon, c'est basé sur le montant entré ou personnalisé
    const tendered = parseFloat(amountTendered.replace(',', '.'));
    if (isNaN(tendered) || tendered <= 0) return 0;
    
    return Math.min(remainingAmount, tendered);
  };
  
  // Mettre à jour le montant reçu
  const updateAmountTendered = (value: string) => {
    // Autoriser uniquement les nombres et la virgule/point
    const numericValue = value.replace(/[^0-9.,]/g, '');
    setAmountTendered(numericValue);
  };
  
  // Définir un montant exact
  const setExactAmount = () => {
    setAmountTendered(remainingAmount.toFixed(2));
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
        Reste à payer: ${Math.max(0, remainingAmount - calculateEffectivePayment()).toFixed(2)} ${currency}
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
              {remainingAmount.toFixed(2)} {currency}
            </Text>
          </View>
          
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
            />
            
            {parseFloat(amountTendered.replace(',', '.')) > remainingAmount && (
              <View style={styles.warningContainer}>
                <Icon name="information-outline" size={16} color={theme.colors.primary} />
                <Text style={styles.warningText}>
                  Le montant saisi dépasse le reste à payer. Seul {remainingAmount.toFixed(2)} {currency} sera encaissé.
                </Text>
              </View>
            )}
          </View>
          
          <View style={styles.quickAmountContainer}>
            <Button mode="outlined" onPress={setExactAmount} style={styles.exactButton}>
              Montant exact
            </Button>
            
            <View style={styles.presetAmounts}>
              <Button mode="outlined" onPress={() => addPresetAmount(5)} style={styles.presetButton}>+5</Button>
              <Button mode="outlined" onPress={() => addPresetAmount(10)} style={styles.presetButton}>+10</Button>
              <Button mode="outlined" onPress={() => addPresetAmount(20)} style={styles.presetButton}>+20</Button>
              <Button mode="outlined" onPress={() => addPresetAmount(50)} style={styles.presetButton}>+50</Button>
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
          disabled={isProcessing || parseFloat(amountTendered.replace(',', '.')) <= 0}
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
                Reste à payer: {Math.max(0, remainingAmount - calculateEffectivePayment()).toFixed(2)} {currency}
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