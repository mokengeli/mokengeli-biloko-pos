// src/screens/server/PaymentScreen.tsx - VERSION AVEC IMPRESSION RÉELLE

import React, { useState, useEffect, useCallback } from "react";
import { View, StyleSheet, ScrollView, Alert } from "react-native";
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
  HelperText,
} from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { RouteProp } from "@react-navigation/native";
import { StackNavigationProp } from "@react-navigation/stack";
import { CommonActions } from "@react-navigation/native";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import { DomainOrderItem } from "../../api/orderService";
import orderService from "../../api/orderService";
// CHANGEMENT : Remplacer usePrinter par usePrintManager
import { usePrintManager } from "../../hooks/usePrintManager";
import { Dimensions } from "react-native";
import { useAuth } from "../../contexts/AuthContext";
import {
  webSocketService,
  OrderNotification,
  OrderNotificationStatus,
} from "../../services/WebSocketService";
import { NotificationSnackbar } from "../../components/common/NotificationSnackbar";
import { SnackbarContainer } from "../../components/common/SnackbarContainer";
import { getNotificationMessage } from "../../utils/notificationHelpers";

// Types pour la navigation (inchangés)
type PaymentParamList = {
  PaymentScreen: {
    orderId: number;
    tableName?: string;
    tableId: number;
    selectedItems?: DomainOrderItem[];
    totalAmount: number;
    paidAmount: number;
    remainingAmount: number;
    currency: string;
    paymentMode: "items" | "amount";
    customAmount?: number;
  };
};

type PaymentScreenRouteProp = RouteProp<PaymentParamList, "PaymentScreen">;
type PaymentScreenNavigationProp = StackNavigationProp<
  PaymentParamList,
  "PaymentScreen"
>;

interface PaymentScreenProps {
  navigation: PaymentScreenNavigationProp;
  route: PaymentScreenRouteProp;
}

type RedirectionTarget = "ServerHome" | "PrepareBill" | null;

