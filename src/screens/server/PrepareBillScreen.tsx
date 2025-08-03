// src/screens/server/PrepareBillScreen.tsx
import React, { useState, useEffect, useCallback } from "react";
import { View, StyleSheet, ScrollView, Alert } from "react-native";
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
  TouchableRipple,
} from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { RouteProp } from "@react-navigation/native";
import { StackNavigationProp } from "@react-navigation/stack";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import { Dimensions } from "react-native";
import { useAuth } from "../../contexts/AuthContext";
import orderService, {
  DomainOrder,
  DomainOrderItem,
} from "../../api/orderService";
import {
  webSocketService,
  OrderNotification,
  OrderNotificationStatus,
} from "../../services/WebSocketService";

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
    paidAmount: number;
    remainingAmount: number;
    currency: string;
    paymentMode: "items" | "amount";
    customAmount?: number;
  };
  CloseWithDebt: {
    orderId: number;
    tableName: string;
    tableId: number;
    remainingAmount: number;
    currency: string;
  };
  ServerHome: undefined;
};

type PrepareBillScreenRouteProp = RouteProp<
  PrepareBillParamList,
  "PrepareBill"
>;
type PrepareBillScreenNavigationProp = StackNavigationProp<
  PrepareBillParamList,
  "PrepareBill"
>;

interface PrepareBillScreenProps {
  navigation: PrepareBillScreenNavigationProp;
  route: PrepareBillScreenRouteProp;
}

// Interface pour les éléments d'addition
interface BillItem extends DomainOrderItem {
  selected: boolean;
  discount?: number;
}

