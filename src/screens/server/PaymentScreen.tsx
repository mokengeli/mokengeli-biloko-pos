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
  IconButton,
  DataTable,
  TextInput,
  Chip,
  List,
  Portal,
  Modal,
  ActivityIndicator,
  Snackbar
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { CommonActions } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { DomainOrderItem } from '../../api/orderService';
import orderService from '../../api/orderService';
import { usePrinter } from '../../hooks/usePrinter';
import { NotAvailableDialog } from '../../components/common/NotAvailableDialog';

// Type définitions pour la navigation
type PaymentParamList = {
  PaymentScreen: {
    orderId: number;
    tableName?: string;
    bills: BillForPerson[];
    totalAmount: number;
    currency: string;
  };
};

type PaymentScreenRouteProp = RouteProp<PaymentParamList, 'PaymentScreen'>;
type PaymentScreenNavigationProp = StackNavigationProp<PaymentParamList, 'PaymentScreen'>;

interface PaymentScreenProps {
  navigation: PaymentScreenNavigationProp;
  route: PaymentScreenRouteProp;
}

// Interface pour les articles d'une personne
interface BillItem extends DomainOrderItem {
  selected: boolean;
  discount?: number;
}

// Interface pour l'addition d'une personne
interface BillForPerson {
  personId: number;
  personName: string;
  amount: number;
  items: BillItem[];
}

// Types de méthodes de paiement
type PaymentMethod = 'cash' | 'card' | 'mobile';

// Interface pour le paiement
interface PaymentData {
  personId: number;
  amount: number;
  amountTendered: number;
  change: number;
  paymentMethod: PaymentMethod;
  status: 'pending' | 'processing' | 'completed';
}