export const PaymentScreen: React.FC<PaymentScreenProps> = ({
  navigation,
  route,
}) => {
  const {
    orderId,
    tableName,
    tableId,
    selectedItems,
    totalAmount,
    paidAmount = 0,
    remainingAmount,
    currency,
    paymentMode,
    customAmount,
  } = route.params;

  const { user } = useAuth();
  const theme = useTheme();
  
  // CHANGEMENT : Utiliser usePrintManager au lieu de usePrinter
  const { 
    printReceipt, 
    isInitialized: isPrintServiceReady,
    isLoading: isPrinting,
    error: printError 
  } = usePrintManager();
  
  const windowWidth = Dimensions.get("window").width;
  const isTablet = windowWidth >= 768;

  // États principaux
  const initialAmount = useCallback(() => {
    if (paymentMode === "items" && selectedItems) {
      const selectedItemsTotal = selectedItems.reduce(
        (total, item) => total + item.unitPrice * item.count,
        0
      );
      return Math.min(selectedItemsTotal, remainingAmount).toFixed(2);
    } else if (paymentMode === "amount" && customAmount !== undefined) {
      return customAmount.toString();
    } else {
      return remainingAmount.toFixed(2);
    }
  }, [paymentMode, selectedItems, remainingAmount, customAmount]);

  const [amountTendered, setAmountTendered] = useState<string>(initialAmount());
  const [paymentMethod] = useState<string>("cash");
  const [isProcessing, setIsProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [receiptModalVisible, setReceiptModalVisible] = useState(false);
  
  // NOUVEAUX ÉTATS pour l'impression
  const [printStatus, setPrintStatus] = useState<'idle' | 'printing' | 'success' | 'error'>('idle');
  const [currentOrder, setCurrentOrder] = useState<any>(null); // Stocker la commande pour l'impression
  const [currentPayment, setCurrentPayment] = useState<any>(null); // Stocker le paiement pour l'impression

  // États pour les notifications WebSocket (inchangés)
  const [currentNotification, setCurrentNotification] = useState<OrderNotification | null>(null);
  const [notificationVisible, setNotificationVisible] = useState(false);
  const [currentRemaining, setCurrentRemaining] = useState<number>(remainingAmount);
  const [orderChanged, setOrderChanged] = useState<boolean>(false);
  const [redirectAfterReceipt, setRedirectAfterReceipt] = useState<RedirectionTarget>(null);
  const [isLocalProcessing, setIsLocalProcessing] = useState(false);
  const [lastProcessedPaymentTime, setLastProcessedPaymentTime] = useState<number>(0);

  // ... (toutes les autres fonctions restent identiques jusqu'à finalizePendingPayment)

  // Rafraîchir les données de la commande
  const refreshOrderData = useCallback(async () => {
    try {
      const updatedOrder = await orderService.getOrderById(orderId);

      const updatedRemaining =
        updatedOrder.remainingAmount !== undefined
          ? updatedOrder.remainingAmount
          : Math.max(
              0,
              updatedOrder.totalPrice - (updatedOrder.paidAmount || 0)
            );

      setCurrentRemaining(updatedRemaining);
      setCurrentOrder(updatedOrder); // NOUVEAU : Stocker la commande

      if (updatedRemaining !== remainingAmount) {
        setOrderChanged(true);
      }

      return updatedRemaining;
    } catch (err: any) {
      console.error("Error refreshing order data:", err);
      return remainingAmount;
    }
  }, [orderId, remainingAmount]);

  // Gestionnaire de notifications WebSocket (inchangé)
  const handleOrderNotification = useCallback(
    (notification: OrderNotification) => {
      console.log("WebSocket notification received:", notification);

      const timeSinceLastPayment = Date.now() - lastProcessedPaymentTime;
      if (isLocalProcessing || timeSinceLastPayment < 3000) {
        console.log("Ignoring notification during local processing");
        return;
      }

      if (notification.orderId === orderId) {
        if (receiptModalVisible) {
          console.log("Receipt modal is visible, ignoring notification UI");
          refreshOrderData();
          return;
        }

        switch (notification.orderStatus) {
          case OrderNotificationStatus.PAYMENT_UPDATE:
            refreshOrderData().then((updatedRemaining) => {
              if (
                updatedRemaining <= 0 &&
                !receiptModalVisible &&
                !isLocalProcessing
              ) {
                setCurrentNotification(notification);
                setNotificationVisible(true);

                setTimeout(() => {
                  setRedirectAfterReceipt("ServerHome");
                  navigation.dispatch(
                    CommonActions.reset({
                      index: 0,
                      routes: [{ name: "ServerHome" }],
                    })
                  );
                }, 2000);
              }
            });
            break;

          case OrderNotificationStatus.DISH_UPDATE:
            refreshOrderData();
            break;

          default:
            refreshOrderData();
            break;
        }
      }
    },
    [
      orderId,
      refreshOrderData,
      isLocalProcessing,
      lastProcessedPaymentTime,
      receiptModalVisible,
      navigation,
    ]
  );

  // Configuration WebSocket (inchangée)
  useEffect(() => {
    if (!user?.tenantCode) return;

    webSocketService.connect(user.tenantCode).catch((error) => {
      console.error("WebSocket connection error:", error);
      setError("Erreur de connexion au service de notification en temps réel");
    });

    const unsubscribe = webSocketService.addSubscription(
      user.tenantCode,
      handleOrderNotification
    );

    return () => {
      unsubscribe();
    };
  }, [user?.tenantCode, handleOrderNotification]);

  // Calculer la monnaie à rendre
  const calculateChange = (): number => {
    const tendered = parseFloat(amountTendered.replace(",", "."));
    if (isNaN(tendered) || tendered < 0) return 0;

    return Math.max(0, tendered - Math.min(currentRemaining, tendered));
  };

  // Calculer le montant effectif à encaisser
  const calculateEffectivePayment = (): number => {
    if (paymentMode === "items" && selectedItems) {
      const selectedItemsTotal = selectedItems.reduce(
        (total, item) => total + item.unitPrice * item.count,
        0
      );
      return Math.min(selectedItemsTotal, currentRemaining);
    }

    const tendered = parseFloat(amountTendered.replace(",", "."));
    if (isNaN(tendered) || tendered <= 0) return 0;

    return Math.min(currentRemaining, tendered);
  };

  // Mettre à jour le montant reçu
  const updateAmountTendered = (value: string) => {
    const numericValue = value.replace(/[^0-9.,]/g, "");
    setAmountTendered(numericValue);
  };

  // Définir un montant exact
  const setExactAmount = () => {
    setAmountTendered(currentRemaining.toFixed(2));
  };

  // Ajouter un montant prédéfini
  const addPresetAmount = (amount: number) => {
    const currentAmount =
      amountTendered === "" ? 0 : parseFloat(amountTendered.replace(",", "."));
    if (isNaN(currentAmount)) return;

    const newAmount = (currentAmount + amount).toFixed(2);
    setAmountTendered(newAmount);
  };

  // Traiter le paiement
  const processPayment = async () => {
    if (orderChanged) {
      const updatedRemaining = await refreshOrderData();

      if (updatedRemaining <= 0) {
        Alert.alert(
          "Commande déjà payée",
          "Cette commande a été entièrement payée.",
          [{ text: "OK", onPress: () => navigation.navigate("ServerHome") }]
        );
        return;
      }

      const newEffectivePayment = calculateEffectivePayment();

      if (
        newEffectivePayment !== parseFloat(amountTendered.replace(",", "."))
      ) {
        Alert.alert(
          "Commande modifiée",
          `Le montant restant à payer a été mis à jour à ${updatedRemaining.toFixed(
            2
          )} ${currency}. Voulez-vous continuer avec un paiement de ${newEffectivePayment.toFixed(
            2
          )} ${currency}?`,
          [
            { text: "Annuler", style: "cancel" },
            {
              text: "Continuer",
              onPress: () => finalizePendingPayment(newEffectivePayment),
            },
          ]
        );
        return;
      }
    }

    const tenderedAmount = parseFloat(amountTendered.replace(",", "."));
    const effectiveAmount = calculateEffectivePayment();

    if (tenderedAmount <= 0) {
      Alert.alert(
        "Montant invalide",
        "Veuillez entrer un montant supérieur à zéro.",
        [{ text: "OK" }]
      );
      return;
    }

    const remainingAfterPayment = Math.max(
      0,
      currentRemaining - effectiveAmount
    );
    if (remainingAfterPayment <= 0) {
      setRedirectAfterReceipt("ServerHome");
    } else {
      setRedirectAfterReceipt("PrepareBill");
    }

    finalizePendingPayment(effectiveAmount);
  };

  // MODIFIÉE : Finaliser un paiement en attente
  const finalizePendingPayment = async (effectiveAmount: number) => {
    setIsProcessing(true);
    setError(null);
    setIsLocalProcessing(true);
    setLastProcessedPaymentTime(Date.now());

    try {
      const paymentRequest = {
        orderId: orderId,
        amount: effectiveAmount,
        paymentMethod: paymentMethod,
        notes:
          paymentMode === "items"
            ? "Paiement par sélection d'articles"
            : "Paiement par montant personnalisé",
        discountAmount: 0, // À ajuster si nécessaire
      };

      // Enregistrer le paiement
      await orderService.recordPayment(paymentRequest);
      
      // NOUVEAU : Stocker le paiement pour l'impression
      setCurrentPayment(paymentRequest);

      // Marquer les articles comme payés si nécessaire
      if (paymentMode === "items" && selectedItems) {
        await Promise.all(
          selectedItems.map((item) => orderService.markDishAsPaid(item.id))
        );
      }

      // Récupérer la commande mise à jour
      const updatedOrder = await orderService.getOrderById(orderId);
      setCurrentOrder(updatedOrder);

      // Afficher la modale du reçu
      setReceiptModalVisible(true);

      setTimeout(() => {
        setIsLocalProcessing(false);
      }, 3000);
    } catch (err: any) {
      console.error("Error processing payment:", err);
      setError(err.message || "Erreur lors du traitement du paiement");
      setIsLocalProcessing(false);

      Alert.alert(
        "Erreur",
        err.message ||
          "Une erreur s'est produite lors du traitement du paiement",
        [{ text: "OK" }]
      );
    } finally {
      setIsProcessing(false);
    }
  };

  // NOUVEAU : Imprimer un reçu avec le vrai service d'impression
  const printReceipt = async () => {
    if (!currentOrder || !currentPayment) {
      Alert.alert('Erreur', 'Données de paiement manquantes');
      return;
    }

    setPrintStatus('printing');

    try {
      // Vérifier si le service d'impression est prêt
      if (!isPrintServiceReady) {
        Alert.alert(
          'Service d\'impression non disponible',
          'Voulez-vous continuer sans imprimer?',
          [
            { text: 'Configurer', onPress: () => navigation.navigate('PrinterSettings' as never) },
            { text: 'Continuer', onPress: finishWithoutPrinting }
          ]
        );
        return;
      }

      // Préparer les données pour l'impression
      const receiptData = {
        orderId: currentOrder.id,
        tableName: currentOrder.tableName || tableName || 'N/A',
        items: currentOrder.items.map((item: any) => ({
          quantity: item.count,
          name: item.dishName,
          unitPrice: item.unitPrice,
          totalPrice: item.unitPrice * item.count,
          notes: item.note
        })),
        subtotal: currentOrder.totalPrice,
        tax: currentOrder.totalPrice * 0.1, // TVA 10%
        total: currentOrder.totalPrice * 1.1,
        paidAmount: parseFloat(amountTendered.replace(",", ".")),
        change: calculateChange(),
        paymentMethod: paymentMethod === 'cash' ? 'Espèces' : paymentMethod,
        serverName: user?.firstName || 'Serveur',
        restaurantInfo: {
          name: 'MOKENGELI BILOKO',
          address: '123 Rue de la Gastronomie',
          phone: '01 23 45 67 89',
          taxId: 'FR12345678901'
        }
      };

      // Lancer l'impression
      const result = await printReceipt(receiptData, {
        waitForCompletion: true,
        timeout: 10000
      });

      if (result.success) {
        setPrintStatus('success');
        
        // Petit délai pour montrer le succès
        setTimeout(() => {
          setReceiptModalVisible(false);
          
          if (redirectAfterReceipt === "ServerHome") {
            navigation.dispatch(
              CommonActions.reset({
                index: 0,
                routes: [{ name: "ServerHome" }],
              })
            );
          } else if (redirectAfterReceipt === "PrepareBill") {
            navigation.navigate("PrepareBill", {
              orderId: orderId,
              tableId: route.params.tableId,
              tableName: tableName,
            });
          }
        }, 1000);
      } else {
        throw new Error(result.error || 'Échec de l\'impression');
      }

    } catch (err: any) {
      console.error("Error printing receipt:", err);
      setPrintStatus('error');
      
      Alert.alert(
        "Erreur d'impression",
        `${err.message}\n\nVoulez-vous réessayer?`,
        [
          { text: 'Réessayer', onPress: () => printReceipt() },
          { text: 'Continuer sans imprimer', onPress: finishWithoutPrinting }
        ]
      );
    }
  };

  // Terminer sans imprimer
  const finishWithoutPrinting = () => {
    setReceiptModalVisible(false);
    setPrintStatus('idle');

    if (redirectAfterReceipt === "ServerHome") {
      navigation.dispatch(
        CommonActions.reset({
          index: 0,
          routes: [{ name: "ServerHome" }],
        })
      );
    } else if (redirectAfterReceipt === "PrepareBill") {
      navigation.navigate("PrepareBill", {
        orderId: orderId,
        tableId: route.params.tableId,
        tableName: tableName,
      });
    }
  };

  // Obtenir le texte du statut d'impression
  const getPrintStatusText = () => {
    switch (printStatus) {
      case 'printing':
        return 'Impression en cours...';
      case 'success':
        return 'Impression réussie!';
      case 'error':
        return 'Erreur d\'impression';
      default:
        return '';
    }
  };

  // Obtenir la couleur du statut d'impression
  const getPrintStatusColor = () => {
    switch (printStatus) {
      case 'success':
        return theme.colors.success;
      case 'error':
        return theme.colors.error;
      default:
        return theme.colors.primary;
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["left", "right"]}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => navigation.goBack()} />
        <Appbar.Content
          title="Paiement"
          subtitle={tableName ? `Table: ${tableName}` : `Commande #${orderId}`}
        />
      </Appbar.Header>

      <ScrollView style={styles.scrollView} contentContainerStyle={{ paddingBottom: 100 }}>
        <Surface style={styles.paymentCard}>
          <Text style={styles.cardTitle}>Détails du paiement</Text>
          <Divider style={styles.divider} />

          <View style={styles.amountRow}>
            <Text style={styles.amountLabel}>Montant total:</Text>
            <Text style={styles.amountValue}>
              {totalAmount.toFixed(2)} {currency}
            </Text>
          </View>

          <View style={styles.amountRow}>
            <Text style={styles.amountLabel}>Déjà payé:</Text>
            <Text
              style={[
                styles.amountValue,
                {
                  color:
                    paidAmount > 0 ? theme.colors.success : theme.colors.text,
                },
              ]}
            >
              {paidAmount.toFixed(2)} {currency}
            </Text>
          </View>

          <View style={styles.amountRow}>
            <Text style={[styles.amountLabel, { fontWeight: "bold" }]}>
              Reste à payer:
            </Text>
            <Text
              style={[
                styles.amountValue,
                { fontWeight: "bold", color: theme.colors.primary },
              ]}
            >
              {currentRemaining.toFixed(2)} {currency}
            </Text>
          </View>

          {orderChanged && (
            <View style={styles.warningContainer}>
              <Icon
                name="alert-circle-outline"
                size={16}
                color={theme.colors.warning}
              />
              <Text
                style={[styles.warningText, { color: theme.colors.warning }]}
              >
                Des modifications ont été apportées à cette commande par un
                autre terminal.
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
              disabled={paymentMode === "items"}
              error={false}
            />

            {paymentMode === "items" && (
              <HelperText type="info" visible={true}>
                Le montant est calculé automatiquement d'après les plats
                sélectionnés.
              </HelperText>
            )}

            {parseFloat(amountTendered.replace(",", ".")) >
              currentRemaining && (
              <View style={styles.warningContainer}>
                <Icon
                  name="information-outline"
                  size={16}
                  color={theme.colors.primary}
                />
                <Text style={styles.warningText}>
                  Le montant saisi dépasse le reste à payer. Seul{" "}
                  {currentRemaining.toFixed(2)} {currency} sera encaissé.
                </Text>
              </View>
            )}
          </View>

          <View style={styles.quickAmountContainer}>
            <Button
              mode="outlined"
              onPress={setExactAmount}
              style={styles.exactButton}
              disabled={paymentMode === "items"}
            >
              Montant exact
            </Button>

            <View style={styles.presetAmounts}>
              <Button
                mode="outlined"
                onPress={() => addPresetAmount(5)}
                style={styles.presetButton}
                disabled={paymentMode === "items"}
              >
                +5
              </Button>
              <Button
                mode="outlined"
                onPress={() => addPresetAmount(10)}
                style={styles.presetButton}
                disabled={paymentMode === "items"}
              >
                +10
              </Button>
              <Button
                mode="outlined"
                onPress={() => addPresetAmount(20)}
                style={styles.presetButton}
                disabled={paymentMode === "items"}
              >
                +20
              </Button>
              <Button
                mode="outlined"
                onPress={() => addPresetAmount(50)}
                style={styles.presetButton}
                disabled={paymentMode === "items"}
              >
                +50
              </Button>
            </View>
          </View>

          <View style={styles.paymentInfoContainer}>
            <View style={styles.paymentInfoRow}>
              <Text style={styles.paymentInfoLabel}>Montant à encaisser:</Text>
              <Text
                style={[
                  styles.paymentInfoValue,
                  { color: theme.colors.success },
                ]}
              >
                {calculateEffectivePayment().toFixed(2)} {currency}
              </Text>
            </View>

            <View style={styles.paymentInfoRow}>
              <Text style={styles.paymentInfoLabel}>À rendre:</Text>
              <Text
                style={[
                  styles.paymentInfoValue,
                  { color: theme.colors.accent },
                ]}
              >
                {calculateChange().toFixed(2)} {currency}
              </Text>
            </View>
          </View>
        </Surface>

        {paymentMode === "items" && selectedItems && (
          <Surface style={styles.itemsCard}>
            <Text style={styles.cardTitle}>Articles payés</Text>
            <Divider style={styles.divider} />

            <List.Section>
              {selectedItems.map((item) => (
                <List.Item
                  key={item.id}
                  title={`${item.count}x ${item.dishName}`}
                  right={() => (
                    <Text style={styles.itemPrice}>
                      {(item.unitPrice * item.count).toFixed(2)} {currency}
                    </Text>
                  )}
                  left={(props) => <List.Icon {...props} icon="check" />}
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
          disabled={
            isProcessing ||
            parseFloat(amountTendered.replace(",", ".")) <= 0 ||
            currentRemaining <= 0
          }
          icon="cash-register"
        >
          {isProcessing ? "Traitement..." : "Valider le paiement"}
        </Button>
      </Surface>

      {/* Modal pour le reçu MODIFIÉE */}
      <Portal>
        <Modal
          visible={receiptModalVisible}
          onDismiss={finishWithoutPrinting}
          contentContainerStyle={styles.receiptModal}
        >
          <View style={styles.receiptModalContent}>
            <Text style={styles.receiptModalTitle}>
              Paiement effectué avec succès
            </Text>
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
                Reste à payer:{" "}
                {Math.max(
                  0,
                  currentRemaining - calculateEffectivePayment()
                ).toFixed(2)}{" "}
                {currency}
              </Text>
              <Text style={styles.receiptText}>
                Monnaie rendue: {calculateChange().toFixed(2)} {currency}
              </Text>
            </View>

            {/* NOUVEAU : Statut d'impression */}
            {printStatus !== 'idle' && (
              <View style={[styles.printStatusContainer, { backgroundColor: getPrintStatusColor() + '20' }]}>
                {printStatus === 'printing' ? (
                  <ActivityIndicator size="small" color={getPrintStatusColor()} />
                ) : (
                  <Icon
                    name={printStatus === 'success' ? 'check-circle' : 'alert-circle'}
                    size={24}
                    color={getPrintStatusColor()}
                  />
                )}
                <Text style={[styles.printStatusText, { color: getPrintStatusColor() }]}>
                  {getPrintStatusText()}
                </Text>
              </View>
            )}

            <View style={styles.receiptActions}>
              <Button
                mode="outlined"
                onPress={finishWithoutPrinting}
                style={styles.receiptButton}
                disabled={printStatus === 'printing'}
              >
                Terminer sans imprimer
              </Button>

              <Button
                mode="contained"
                onPress={printReceipt}
                style={styles.printButton}
                icon="printer"
                loading={printStatus === 'printing'}
                disabled={printStatus === 'printing'}
              >
                {printStatus === 'printing' ? 'Impression...' : 'Imprimer reçu'}
              </Button>
            </View>

            {/* NOUVEAU : Lien vers configuration si pas d'imprimante */}
            {!isPrintServiceReady && (
              <Button
                mode="text"
                onPress={() => {
                  setReceiptModalVisible(false);
                  navigation.navigate('PrinterSettings' as never);
                }}
                style={styles.configureButton}
                icon="cog"
              >
                Configurer une imprimante
              </Button>
            )}
          </View>
        </Modal>
      </Portal>

      {/* Snackbar pour les notifications externes */}
      {!isLocalProcessing && !receiptModalVisible && currentNotification && (
        <SnackbarContainer bottomOffset={80}>
          <NotificationSnackbar
            notification={currentNotification}
            visible={notificationVisible}
            onDismiss={() => {
              setNotificationVisible(false);
              setCurrentNotification(null);
            }}
            duration={2000}
          />
        </SnackbarContainer>
      )}

      {/* NOUVEAU : Snackbar pour les erreurs d'impression */}
      <Snackbar
        visible={!!printError}
        onDismiss={() => {}}
        duration={5000}
        action={{
          label: 'Configurer',
          onPress: () => navigation.navigate('PrinterSettings' as never)
        }}
      >
        {printError}
      </Snackbar>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
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
    fontWeight: "bold",
    marginBottom: 12,
  },
  divider: {
    marginBottom: 16,
  },
  amountRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  amountLabel: {
    fontSize: 16,
    fontWeight: "500",
  },
  amountValue: {
    fontSize: 16,
    fontWeight: "500",
  },
  amountInputContainer: {
    marginBottom: 16,
  },
  amountInputLabel: {
    fontSize: 16,
    fontWeight: "500",
    marginBottom: 8,
  },
  amountInput: {
    backgroundColor: "transparent",
  },
  warningContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#E3F2FD",
    padding: 8,
    borderRadius: 4,
    marginTop: 8,
  },
  warningText: {
    fontSize: 12,
    marginLeft: 8,
    flex: 1,
    color: "#0066CC",
  },
  quickAmountContainer: {
    marginBottom: 16,
  },
  exactButton: {
    marginBottom: 8,
  },
  presetAmounts: {
    flexDirection: "row",
    justifyContent: "space-between",
    flexWrap: "wrap",
  },
  presetButton: {
    marginBottom: 8,
    flex: 1,
    marginHorizontal: 4,
  },
  paymentInfoContainer: {
    backgroundColor: "#F5F5F5",
    padding: 16,
    borderRadius: 8,
    marginTop: 8,
  },
  paymentInfoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: 8,
  },
  paymentInfoLabel: {
    fontSize: 16,
    fontWeight: "500",
  },
  paymentInfoValue: {
    fontSize: 18,
    fontWeight: "bold",
  },
  itemsCard: {
    margin: 16,
    marginTop: 0,
    padding: 16,
    borderRadius: 8,
  },
  itemPrice: {
    fontWeight: "bold",
  },
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "white",
    padding: 16,
    paddingBottom: 24,
    flexDirection: "row",
    justifyContent: "space-between",
    elevation: 8,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    zIndex: 10,
  },
  cancelButton: {
    flex: 1,
    marginRight: 8,
  },
  payButton: {
    flex: 2,
  },
  receiptModal: {
    backgroundColor: "white",
    margin: 20,
    borderRadius: 8,
    padding: 0,
    overflow: "hidden",
  },
  receiptModalContent: {
    padding: 16,
  },
  receiptModalTitle: {
    fontSize: 18,
    fontWeight: "bold",
    textAlign: "center",
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
    flexDirection: "row",
    justifyContent: "space-between",
  },
  receiptButton: {
    flex: 1,
    marginRight: 8,
  },
  printButton: {
    flex: 1,
  },
  // NOUVEAUX STYLES
  printStatusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  printStatusText: {
    marginLeft: 8,
    fontSize: 16,
    fontWeight: '500',
  },
  configureButton: {
    marginTop: 8,
  },
});

export default PaymentScreen;