export const PrepareBillScreen: React.FC<PrepareBillScreenProps> = ({
  navigation,
  route,
}) => {
  const { orderId, tableId, tableName } = route.params;
  const { user } = useAuth();
  const theme = useTheme();
  const windowWidth = Dimensions.get("window").width;
  const isTablet = windowWidth >= 768;

  // États principaux
  const [isLoading, setIsLoading] = useState(true);
  const [order, setOrder] = useState<DomainOrder | null>(null);
  const [billItems, setBillItems] = useState<BillItem[]>([]);
  const [paymentMode, setPaymentMode] = useState<"items" | "amount">("items");
  const [customAmount, setCustomAmount] = useState("");
  const [allSelected, setAllSelected] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [orderSummaryExpanded, setOrderSummaryExpanded] = useState(false);

  // NOUVEL ÉTAT pour indiquer qu'on navigue vers le paiement
  const [isNavigatingToPayment, setIsNavigatingToPayment] = useState(false);

  // Chargement des données de la commande
  const loadOrderDetails = useCallback(async () => {
    if (!orderId) {
      setError("ID de commande non spécifié");
      setIsLoading(false);
      return null;
    }

    setIsLoading(true);
    setError(null);

    try {
      const targetOrder = await orderService.getOrderById(orderId);
      setOrder(targetOrder);

      const items: BillItem[] = targetOrder.items.map((item) => ({
        ...item,
        selected: true,
      }));

      setBillItems(items);

      if (targetOrder.remainingAmount !== undefined) {
        setCustomAmount(targetOrder.remainingAmount.toString());
      } else {
        setCustomAmount(targetOrder.totalPrice.toString());
      }

      return targetOrder;
    } catch (err: any) {
      console.error("Error loading order details:", err);
      setError(
        err.message || "Erreur lors du chargement des détails de la commande"
      );
      return null;
    } finally {
      setIsLoading(false);
    }
  }, [orderId]);

  // Gestionnaire de notifications WebSocket MODIFIÉ
  const handleOrderNotification = useCallback(
    (notification: OrderNotification) => {
      console.log("WebSocket notification received:", notification);

      // IGNORER les notifications si on navigue vers l'écran de paiement
      if (isNavigatingToPayment) {
        console.log('Ignoring notification while navigating to payment');
        return;
      }

      // Ne traiter que les notifications pour cette commande
      if (notification.orderId === orderId) {
        // SIMPLIFIER : Pas de notifications visuelles, juste rafraîchir les données
        switch (notification.orderStatus) {
          case OrderNotificationStatus.PAYMENT_UPDATE:
            // Rafraîchir silencieusement les données
            loadOrderDetails().then((updatedOrder) => {
              // Vérifier si la commande est totalement payée
              if ((updatedOrder?.remainingAmount || 0) <= 0) {
                // Redirection avec message simple
                Alert.alert(
                  "Commande entièrement payée",
                  "Cette commande a été entièrement payée. Vous allez être redirigé vers l'écran d'accueil.",
                  [
                    {
                      text: "OK",
                      onPress: () => navigation.navigate("ServerHome" as never),
                    },
                  ]
                );
              }
              // Pas de snackbar pour les paiements partiels
            });
            break;

          case OrderNotificationStatus.DISH_UPDATE:
            // Rafraîchir silencieusement
            loadOrderDetails();
            break;

          default:
            // Rafraîchir silencieusement pour tout autre changement
            loadOrderDetails();
            break;
        }
      }
    },
    [orderId, loadOrderDetails, navigation, isNavigatingToPayment]
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

  // Calculer le total des articles sélectionnés
  const calculateSelectedTotal = useCallback(() => {
    return billItems
      .filter(
        (item) => item.selected && !["REJECTED", "PAID"].includes(item.state)
      )
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

  // Calculer le montant personnalisé à payer
  const calculateCustomAmount = useCallback((): number => {
    const customAmountValue = parseFloat(customAmount.replace(",", "."));
    const remainingAmount = calculateRemainingAmount();

    if (isNaN(customAmountValue) || customAmountValue <= 0) {
      return 0;
    }

    return Math.min(customAmountValue, remainingAmount);
  }, [customAmount, calculateRemainingAmount]);

  // Gérer la sélection/désélection d'un article
  const toggleItemSelection = (itemId: number) => {
    setBillItems((prevItems) => {
      const updatedItems = prevItems.map((item) =>
        item.id === itemId ? { ...item, selected: !item.selected } : item
      );

      const allItemsSelected = updatedItems.every((item) => item.selected);
      setAllSelected(allItemsSelected);

      return updatedItems;
    });
  };

  // Gérer la sélection/désélection de tous les articles
  const toggleAllSelection = () => {
    const newAllSelected = !allSelected;
    setAllSelected(newAllSelected);

    setBillItems((prevItems) =>
      prevItems.map((item) => ({ ...item, selected: newAllSelected }))
    );
  };

  // Mettre à jour le montant personnalisé
  const updateCustomAmount = (value: string) => {
    const numericValue = value.replace(/[^0-9.,]/g, "");
    setCustomAmount(numericValue);
  };

  // Passer à l'écran de paiement MODIFIÉ
  const proceedToPayment = () => {
    const remainingAmount = calculateRemainingAmount();

    if (remainingAmount <= 0) {
      Alert.alert(
        "Commande déjà payée",
        "Cette commande a été entièrement payée.",
        [{ text: "OK", onPress: () => navigation.navigate("ServerHome" as never) }]
      );
      return;
    }

    // MARQUER qu'on navigue vers le paiement
    setIsNavigatingToPayment(true);
    
    // Réinitialiser le flag après un délai
    setTimeout(() => {
      setIsNavigatingToPayment(false);
    }, 2000);

    if (paymentMode === "items") {
      const selectedItems = billItems.filter((item) => item.selected);
      if (selectedItems.length === 0) {
        Alert.alert(
          "Aucun article sélectionné",
          "Veuillez sélectionner au moins un article pour l'addition.",
          [{ text: "OK" }]
        );
        setIsNavigatingToPayment(false);
        return;
      }

      const selectedTotal = Math.min(calculateSelectedTotal(), remainingAmount);

      navigation.navigate("PaymentScreen" as never, {
        orderId,
        tableName,
        tableId,
        selectedItems,
        totalAmount: calculateOrderTotal(),
        paidAmount: calculatePaidAmount(),
        remainingAmount: remainingAmount,
        currency: order?.currency.code || "EUR",
        paymentMode: "items",
      } as never);
    } else {
      const customAmountValue = calculateCustomAmount();

      if (customAmountValue <= 0) {
        Alert.alert(
          "Montant invalide",
          "Veuillez saisir un montant valide supérieur à 0.",
          [{ text: "OK" }]
        );
        setIsNavigatingToPayment(false);
        return;
      }

      navigation.navigate("PaymentScreen" as never, {
        orderId,
        tableName,
        tableId,
        totalAmount: calculateOrderTotal(),
        paidAmount: calculatePaidAmount(),
        remainingAmount: remainingAmount,
        currency: order?.currency.code || "EUR",
        paymentMode: "amount",
        customAmount: customAmountValue,
      } as never);
    }
  };

  // Obtenir la couleur en fonction du statut
  const getStatusColor = (status: DomainOrderItem["state"]) => {
    switch (status) {
      case "PENDING":
      case "IN_PREPARATION":
        return "#FF9800";
      case "READY":
      case "COOKED":
        return "#4CAF50";
      case "SERVED":
        return "#2196F3";
      case "REJECTED":
        return "#F44336";
      case "PAID":
        return "#9E9E9E";
      default:
        return "#9E9E9E";
    }
  };

  // Obtenir le texte du statut
  const getStatusText = (status: DomainOrderItem["state"]) => {
    switch (status) {
      case "PENDING":
        return "En attente";
      case "IN_PREPARATION":
        return "En préparation";
      case "READY":
      case "COOKED":
        return "Prêt";
      case "SERVED":
        return "Servi";
      case "REJECTED":
        return "Rejeté";
      case "PAID":
        return "Payé";
      default:
        return "Inconnu";
    }
  };

  // Charger les données au chargement de l'écran
  useEffect(() => {
    loadOrderDetails();
  }, [loadOrderDetails]);

  // Rendu d'un article d'addition
  const renderBillItem = (item: BillItem) => {
    const isDisabled = ["REJECTED", "PAID"].includes(item.state);
    const itemTotal =
      item.unitPrice * item.count * (1 - (item.discount || 0) / 100);

    return (
      <Card
        key={item.id}
        style={[styles.itemCard, isDisabled ? styles.disabledItemCard : null]}
      >
        <View style={styles.itemCardContent}>
          <TouchableRipple
            onPress={() => !isDisabled && toggleItemSelection(item.id)}
            disabled={isDisabled || paymentMode === "amount"}
            style={styles.checkboxContainer}
          >
            <Icon
              name={
                item.selected ? "checkbox-marked" : "checkbox-blank-outline"
              }
              size={24}
              color={
                isDisabled || paymentMode === "amount"
                  ? theme.colors.disabled
                  : theme.colors.primary
              }
              style={styles.checkboxIcon}
            />
          </TouchableRipple>

          <View style={styles.itemDetails}>
            <View style={styles.itemHeader}>
              <Text
                style={styles.itemName}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                {item.count}x {item.dishName}
              </Text>
              <Text style={styles.itemPrice}>
                {itemTotal.toFixed(2)} {order?.currency.code}
              </Text>
            </View>

            {item.note && (
              <Text
                style={styles.itemNote}
                numberOfLines={1}
                ellipsizeMode="tail"
              >
                Note: {item.note}
              </Text>
            )}

            <View style={styles.itemFooter}>
              <View style={styles.statusContainer}>
                <View
                  style={[
                    styles.statusBadge,
                    { backgroundColor: getStatusColor(item.state) },
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
    <SafeAreaView style={styles.container} edges={["left", "right"]}>
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
          <Icon
            name="alert-circle-outline"
            size={24}
            color={theme.colors.error}
          />
          <Text style={styles.errorText}>{error}</Text>
          <Button
            mode="contained"
            onPress={loadOrderDetails}
            style={styles.retryButton}
          >
            Réessayer
          </Button>
        </Surface>
      ) : (
        <View style={styles.content}>
          <ScrollView
            contentContainerStyle={{ paddingBottom: 150 }}
            showsVerticalScrollIndicator={true}
          >
            {/* Résumé de la commande avec en-tête cliquable */}
            <Surface style={styles.orderSummaryContainer}>
              <TouchableRipple
                onPress={() => setOrderSummaryExpanded(!orderSummaryExpanded)}
                style={styles.orderSummaryHeader}
              >
                <View
                  style={{
                    flexDirection: "row",
                    justifyContent: "space-between",
                    alignItems: "center",
                    width: "100%",
                  }}
                >
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
                    <Text style={styles.orderInfoLabel}>
                      Commande #{order?.id}
                    </Text>
                    <Text style={styles.orderInfoValue}>
                      {new Date(order?.orderDate || "").toLocaleDateString()}
                    </Text>
                  </View>

                  <View style={styles.orderInfoRow}>
                    <Text style={styles.orderInfoLabel}>Montant total:</Text>
                    <Text style={styles.orderInfoValue}>
                      {calculateOrderTotal().toFixed(2)} {order?.currency.code}
                    </Text>
                  </View>

                  <View style={styles.orderInfoRow}>
                    <Text style={styles.orderInfoLabel}>Déjà payé:</Text>
                    <Text
                      style={[
                        styles.orderInfoValue,
                        {
                          color:
                            calculatePaidAmount() > 0
                              ? theme.colors.success
                              : theme.colors.text,
                        },
                      ]}
                    >
                      {calculatePaidAmount().toFixed(2)} {order?.currency.code}
                    </Text>
                  </View>

                  <View style={styles.orderInfoRow}>
                    <Text
                      style={[styles.orderInfoLabel, { fontWeight: "bold" }]}
                    >
                      Reste à payer:
                    </Text>
                    <Text
                      style={[
                        styles.orderInfoValue,
                        { fontWeight: "bold", color: theme.colors.primary },
                      ]}
                    >
                      {calculateRemainingAmount().toFixed(2)}{" "}
                      {order?.currency.code}
                    </Text>
                  </View>
                </View>
              )}
            </Surface>

            {/* Sélection du mode de paiement */}
            <Surface style={styles.modeSelectionContainer}>
              <Text style={styles.modeSelectionLabel}>Mode de paiement:</Text>
              <ToggleButton.Row
                onValueChange={(value) =>
                  value && setPaymentMode(value as "items" | "amount")
                }
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
                {paymentMode === "items"
                  ? "Sélectionnez les plats à payer"
                  : "Saisissez le montant reçu"}
              </Text>

              {/* Section de montant personnalisé */}
              {paymentMode === "amount" && (
                <View style={styles.customAmountSection}>
                  <View style={styles.amountInputContainer}>
                    <Text style={styles.amountLabel}>Montant reçu:</Text>
                    <TextInput
                      mode="outlined"
                      value={customAmount}
                      onChangeText={updateCustomAmount}
                      keyboardType="numeric"
                      right={<TextInput.Affix text={order?.currency.code} />}
                      style={styles.amountInput}
                    />

                    {parseFloat(customAmount.replace(",", ".")) >
                      calculateRemainingAmount() && (
                      <View style={styles.warningContainer}>
                        <Icon
                          name="information-outline"
                          size={16}
                          color={theme.colors.primary}
                        />
                        <Text style={styles.warningText}>
                          Le montant saisi dépasse le reste à payer. Seul{" "}
                          {calculateRemainingAmount().toFixed(2)}{" "}
                          {order?.currency.code} sera encaissé.
                        </Text>
                      </View>
                    )}
                  </View>

                  <View style={styles.amountRow}>
                    <Text style={styles.amountLabel}>Montant effectif:</Text>
                    <Text
                      style={[
                        styles.amountValue,
                        { color: theme.colors.primary },
                      ]}
                    >
                      {calculateCustomAmount().toFixed(2)}{" "}
                      {order?.currency.code}
                    </Text>
                  </View>
                </View>
              )}
            </Surface>

            {/* En-tête avec sélection globale */}
            {paymentMode === "items" && (
              <Surface style={styles.selectionHeader}>
                <View style={styles.selectionHeaderContent}>
                  <TouchableRipple
                    onPress={toggleAllSelection}
                    style={styles.selectAllContainer}
                  >
                    <View style={styles.checkboxWrapper}>
                      <Icon
                        name={
                          allSelected
                            ? "checkbox-marked"
                            : "checkbox-blank-outline"
                        }
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
                    <Text style={styles.orderIdText}>#{order?.id}</Text>
                    <Text style={styles.orderDateText}>
                      {new Date(order?.orderDate || "").toLocaleTimeString()}
                    </Text>
                  </View>
                </View>
              </Surface>
            )}

            {/* Liste des articles */}
            {paymentMode === "items" && (
              <View style={styles.itemsContainer}>
                <Text style={styles.sectionTitle}>
                  Sélectionnez les plats à payer:
                </Text>

                {billItems.length === 0 ? (
                  <View style={styles.emptyContainer}>
                    <Text style={styles.emptyText}>
                      Aucun article dans cette commande
                    </Text>
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
                  {paymentMode === "items"
                    ? "Sous-total sélectionné:"
                    : "Montant reçu:"}
                </DataTable.Cell>
                <DataTable.Cell numeric>
                  {paymentMode === "items"
                    ? `${Math.min(
                        calculateSelectedTotal(),
                        calculateRemainingAmount()
                      ).toFixed(2)} ${order?.currency.code}`
                    : `${calculateCustomAmount().toFixed(2)} ${
                        order?.currency.code
                      }`}
                </DataTable.Cell>
              </DataTable.Row>

              <DataTable.Row>
                <DataTable.Cell style={styles.totalCell}>
                  <Text style={styles.totalText}>Reste à payer:</Text>
                </DataTable.Cell>
                <DataTable.Cell numeric style={styles.totalCell}>
                  <Text style={styles.totalAmount}>
                    {calculateRemainingAmount().toFixed(2)}{" "}
                    {order?.currency.code}
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
                  (paymentMode === "items" && calculateSelectedTotal() <= 0) ||
                  (paymentMode === "amount" && calculateCustomAmount() <= 0) ||
                  calculateRemainingAmount() <= 0
                }
              >
                Procéder au paiement
              </Button>
            </View>
            
            {/* Bouton pour clôturer avec impayé */}
            {calculateRemainingAmount() > 0 && (
              <>
                <Divider style={styles.footerDivider} />
                <Button
                  mode="text"
                  onPress={() => {
                    navigation.navigate("CloseWithDebt" as never, {
                      orderId,
                      tableName: tableName || "",
                      tableId: tableId || 0,
                      remainingAmount: calculateRemainingAmount(),
                      currency: order?.currency.code || "EUR",
                    } as never);
                  }}
                  style={styles.debtButton}
                  textColor={theme.colors.error}
                  icon="alert-circle"
                >
                  Clôturer avec impayé ({calculateRemainingAmount().toFixed(2)}{" "}
                  {order?.currency.code})
                </Button>
              </>
            )}
          </Surface>
        </View>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  content: {
    flex: 1,
    display: "flex",
    flexDirection: "column",
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
  },
  errorContainer: {
    margin: 16,
    padding: 24,
    borderRadius: 8,
    alignItems: "center",
  },
  errorText: {
    fontSize: 16,
    textAlign: "center",
    marginVertical: 12,
    color: "#d32f2f",
  },
  retryButton: {
    marginTop: 8,
  },
  orderSummaryContainer: {
    padding: 0,
    margin: 16,
    marginBottom: 8,
    borderRadius: 8,
    overflow: "hidden",
  },
  orderSummaryHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
    backgroundColor: "#F5F5F5",
  },
  orderSummaryContent: {
    padding: 16,
    paddingTop: 8,
  },
  cardTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 12,
  },
  divider: {
    marginBottom: 16,
  },
  orderInfoRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  orderInfoLabel: {
    fontSize: 15,
    fontWeight: "500",
  },
  orderInfoValue: {
    fontSize: 15,
  },
  modeSelectionContainer: {
    padding: 16,
    margin: 16,
    marginTop: 8,
    marginBottom: 8,
    borderRadius: 8,
  },
  modeSelectionLabel: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 12,
  },
  toggleRow: {
    alignSelf: "flex-start",
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
    borderTopColor: "#e0e0e0",
  },
  amountRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginTop: 12,
  },
  amountLabel: {
    fontSize: 16,
    fontWeight: "500",
  },
  amountValue: {
    fontSize: 16,
    fontWeight: "bold",
  },
  amountInputContainer: {
    marginBottom: 16,
  },
  amountInput: {
    marginTop: 8,
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
  selectionHeader: {
    padding: 16,
    margin: 16,
    marginTop: 8,
    borderRadius: 8,
  },
  selectionHeaderContent: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  selectAllContainer: {
    flexGrow: 1,
    marginRight: 8,
    borderRadius: 8,
  },
  checkboxWrapper: {
    flexDirection: "row",
    alignItems: "center",
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
    alignItems: "flex-end",
  },
  orderIdText: {
    fontWeight: "bold",
    fontSize: 14,
  },
  orderDateText: {
    fontSize: 12,
    opacity: 0.7,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 12,
    paddingHorizontal: 16,
  },
  itemsContainer: {
    padding: 16,
    paddingTop: 8,
    paddingBottom: 200,
  },
  emptyContainer: {
    alignItems: "center",
    justifyContent: "center",
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
    flexDirection: "row",
    padding: 12,
  },
  checkboxContainer: {
    width: 40,
    alignItems: "center",
    justifyContent: "flex-start",
    paddingTop: 8,
  },
  itemDetails: {
    flex: 1,
    marginLeft: 8,
  },
  itemHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 6,
  },
  itemName: {
    fontSize: 16,
    fontWeight: "500",
    flex: 1,
    marginRight: 8,
  },
  itemPrice: {
    fontSize: 16,
    fontWeight: "bold",
  },
  itemNote: {
    fontSize: 14,
    fontStyle: "italic",
    opacity: 0.7,
    marginBottom: 6,
  },
  itemFooter: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
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
    alignSelf: "flex-start",
    minWidth: 70,
  },
  statusText: {
    color: "white",
    fontSize: 12,
    fontWeight: "bold",
    textAlign: "center",
  },
  footer: {
    position: "absolute",
    bottom: 0,
    left: 0,
    right: 0,
    backgroundColor: "white",
    padding: 16,
    paddingBottom: 24,
    elevation: 8,
    borderTopLeftRadius: 16,
    borderTopRightRadius: 16,
    zIndex: 10,
  },
  summaryTable: {
    marginBottom: 16,
  },
  totalCell: {
    height: 48,
  },
  totalText: {
    fontSize: 16,
    fontWeight: "bold",
  },
  totalAmount: {
    fontSize: 16,
    fontWeight: "bold",
    color: "#4CAF50",
  },
  actionButtons: {
    flexDirection: "row",
    justifyContent: "space-between",
  },
  cancelButton: {
    flex: 1,
    marginRight: 8,
  },
  continueButton: {
    flex: 2,
  },
  footerDivider: {
    marginVertical: 12,
  },
  debtButton: {
    marginTop: 8,
  },
});

export default PrepareBillScreen;