export const PaymentScreen: React.FC<PaymentScreenProps> = ({ navigation, route }) => {
  const { 
    orderId, 
    tableName, 
    bills, 
    totalAmount, 
    currency 
  } = route.params;
  
  const theme = useTheme();
  const { printDocument } = usePrinter();
  
  // États
  const [payments, setPayments] = useState<PaymentData[]>([]);
  const [selectedPersonId, setSelectedPersonId] = useState<number | null>(null);
  const [amountTendered, setAmountTendered] = useState<string>('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [notAvailableVisible, setNotAvailableVisible] = useState(false);
  const [notAvailableFeature, setNotAvailableFeature] = useState('');
  const [receiptModalVisible, setReceiptModalVisible] = useState(false);
  const [currentReceiptPerson, setCurrentReceiptPerson] = useState<BillForPerson | null>(null);
  const [payingAllModal, setPayingAllModal] = useState(false);
  
  // Initialiser les données de paiement
  useEffect(() => {
    // Vérification de sécurité pour éviter l'erreur
    if (!bills || !Array.isArray(bills)) {
      console.error('PaymentScreen: bills parameter is missing or not an array');
      setError('Données de facturation manquantes ou invalides');
      return;
    }
    
    const initialPayments: PaymentData[] = bills.map(bill => ({
      personId: bill.personId,
      amount: bill.amount,
      amountTendered: 0,
      change: 0,
      paymentMethod: 'cash',
      status: 'pending'
    }));
    
    setPayments(initialPayments);
    
    // Sélectionner automatiquement la première personne si une seule addition
    if (bills.length === 1) {
      setSelectedPersonId(bills[0].personId);
      setAmountTendered(bills[0].amount.toFixed(2));
    }
  }, [bills]);
  
  // Récupérer les informations d'une personne
  const getPersonInfo = (personId: number): BillForPerson | undefined => {
    if (!bills || !Array.isArray(bills)) return undefined;
    return bills.find(bill => bill.personId === personId);
  };
  
  // Récupérer les informations de paiement d'une personne
  const getPaymentInfo = (personId: number): PaymentData | undefined => {
    return payments.find(payment => payment.personId === personId);
  };
  
  // Calculer la monnaie
  const calculateChange = (personId: number, value: string): number => {
    const payment = getPaymentInfo(personId);
    if (!payment) return 0;
    
    const tendered = parseFloat(value.replace(',', '.'));
    if (isNaN(tendered) || tendered < 0) return 0;
    
    return Math.max(0, tendered - payment.amount);
  };
  
  // Mettre à jour le montant donné
  const updateAmountTendered = (value: string) => {
    if (!selectedPersonId) return;
    
    // Autoriser uniquement les nombres positifs
    const numericValue = value.replace(',', '.');
    if (numericValue === '') {
      setAmountTendered('');
      return;
    }
    
    const floatValue = parseFloat(numericValue);
    if (isNaN(floatValue) || floatValue < 0) return;
    
    setAmountTendered(numericValue);
    
    // Mettre à jour l'état du paiement
    setPayments(prev => 
      prev.map(payment => 
        payment.personId === selectedPersonId
          ? { 
              ...payment, 
              amountTendered: floatValue,
              change: Math.max(0, floatValue - payment.amount)
            }
          : payment
      )
    );
  };
  
  // Fixer un montant exact
  const setExactAmount = () => {
    if (!selectedPersonId) return;
    
    const payment = getPaymentInfo(selectedPersonId);
    if (!payment) return;
    
    const exactAmount = payment.amount.toFixed(2);
    setAmountTendered(exactAmount);
    
    // Mettre à jour l'état du paiement
    setPayments(prev => 
      prev.map(p => 
        p.personId === selectedPersonId
          ? { ...p, amountTendered: payment.amount, change: 0 }
          : p
      )
    );
  };
  
  // Ajouter un montant prédéfini
  const addPresetAmount = (amount: number) => {
    if (!selectedPersonId) return;
    
    const currentAmount = amountTendered === '' ? 0 : parseFloat(amountTendered.replace(',', '.'));
    if (isNaN(currentAmount)) return;
    
    const newAmount = (currentAmount + amount).toFixed(2);
    setAmountTendered(newAmount);
    
    // Mettre à jour l'état du paiement
    const floatValue = parseFloat(newAmount);
    const payment = getPaymentInfo(selectedPersonId);
    if (!payment) return;
    
    setPayments(prev => 
      prev.map(p => 
        p.personId === selectedPersonId
          ? { 
              ...p, 
              amountTendered: floatValue,
              change: Math.max(0, floatValue - p.amount)
            }
          : p
      )
    );
  };
  
  // Changer la méthode de paiement
  const changePaymentMethod = (method: PaymentMethod) => {
    if (method !== 'cash') {
      // Afficher le message de fonctionnalité non disponible
      setNotAvailableFeature(`Paiement par ${method === 'card' ? 'carte' : 'mobile'}`);
      setNotAvailableVisible(true);
      return;
    }
    
    setPaymentMethod(method);
    
    if (selectedPersonId) {
      // Mettre à jour la méthode de paiement pour la personne sélectionnée
      setPayments(prev => 
        prev.map(p => 
          p.personId === selectedPersonId
            ? { ...p, paymentMethod: method }
            : p
        )
      );
    }
  };
  
  // Traiter un paiement
  const processPayment = async (personId: number) => {
    const payment = getPaymentInfo(personId);
    const person = getPersonInfo(personId);
    
    if (!payment || !person) return;
    
    // Vérifier que le montant donné est suffisant
    if (payment.amountTendered < payment.amount) {
      Alert.alert(
        "Montant insuffisant",
        "Le montant fourni est inférieur au montant dû.",
        [{ text: "OK" }]
      );
      return;
    }
    
    // Mettre à jour le statut du paiement
    setPayments(prev => 
      prev.map(p => 
        p.personId === personId
          ? { ...p, status: 'processing' }
          : p
      )
    );
    
    setIsProcessing(true);
    setError(null);
    
    try {
      // Marquer les articles comme payés
      if (person.items && person.items.length > 0) {
        // Appels en parallèle pour marquer tous les articles comme payés
        await Promise.all(
          person.items.map(item => orderService.markDishAsPaid(item.id))
        );
      }
      
      // Mettre à jour le statut du paiement
      setPayments(prev => 
        prev.map(p => 
          p.personId === personId
            ? { ...p, status: 'completed' }
            : p
        )
      );
      
      // Afficher message de succès
      setSnackbarMessage(`Paiement pour ${person.personName} traité avec succès`);
      setSnackbarVisible(true);
      
      // Afficher la modale du reçu
      setCurrentReceiptPerson(person);
      setReceiptModalVisible(true);
      
      // Si tous les paiements sont complétés, nous pouvons considérer la commande comme terminée
      const allCompleted = payments
        .filter(p => p.personId !== personId)
        .every(p => p.status === 'completed');
      
      if (allCompleted) {
        // Toute la commande est payée
        setTimeout(() => {
          Alert.alert(
            "Commande complétée",
            "Tous les paiements ont été traités. La commande est terminée.",
            [
              { 
                text: "OK", 
                onPress: () => {
                  // Retourner à l'écran d'accueil
                  navigation.dispatch(
                    CommonActions.reset({
                      index: 0,
                      routes: [{ name: 'ServerHome' }]
                    })
                  );
                }
              }
            ]
          );
        }, 500);
      }
    } catch (err: any) {
      console.error('Error processing payment:', err);
      setError(err.message || 'Erreur lors du traitement du paiement');
      
      // Restaurer le statut du paiement
      setPayments(prev => 
        prev.map(p => 
          p.personId === personId
            ? { ...p, status: 'pending' }
            : p
        )
      );
      
      // Afficher message d'erreur
      setSnackbarMessage(`Erreur: ${err.message || 'Échec du traitement du paiement'}`);
      setSnackbarVisible(true);
    } finally {
      setIsProcessing(false);
    }
  };
  
  // Payer toutes les additions d'un coup
  const processAllPayments = async () => {
    const pendingPayments = payments.filter(p => p.status === 'pending');
    
    if (pendingPayments.length === 0) {
      Alert.alert(
        "Aucun paiement en attente",
        "Tous les paiements ont déjà été traités.",
        [{ text: "OK" }]
      );
      return;
    }
    
    // Calculer le montant total à payer
    const totalToPay = pendingPayments.reduce((sum, p) => sum + p.amount, 0);
    
    // Demander confirmation
    setPayingAllModal(true);
  };
  
  // Confirmer le paiement de toutes les additions
  const confirmPayAll = async (amountGiven: string) => {
    setPayingAllModal(false);
    
    const pendingPayments = payments.filter(p => p.status === 'pending');
    const totalToPay = pendingPayments.reduce((sum, p) => sum + p.amount, 0);
    
    const amountValue = parseFloat(amountGiven.replace(',', '.'));
    if (isNaN(amountValue) || amountValue < totalToPay) {
      Alert.alert(
        "Montant insuffisant",
        `Le montant donné (${amountValue}) est inférieur au montant total dû (${totalToPay.toFixed(2)}).`,
        [{ text: "OK" }]
      );
      return;
    }
    
    setIsProcessing(true);
    setError(null);
    
    try {
      // Traiter chaque paiement séquentiellement
      for (const payment of pendingPayments) {
        const person = getPersonInfo(payment.personId);
        if (!person) continue;
        
        // Mettre à jour le statut du paiement
        setPayments(prev => 
          prev.map(p => 
            p.personId === payment.personId
              ? { 
                  ...p, 
                  status: 'processing',
                  amountTendered: p.amount,
                  change: 0 
                }
              : p
          )
        );
        
        // Marquer les articles comme payés
        if (person.items && person.items.length > 0) {
          await Promise.all(
            person.items.map(item => orderService.markDishAsPaid(item.id))
          );
        }
        
        // Mettre à jour le statut du paiement
        setPayments(prev => 
          prev.map(p => 
            p.personId === payment.personId
              ? { ...p, status: 'completed' }
              : p
          )
        );
      }
      
      // Calculer la monnaie
      const change = amountValue - totalToPay;
      
      // Afficher message de succès
      setSnackbarMessage(`Tous les paiements traités avec succès. Monnaie: ${change.toFixed(2)} ${currency}`);
      setSnackbarVisible(true);
      
      // Proposer d'imprimer un reçu global
      setTimeout(() => {
        Alert.alert(
          "Paiements complétés",
          `Tous les paiements ont été traités avec succès.\nMonnaie à rendre: ${change.toFixed(2)} ${currency}`,
          [
            { 
              text: "Imprimer reçu", 
              onPress: () => printFullReceipt() 
            },
            { 
              text: "Terminer", 
              onPress: () => {
                // Retourner à l'écran d'accueil
                navigation.dispatch(
                  CommonActions.reset({
                    index: 0,
                    routes: [{ name: 'ServerHome' }]
                  })
                );
              }
            }
          ]
        );
      }, 500);
    } catch (err: any) {
      console.error('Error processing all payments:', err);
      setError(err.message || 'Erreur lors du traitement des paiements');
      
      // Afficher message d'erreur
      setSnackbarMessage(`Erreur: ${err.message || 'Échec du traitement des paiements'}`);
      setSnackbarVisible(true);
    } finally {
      setIsProcessing(false);
    }
  };
  
  // Imprimer un reçu pour une personne
  const printReceipt = async (person: BillForPerson) => {
    const payment = getPaymentInfo(person.personId);
    if (!payment) return;
    
    try {
      // Formater le reçu
      const receipt = `
        RESTAURANT XYZ
        -----------------------------------
        Table: ${tableName || 'N/A'}
        Commande #${orderId}
        Client: ${person.personName}
        Date: ${new Date().toLocaleString()}
        -----------------------------------
        Articles:
        ${person.items.map(item => 
          `${item.count}x ${item.dishName} ${(item.unitPrice * item.count).toFixed(2)} ${currency}`
        ).join('\n')}
        -----------------------------------
        Total: ${person.amount.toFixed(2)} ${currency}
        Payé: ${payment.amountTendered.toFixed(2)} ${currency}
        Monnaie: ${payment.change.toFixed(2)} ${currency}
        -----------------------------------
        Mode de paiement: ${payment.paymentMethod === 'cash' ? 'Espèces' : 
                           payment.paymentMethod === 'card' ? 'Carte' : 'Mobile'}
        
        Merci de votre visite!
      `;
      
      // Imprimer le reçu
      await printDocument(receipt);
      
      setSnackbarMessage('Reçu imprimé avec succès');
      setSnackbarVisible(true);
    } catch (err: any) {
      console.error('Error printing receipt:', err);
      setError(err.message || 'Erreur lors de l\'impression du reçu');
      
      setSnackbarMessage(`Erreur d'impression: ${err.message || 'Échec de l\'impression'}`);
      setSnackbarVisible(true);
    }
  };
  
  // Imprimer un reçu complet pour toute la commande
  const printFullReceipt = async () => {
    try {
      // Formater le reçu complet
      const completedPayments = payments.filter(p => p.status === 'completed');
      
      const receipt = `
        RESTAURANT XYZ
        -----------------------------------
        Table: ${tableName || 'N/A'}
        Commande #${orderId}
        Date: ${new Date().toLocaleString()}
        -----------------------------------
        Récapitulatif:
        ${completedPayments.map(payment => {
          const person = getPersonInfo(payment.personId);
          return `${person?.personName}: ${payment.amount.toFixed(2)} ${currency}`;
        }).join('\n')}
        -----------------------------------
        Total: ${totalAmount.toFixed(2)} ${currency}
        
        Merci de votre visite!
      `;
      
      // Imprimer le reçu
      await printDocument(receipt);
      
      setSnackbarMessage('Reçu complet imprimé avec succès');
      setSnackbarVisible(true);
    } catch (err: any) {
      console.error('Error printing full receipt:', err);
      setError(err.message || 'Erreur lors de l\'impression du reçu complet');
      
      setSnackbarMessage(`Erreur d'impression: ${err.message || 'Échec de l\'impression'}`);
      setSnackbarVisible(true);
    }
  };
  
  // Vérifier si tous les paiements sont complétés
  const allPaymentsCompleted = (): boolean => {
    return payments.every(p => p.status === 'completed');
  };
  
  // Rendu d'une personne dans la liste des paiements
  const renderPersonItem = (payment: PaymentData) => {
    const person = getPersonInfo(payment.personId);
    if (!person) return null;
    
    const isSelected = selectedPersonId === payment.personId;
    let statusColor = '#9E9E9E'; // Gris par défaut
    
    switch (payment.status) {
      case 'pending':
        statusColor = '#FFC107'; // Jaune
        break;
      case 'processing':
        statusColor = '#2196F3'; // Bleu
        break;
      case 'completed':
        statusColor = '#4CAF50'; // Vert
        break;
    }
    
    return (
      <Card 
        key={payment.personId}
        style={[
          styles.personCard,
          isSelected && styles.selectedPersonCard
        ]}
        onPress={() => {
          if (payment.status !== 'completed') {
            setSelectedPersonId(payment.personId);
            setAmountTendered(payment.amountTendered > 0 ? payment.amountTendered.toString() : '');
            setPaymentMethod(payment.paymentMethod);
          }
        }}
        disabled={payment.status === 'completed'}
      >
        <Card.Content>
          <View style={styles.personHeader}>
            <View style={styles.personInfo}>
              <Text style={styles.personName}>{person.personName}</Text>
              <Chip 
                style={[styles.statusChip, { backgroundColor: statusColor }]}
                textStyle={{ color: 'white' }}
              >
                {payment.status === 'pending' ? 'En attente' : 
                 payment.status === 'processing' ? 'En cours' : 'Payé'}
              </Chip>
            </View>
            <Text style={styles.personAmount}>
              {person.amount.toFixed(2)} {currency}
            </Text>
          </View>
          
          {payment.status === 'completed' && (
            <View style={styles.paymentDetails}>
              <Text style={styles.paymentMethod}>
                Payé par: {payment.paymentMethod === 'cash' ? 'Espèces' : 
                          payment.paymentMethod === 'card' ? 'Carte' : 'Mobile'}
              </Text>
              {payment.change > 0 && (
                <Text style={styles.changeAmount}>
                  Monnaie: {payment.change.toFixed(2)} {currency}
                </Text>
              )}
              <Button
                mode="outlined"
                icon="printer"
                onPress={() => {
                  setCurrentReceiptPerson(person);
                  setReceiptModalVisible(true);
                }}
                style={styles.receiptButton}
                compact
              >
                Reçu
              </Button>
            </View>
          )}
        </Card.Content>
      </Card>
    );
  };
  
  // Si bills est undefined, afficher une erreur
  if (!bills || !Array.isArray(bills)) {
    return (
      <SafeAreaView style={styles.container} edges={['left', 'right']}>
        <Appbar.Header>
          <Appbar.BackAction onPress={() => navigation.goBack()} />
          <Appbar.Content title="Paiement" />
        </Appbar.Header>
        
        <View style={styles.errorScreenContainer}>
          <Icon name="alert-circle-outline" size={64} color={theme.colors.error} />
          <Text style={styles.errorScreenText}>
            Données de facturation incorrectes. Veuillez retourner à l'écran précédent.
          </Text>
          <Button 
            mode="contained" 
            onPress={() => navigation.goBack()}
            style={{marginTop: 16}}
          >
            Retour
          </Button>
        </View>
      </SafeAreaView>
    );
  }
  
  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => navigation.goBack()} />
        <Appbar.Content 
          title="Paiement" 
          subtitle={tableName ? `Table: ${tableName}` : `Commande #${orderId}`} 
        />
      </Appbar.Header>
      
      <View style={styles.content}>
        {/* Liste des personnes et leurs paiements */}
        <ScrollView style={styles.peopleList}>
          {payments.map(renderPersonItem)}
        </ScrollView>
        
        {/* Section de paiement (visible uniquement si une personne est sélectionnée) */}
        {selectedPersonId !== null && (
          <Surface style={styles.paymentSection}>
            <View style={styles.paymentHeader}>
              <Text style={styles.paymentTitle}>
                Détails du paiement
              </Text>
              
              {/* Méthode de paiement */}
              <View style={styles.paymentMethodSelector}>
                <Text style={styles.methodLabel}>Mode de paiement:</Text>
                <View style={styles.methodButtons}>
                  <Button
                    mode={paymentMethod === 'cash' ? 'contained' : 'outlined'}
                    onPress={() => changePaymentMethod('cash')}
                    icon="cash"
                    style={styles.methodButton}
                  >
                    Espèces
                  </Button>
                  <Button
                    mode={paymentMethod === 'card' ? 'contained' : 'outlined'}
                    onPress={() => changePaymentMethod('card')}
                    icon="credit-card"
                    style={styles.methodButton}
                  >
                    Carte
                  </Button>
                  <Button
                    mode={paymentMethod === 'mobile' ? 'contained' : 'outlined'}
                    onPress={() => changePaymentMethod('mobile')}
                    icon="cellphone"
                    style={styles.methodButton}
                  >
                    Mobile
                  </Button>
                </View>
              </View>
              
              {/* Montant reçu (pour le paiement en espèces) */}
              {paymentMethod === 'cash' && (
                <View style={styles.amountSection}>
                  <View style={styles.amountInputContainer}>
                    <Text style={styles.amountLabel}>Montant reçu:</Text>
                    <TextInput
                      mode="outlined"
                      value={amountTendered}
                      onChangeText={updateAmountTendered}
                      keyboardType="numeric"
                      right={<TextInput.Affix text={currency} />}
                      style={styles.amountInput}
                    />
                  </View>
                  
                  <View style={styles.quickAmounts}>
                    <Button
                      mode="outlined"
                      onPress={setExactAmount}
                      style={styles.exactButton}
                    >
                      Montant exact
                    </Button>
                    <View style={styles.presetAmounts}>
                      <Button mode="outlined" onPress={() => addPresetAmount(5)} style={styles.presetButton}>+5</Button>
                      <Button mode="outlined" onPress={() => addPresetAmount(10)} style={styles.presetButton}>+10</Button>
                      <Button mode="outlined" onPress={() => addPresetAmount(20)} style={styles.presetButton}>+20</Button>
                      <Button mode="outlined" onPress={() => addPresetAmount(50)} style={styles.presetButton}>+50</Button>
                    </View>
                  </View>
                  
                  {/* Affichage de la monnaie */}
                  {getPaymentInfo(selectedPersonId)?.amountTendered !== undefined && 
                   getPaymentInfo(selectedPersonId)!.amountTendered > 0 && (
                    <View style={styles.changeContainer}>
                      <Text style={styles.changeLabel}>À rendre:</Text>
                      <Text style={styles.changeValue}>
                        {getPaymentInfo(selectedPersonId)!.change.toFixed(2)} {currency}
                      </Text>
                    </View>
                  )}
                </View>
              )}
            </View>
            
            <Divider style={styles.divider} />
            
            {/* Bouton de paiement */}
            <View style={styles.paymentActions}>
              <Button
                mode="contained"
                icon="cash-register"
                onPress={() => processPayment(selectedPersonId)}
                style={styles.payButton}
                loading={isProcessing}
                disabled={isProcessing || 
                          getPaymentInfo(selectedPersonId)?.status === 'completed' ||
                          (paymentMethod === 'cash' && 
                           getPaymentInfo(selectedPersonId)?.amountTendered !== undefined &&
                           getPaymentInfo(selectedPersonId)!.amountTendered < getPaymentInfo(selectedPersonId)!.amount)}
              >
                Valider le paiement
              </Button>
            </View>
          </Surface>
        )}
        
        {/* Section de récapitulatif et boutons d'action */}
        <Surface style={styles.summarySection}>
          <View style={styles.summaryContainer}>
            <DataTable>
              <DataTable.Row>
                <DataTable.Cell>Total payé</DataTable.Cell>
                <DataTable.Cell numeric>
                  {payments
                    .filter(p => p.status === 'completed')
                    .reduce((sum, p) => sum + p.amount, 0)
                    .toFixed(2)} {currency}
                </DataTable.Cell>
              </DataTable.Row>
              
              <DataTable.Row>
                <DataTable.Cell>Restant à payer</DataTable.Cell>
                <DataTable.Cell numeric>
                  {payments
                    .filter(p => p.status !== 'completed')
                    .reduce((sum, p) => sum + p.amount, 0)
                    .toFixed(2)} {currency}
                </DataTable.Cell>
              </DataTable.Row>
              
              <DataTable.Row>
                <DataTable.Cell style={styles.totalCell}>
                  <Text style={styles.totalText}>Total addition</Text>
                </DataTable.Cell>
                <DataTable.Cell numeric style={styles.totalCell}>
                  <Text style={styles.totalAmount}>
                    {totalAmount.toFixed(2)} {currency}
                  </Text>
                </DataTable.Cell>
              </DataTable.Row>
            </DataTable>
          </View>
          
          <View style={styles.summaryActions}>
            {!allPaymentsCompleted() && (
              <Button
                mode="contained"
                icon="cash-multiple"
                onPress={processAllPayments}
                style={styles.payAllButton}
                disabled={isProcessing}
              >
                Tout payer
              </Button>
            )}
            
            <Button
              mode="outlined"
              icon="printer"
              onPress={printFullReceipt}
              style={styles.receiptAllButton}
            >
              Imprimer reçu complet
            </Button>
            
            {allPaymentsCompleted() && (
              <Button
                mode="contained"
                icon="check"
                onPress={() => {
                  // Retourner à l'écran d'accueil
                  navigation.dispatch(
                    CommonActions.reset({
                      index: 0,
                      routes: [{ name: 'ServerHome' }]
                    })
                  );
                }}
                style={styles.finishButton}
              >
                Terminer
              </Button>
            )}
          </View>
        </Surface>
      </View>
      
      {/* Dialogue de fonctionnalité non disponible */}
      <NotAvailableDialog
        visible={notAvailableVisible}
        onDismiss={() => setNotAvailableVisible(false)}
        featureName={notAvailableFeature}
      />
      
      {/* Modale de reçu */}
      <Portal>
        <Modal
          visible={receiptModalVisible}
          onDismiss={() => setReceiptModalVisible(false)}
          contentContainerStyle={styles.receiptModal}
        >
          {currentReceiptPerson && (
            <View>
              <Text style={styles.receiptModalTitle}>Reçu pour {currentReceiptPerson.personName}</Text>
              <Divider style={styles.modalDivider} />
              
              <ScrollView style={styles.receiptContent}>
                <Text style={styles.receiptHeader}>RESTAURANT XYZ</Text>
                <Text style={styles.receiptSubtitle}>
                  Table: {tableName || 'N/A'} - Commande #{orderId}
                </Text>
                <Text style={styles.receiptSubtitle}>
                  Date: {new Date().toLocaleString()}
                </Text>
                <Divider style={styles.receiptDivider} />
                
                <Text style={styles.receiptSubheader}>Articles:</Text>
                {currentReceiptPerson.items.map(item => (
                  <View key={item.id} style={styles.receiptItem}>
                    <View style={styles.receiptItemDetail}>
                      <Text>{item.count}x {item.dishName}</Text>
                      {item.discount && item.discount > 0 && (
                        <Text style={styles.discountText}>Remise: {item.discount}%</Text>
                      )}
                    </View>
                    <Text style={styles.receiptItemPrice}>
                      {((item.unitPrice * item.count) * (1 - (item.discount || 0) / 100)).toFixed(2)} {currency}
                    </Text>
                  </View>
                ))}
                
                <Divider style={styles.receiptDivider} />
                
                <View style={styles.receiptTotal}>
                  <Text style={styles.receiptTotalLabel}>Total:</Text>
                  <Text style={styles.receiptTotalValue}>
                    {currentReceiptPerson.amount.toFixed(2)} {currency}
                  </Text>
                </View>
                
                {getPaymentInfo(currentReceiptPerson.personId) && (
                  <>
                    <View style={styles.receiptDetail}>
                      <Text>Payé:</Text>
                      <Text>
                        {getPaymentInfo(currentReceiptPerson.personId)?.amountTendered.toFixed(2)} {currency}
                      </Text>
                    </View>
                    
                    <View style={styles.receiptDetail}>
                      <Text>Monnaie:</Text>
                      <Text>
                        {getPaymentInfo(currentReceiptPerson.personId)?.change.toFixed(2)} {currency}
                      </Text>
                    </View>
                    
                    <View style={styles.receiptDetail}>
                      <Text>Mode de paiement:</Text>
                      <Text>
                        {getPaymentInfo(currentReceiptPerson.personId)?.paymentMethod === 'cash' ? 'Espèces' : 
                         getPaymentInfo(currentReceiptPerson.personId)?.paymentMethod === 'card' ? 'Carte' : 'Mobile'}
                      </Text>
                    </View>
                  </>
                )}
                
                <Divider style={styles.receiptDivider} />
                
                <Text style={styles.receiptFooter}>Merci de votre visite!</Text>
              </ScrollView>
              
              <View style={styles.receiptActions}>
                <Button
                  mode="outlined"
                  onPress={() => setReceiptModalVisible(false)}
                  style={styles.receiptButton}
                >
                  Fermer
                </Button>
                <Button
                  mode="contained"
                  icon="printer"
                  onPress={() => {
                    printReceipt(currentReceiptPerson);
                    setReceiptModalVisible(false);
                  }}
                  style={styles.receiptPrintButton}
                >
                  Imprimer
                </Button>
              </View>
            </View>
          )}
        </Modal>
      </Portal>
      
      {/* Modale de paiement de toutes les additions */}
      <Portal>
        <Modal
          visible={payingAllModal}
          onDismiss={() => setPayingAllModal(false)}
          contentContainerStyle={styles.payAllModal}
        >
          <View>
            <Text style={styles.payAllModalTitle}>Payer toutes les additions</Text>
            <Divider style={styles.modalDivider} />
            
            <View style={styles.payAllContent}>
              <Text style={styles.payAllInstructions}>
                Montant total à payer:
              </Text>
              <Text style={styles.payAllAmount}>
                {payments
                  .filter(p => p.status === 'pending')
                  .reduce((sum, p) => sum + p.amount, 0)
                  .toFixed(2)} {currency}
              </Text>
              
              <TextInput
                label="Montant reçu"
                keyboardType="numeric"
                onChangeText={(text) => {
                  // State local
                  payAllInputValue = text;
                }}
                right={<TextInput.Affix text={currency} />}
                style={styles.payAllInput}
              />
            </View>
            
            <View style={styles.payAllActions}>
              <Button
                mode="outlined"
                onPress={() => setPayingAllModal(false)}
                style={styles.payAllCancelButton}
              >
                Annuler
              </Button>
              <Button
                mode="contained"
                onPress={() => confirmPayAll(payAllInputValue || '0')}
                style={styles.payAllConfirmButton}
              >
                Confirmer
              </Button>
            </View>
          </View>
        </Modal>
      </Portal>
      
      {/* Snackbar pour les messages */}
      <Snackbar
        visible={snackbarVisible}
        onDismiss={() => setSnackbarVisible(false)}
        duration={3000}
        style={error ? styles.errorSnackbar : styles.successSnackbar}
      >
        {snackbarMessage}
      </Snackbar>
    </SafeAreaView>
  );
};

