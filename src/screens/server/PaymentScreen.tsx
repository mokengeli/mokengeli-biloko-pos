// src/screens/server/PaymentScreen.tsx
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
import { usePrinter } from "../../hooks/usePrinter";
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
import { usePrintManager } from "../../hooks/usePrintManager";

// Type définitions pour la navigation
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
  const { printDocument } = usePrinter();
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

  // États pour les notifications WebSocket
  const [currentNotification, setCurrentNotification] =
    useState<OrderNotification | null>(null);
  const [notificationVisible, setNotificationVisible] = useState(false);
  const [currentRemaining, setCurrentRemaining] =
    useState<number>(remainingAmount);
  const [orderChanged, setOrderChanged] = useState<boolean>(false);
  const [redirectAfterReceipt, setRedirectAfterReceipt] =
    useState<RedirectionTarget>(null);

  // NOUVEAUX ÉTATS pour ignorer les notifications pendant le traitement local
  const [isLocalProcessing, setIsLocalProcessing] = useState(false);
  const [lastProcessedPaymentTime, setLastProcessedPaymentTime] =
    useState<number>(0);

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

      if (updatedRemaining !== remainingAmount) {
        setOrderChanged(true);
      }

      return updatedRemaining;
    } catch (err: any) {
      console.error("Error refreshing order data:", err);
      return remainingAmount;
    }
  }, [orderId, remainingAmount]);

  // Gestionnaire de notifications WebSocket MODIFIÉ
  const handleOrderNotification = useCallback(
    (notification: OrderNotification) => {
      console.log("WebSocket notification received:", notification);

      // IGNORER les notifications pendant le traitement local ou juste après
      const timeSinceLastPayment = Date.now() - lastProcessedPaymentTime;
      if (isLocalProcessing || timeSinceLastPayment < 3000) {
        console.log("Ignoring notification during local processing");
        return;
      }

      // Ne traiter que les notifications pour cette commande
      if (notification.orderId === orderId) {
        // NE PAS afficher de notification si le modal de reçu est visible
        if (receiptModalVisible) {
          console.log("Receipt modal is visible, ignoring notification UI");
          refreshOrderData();
          return;
        }

        // Pour les autres cas, traiter normalement mais de manière simplifiée
        switch (notification.orderStatus) {
          case OrderNotificationStatus.PAYMENT_UPDATE:
            // Seulement rafraîchir les données, pas de snackbar
            refreshOrderData().then((updatedRemaining) => {
              // Redirection silencieuse si nécessaire
              if (
                updatedRemaining <= 0 &&
                !receiptModalVisible &&
                !isLocalProcessing
              ) {
                // Notification discrète uniquement si c'est un paiement externe
                setCurrentNotification(notification);
                setNotificationVisible(true);

                // Redirection après un délai
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
            // Rafraîchir silencieusement
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

  // Configurer la connexion WebSocket
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

  // Finaliser un paiement en attente MODIFIÉ
  const finalizePendingPayment = async (effectiveAmount: number) => {
    setIsProcessing(true);
    setError(null);
    setIsLocalProcessing(true); // MARQUER le début du traitement local
    setLastProcessedPaymentTime(Date.now()); // ENREGISTRER le timestamp

    try {
      const paymentRequest = {
        orderId: orderId,
        amount: effectiveAmount,
        paymentMethod: paymentMethod,
        notes:
          paymentMode === "items"
            ? "Paiement par sélection d'articles"
            : "Paiement par montant personnalisé",
      };

      await orderService.recordPayment(paymentRequest);

      if (paymentMode === "items" && selectedItems) {
        await Promise.all(
          selectedItems.map((item) => orderService.markDishAsPaid(item.id))
        );
      }

      // Afficher la modale du reçu
      setReceiptModalVisible(true);

      // Réinitialiser le flag après un délai
      setTimeout(() => {
        setIsLocalProcessing(false);
      }, 3000);
    } catch (err: any) {
      console.error("Error processing payment:", err);
      setError(err.message || "Erreur lors du traitement du paiement");
      setIsLocalProcessing(false); // RÉINITIALISER en cas d'erreur

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

  // Imprimer un reçu
  const printReceipt = async () => {
    try {
      const receipt = `
        RESTAURANT XYZ
        -----------------------------------
        Table: ${tableName || "N/A"}
        Commande #${orderId}
        Date: ${new Date().toLocaleString()}
        -----------------------------------
        Montant total: ${totalAmount.toFixed(2)} ${currency}
        Montant payé précédemment: ${paidAmount.toFixed(2)} ${currency}
        Montant de ce paiement: ${calculateEffectivePayment().toFixed(
          2
        )} ${currency}
        Montant reçu: ${parseFloat(amountTendered.replace(",", ".")).toFixed(
          2
        )} ${currency}
        Monnaie rendue: ${calculateChange().toFixed(2)} ${currency}
        Reste à payer: ${Math.max(
          0,
          currentRemaining - calculateEffectivePayment()
        ).toFixed(2)} ${currency}
        -----------------------------------
        Mode de paiement: Espèces
        
        Merci de votre visite!
      `;

      await printDocument(receipt);

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
    } catch (err: any) {
      console.error("Error printing receipt:", err);
      setError(err.message || "Erreur lors de l'impression du reçu");

      Alert.alert(
        "Erreur d'impression",
        err.message || "Une erreur s'est produite lors de l'impression du reçu",
        [{ text: "OK" }]
      );
    }
  };

  // Terminer sans imprimer
  const finishWithoutPrinting = () => {
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

      {/* Modal pour le reçu */}
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

      {/* Snackbar SIMPLIFIÉ - uniquement pour les notifications externes */}
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
    paddingBottom: 24, // Ajouter cet espace supplémentaire
    flexDirection: "row",
    justifyContent: "space-between",
    elevation: 8, // Ajouter une élévation pour l'ombre
    borderTopLeftRadius: 16, // Optionnel : coins arrondis
    borderTopRightRadius: 16, // Optionnel : coins arrondis
    zIndex: 10, // S'assurer qu'il est au-dessus
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
});

export default PaymentScreen;