// Variable pour stocker la valeur d'entrée du paiement groupé
let payAllInputValue = '';

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
  peopleList: {
    flex: 1,
    padding: 16,
  },
  personCard: {
    marginBottom: 12,
    borderRadius: 8,
  },
  selectedPersonCard: {
    borderColor: '#2196F3',
    borderWidth: 2,
  },
  personHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  personInfo: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  personName: {
    fontSize: 16,
    fontWeight: 'bold',
    marginRight: 8,
  },
  statusChip: {
    height: 24,
  },
  personAmount: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  paymentDetails: {
    marginTop: 8,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  paymentMethod: {
    fontSize: 14,
  },
  changeAmount: {
    fontSize: 14,
    marginTop: 4,
  },
  receiptButton: {
    marginTop: 8,
    alignSelf: 'flex-end',
  },
  paymentSection: {
    padding: 16,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    elevation: 4,
  },
  paymentHeader: {
    marginBottom: 16,
  },
  paymentTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  paymentMethodSelector: {
    marginBottom: 16,
  },
  methodLabel: {
    fontSize: 16,
    marginBottom: 8,
  },
  methodButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  methodButton: {
    flex: 1,
    marginHorizontal: 4,
  },
  amountSection: {
    marginTop: 8,
  },
  amountInputContainer: {
    marginBottom: 12,
  },
  amountLabel: {
    fontSize: 16,
    marginBottom: 8,
  },
  amountInput: {
    backgroundColor: 'transparent',
  },
  quickAmounts: {
    marginTop: 8,
  },
  exactButton: {
    marginBottom: 8,
  },
  presetAmounts: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  presetButton: {
    flex: 1,
    marginHorizontal: 4,
  },
  changeContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 16,
    padding: 12,
    backgroundColor: '#E3F2FD',
    borderRadius: 8,
  },
  changeLabel: {
    fontSize: 16,
  },
  changeValue: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#2196F3',
  },
  divider: {
    marginVertical: 12,
  },
  paymentActions: {
    alignItems: 'center',
  },
  payButton: {
    width: '80%',
    height: 50,
    justifyContent: 'center',
  },
  summarySection: {
    padding: 16,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    elevation: 8,
  },
  summaryContainer: {
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
  summaryActions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    justifyContent: 'space-between',
  },
  payAllButton: {
    flex: 1,
    marginRight: 8,
  },
  receiptAllButton: {
    flex: 1,
  },
  finishButton: {
    flex: 1,
    backgroundColor: '#4CAF50',
  },
  receiptModal: {
    backgroundColor: 'white',
    margin: 20,
    borderRadius: 12,
    padding: 20,
    maxHeight: '80%',
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
  receiptContent: {
    maxHeight: 400,
  },
  receiptHeader: {
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  receiptSubtitle: {
    fontSize: 14,
    textAlign: 'center',
    marginBottom: 4,
  },
  receiptDivider: {
    marginVertical: 12,
  },
  receiptSubheader: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  receiptItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  receiptItemDetail: {
    flex: 1,
  },
  discountText: {
    fontSize: 12,
    color: '#F44336',
    fontStyle: 'italic',
  },
  receiptItemPrice: {
    fontWeight: 'bold',
  },
  receiptTotal: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginVertical: 8,
  },
  receiptTotalLabel: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  receiptTotalValue: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  receiptDetail: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 4,
  },
  receiptFooter: {
    fontSize: 14,
    textAlign: 'center',
    marginTop: 16,
    fontStyle: 'italic',
  },
  receiptActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 16,
  },
  receiptPrintButton: {
    flex: 2,
    marginLeft: 8,
  },
  payAllModal: {
    backgroundColor: 'white',
    margin: 20,
    borderRadius: 12,
    padding: 20,
  },
  payAllModalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 8,
  },
  payAllContent: {
    marginBottom: 16,
  },
  payAllInstructions: {
    fontSize: 16,
    marginBottom: 8,
  },
  payAllAmount: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#4CAF50',
    textAlign: 'center',
    marginBottom: 16,
  },
  payAllInput: {
    backgroundColor: 'transparent',
  },
  payAllActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  payAllCancelButton: {
    flex: 1,
    marginRight: 8,
  },
  payAllConfirmButton: {
    flex: 2,
  },
  successSnackbar: {
    backgroundColor: '#4CAF50',
  },
  errorSnackbar: {
    backgroundColor: '#F44336',
  },
  errorScreenContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  errorScreenText: {
    fontSize: 16,
    textAlign: 'center',
    marginTop: 16,
    color: '#D32F2F',
  },
});