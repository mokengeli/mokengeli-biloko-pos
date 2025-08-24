// src/screens/manager/PendingValidationsScreen.tsx
import React, { useState, useEffect, useCallback, useRef } from "react";
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  Alert,
} from "react-native";
import {
  Appbar,
  Text,
  Card,
  Button,
  Surface,
  useTheme,
  Portal,
  Modal,
  TextInput,
  ActivityIndicator,
  Chip,
  Divider,
} from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { StackNavigationProp } from "@react-navigation/stack";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import { useAuth } from "../../contexts/AuthContext";
// CHANGEMENT: Migration vers Socket.io
import { useSocketConnection } from "../../hooks/useSocketConnection";
import { useOrderNotifications } from "../../hooks/useOrderNotifications";
import { OrderNotificationStatus } from "../../services/types/WebSocketTypes";
import orderService, { DebtValidationRequest } from "../../api/orderService";
import PinInput from "../../components/common/PinInput";
import { formatDistanceToNow } from "date-fns";
import { fr } from "date-fns/locale";

type PendingValidationsScreenNavigationProp = StackNavigationProp<
  any,
  "PendingValidations"
>;

interface PendingValidationsScreenProps {
  navigation: PendingValidationsScreenNavigationProp;
}

export const PendingValidationsScreen: React.FC<
  PendingValidationsScreenProps
> = ({ navigation }) => {
  const pinInputRef = useRef<any>(null);
  const { user } = useAuth();
  const theme = useTheme();

  // États
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [validations, setValidations] = useState<DebtValidationRequest[]>([]);
  const [selectedValidation, setSelectedValidation] =
    useState<DebtValidationRequest | null>(null);
  const [pinModalVisible, setPinModalVisible] = useState(false);
  const [rejectModalVisible, setRejectModalVisible] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  // ============================================================================
  // MIGRATION: Utilisation de Socket.io au lieu de WebSocketService
  // ============================================================================
  
  // Connexion Socket.io
  const { 
    isConnected,
    status: connectionStatus 
  } = useSocketConnection({
    autoConnect: true,
    showStatusNotifications: false
  });

  // Écouter les notifications de validation de dette
  useOrderNotifications({
    onNotification: (notification) => {
      if (notification.orderStatus === OrderNotificationStatus.DEBT_VALIDATION_REQUEST) {
        // Rafraîchir la liste quand une nouvelle demande arrive
        loadPendingValidations();
      }
    }
  });

  // Charger les validations en attente
  const loadPendingValidations = useCallback(async () => {
    if (!user?.tenantCode) return;

    try {
      const response = await orderService.getPendingDebtValidations(
        user.tenantCode
      );
      setValidations(response);
    } catch (err) {
      console.error("Error loading pending validations:", err);
      Alert.alert(
        "Erreur",
        "Impossible de charger les validations en attente",
        [{ text: "OK" }]
      );
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [user?.tenantCode]);

  // Charger au montage
  useEffect(() => {
    loadPendingValidations();
  }, [loadPendingValidations]);

  // Rafraîchir
  const onRefresh = () => {
    setRefreshing(true);
    loadPendingValidations();
  };

  // Valider avec PIN
  const handleValidate = (validation: DebtValidationRequest) => {
    setSelectedValidation(validation);
    setPinModalVisible(true);
  };

  // Refuser
  const handleReject = (validation: DebtValidationRequest) => {
    setSelectedValidation(validation);
    setRejectReason("");
    setRejectModalVisible(true);
  };

  // Soumettre la validation
  const submitValidation = async (pin: string) => {
    if (!selectedValidation || isProcessing) return;

    setIsProcessing(true);

    try {
      await orderService.validateDebtRequest({
        debtValidationId: selectedValidation.id,
        validationCode: pin,
        approved: true,
      });

      setPinModalVisible(false);
      setSelectedValidation(null);
      loadPendingValidations();

      Alert.alert("Validation réussie", "La perte a été validée avec succès.", [
        { text: "OK" },
      ]);
    } catch (err: any) {
      console.error("Error validating debt request:", err);

      // Vider le PIN en cas d'erreur
      if (pinInputRef.current) {
        pinInputRef.current.clear();
      }

      if (err.response?.status === 401 || err.message?.includes("PIN")) {
        Alert.alert("Code PIN incorrect", "Le code PIN saisi est incorrect.", [
          { text: "OK" },
        ]);
      } else {
        Alert.alert("Erreur", "Impossible de valider la demande.", [
          { text: "OK" },
        ]);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  // Soumettre le refus
  const submitRejection = async () => {
    if (!selectedValidation || !rejectReason.trim()) {
      Alert.alert(
        "Raison requise",
        "Veuillez indiquer une raison pour le refus.",
        [{ text: "OK" }]
      );
      return;
    }

    setIsProcessing(true);

    try {
      await orderService.validateDebtRequest({
        debtValidationId: selectedValidation.id,
        approved: false,
        rejectionReason: rejectReason.trim(),
      });

      setRejectModalVisible(false);
      setSelectedValidation(null);

      // Rafraîchir la liste
      loadPendingValidations();

      Alert.alert("Refus enregistré", "La demande a été refusée.", [
        { text: "OK" },
      ]);
    } catch (err) {
      console.error("Error rejecting debt request:", err);
      Alert.alert("Erreur", "Impossible de refuser la demande.", [
        { text: "OK" },
      ]);
    } finally {
      setIsProcessing(false);
    }
  };

  // Rendu d'une validation (reste identique)
  const renderValidation = ({ item }: { item: DebtValidationRequest }) => {
    const timeAgo = formatDistanceToNow(new Date(item.createdAt), {
      addSuffix: true,
      locale: fr,
    });

    return (
      <Card style={styles.validationCard}>
        <Card.Content>
          <View style={styles.validationHeader}>
            <View style={styles.headerLeft}>
              <Text style={styles.tableName}>{item.tableName}</Text>
              <Text style={styles.orderNumber}>Commande #{item.orderId}</Text>
            </View>
            <Text style={[styles.amount, { color: theme.colors.error }]}>
              {item.amount.toFixed(2)} {item.currency}
            </Text>
          </View>

          <Divider style={styles.divider} />

          <View style={styles.validationDetails}>
            <View style={styles.detailRow}>
              <Icon name="account" size={16} color="#666" />
              <Text style={styles.detailText}>{item.serverName}</Text>
            </View>
            <View style={styles.detailRow}>
              <Icon name="clock-outline" size={16} color="#666" />
              <Text style={styles.detailText}>{timeAgo}</Text>
            </View>
            {/* Indicateur de connexion Socket.io */}
            {!isConnected && (
              <View style={styles.detailRow}>
                <Icon name="wifi-off" size={16} color={theme.colors.error} />
                <Text style={[styles.detailText, { color: theme.colors.error }]}>
                  Hors ligne - Mises à jour désactivées
                </Text>
              </View>
            )}
          </View>

          <View style={styles.reasonContainer}>
            <Text style={styles.reasonLabel}>Raison :</Text>
            <Text style={styles.reasonText}>{item.reason}</Text>
          </View>

          <View style={styles.actions}>
            <Button
              mode="contained"
              onPress={() => handleValidate(item)}
              style={[
                styles.actionButton,
                { backgroundColor: theme.colors.success },
              ]}
              icon="check"
            >
              Valider
            </Button>
            <Button
              mode="outlined"
              onPress={() => handleReject(item)}
              style={[styles.actionButton, { borderColor: theme.colors.error }]}
              textColor={theme.colors.error}
              icon="close"
            >
              Refuser
            </Button>
          </View>
        </Card.Content>
      </Card>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={["left", "right"]}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => navigation.goBack()} />
        <Appbar.Content title="Validations en attente" />
      </Appbar.Header>

      {isLoading && validations.length === 0 ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Chargement...</Text>
        </View>
      ) : validations.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Icon name="check-circle" size={64} color={theme.colors.primary} />
          <Text style={styles.emptyTitle}>Aucune validation en attente</Text>
          <Text style={styles.emptyText}>
            Toutes les demandes ont été traitées
          </Text>
        </View>
      ) : (
        <FlatList
          data={validations}
          renderItem={renderValidation}
          keyExtractor={(item) => item.id.toString()}
          contentContainerStyle={styles.listContent}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={onRefresh}
              colors={[theme.colors.primary]}
            />
          }
          ItemSeparatorComponent={() => <View style={styles.separator} />}
        />
      )}

      {/* Modal de validation (PIN) */}
      <Portal>
        <Modal
          visible={pinModalVisible}
          onDismiss={() => !isProcessing && setPinModalVisible(false)}
          contentContainerStyle={styles.modal}
        >
          <Text style={styles.modalTitle}>Validation</Text>
          <Text style={styles.modalSubtitle}>
            Saisissez votre code PIN pour valider cette perte
          </Text>

          {selectedValidation && (
            <Surface style={styles.validationSummary}>
              <Text style={styles.summaryText}>
                {selectedValidation.tableName} -{" "}
                {selectedValidation.amount.toFixed(2)}{" "}
                {selectedValidation.currency}
              </Text>
            </Surface>
          )}

          <PinInput
            ref={pinInputRef}
            onComplete={submitValidation}
            disabled={isProcessing}
          />
          {isProcessing && (
            <ActivityIndicator
              size="small"
              color={theme.colors.primary}
              style={styles.loader}
            />
          )}

          <Button
            mode="text"
            onPress={() => setPinModalVisible(false)}
            disabled={isProcessing}
            style={styles.cancelButton}
          >
            Annuler
          </Button>
        </Modal>
      </Portal>

      {/* Modal de refus */}
      <Portal>
        <Modal
          visible={rejectModalVisible}
          onDismiss={() => !isProcessing && setRejectModalVisible(false)}
          contentContainerStyle={styles.modal}
        >
          <Text style={styles.modalTitle}>Refuser la validation</Text>

          {selectedValidation && (
            <Surface style={styles.validationSummary}>
              <Text style={styles.summaryText}>
                {selectedValidation.tableName} -{" "}
                {selectedValidation.amount.toFixed(2)}{" "}
                {selectedValidation.currency}
              </Text>
            </Surface>
          )}

          <TextInput
            mode="outlined"
            label="Raison du refus *"
            value={rejectReason}
            onChangeText={setRejectReason}
            multiline
            numberOfLines={3}
            style={styles.rejectInput}
            disabled={isProcessing}
          />

          <View style={styles.modalActions}>
            <Button
              mode="text"
              onPress={() => setRejectModalVisible(false)}
              disabled={isProcessing}
            >
              Annuler
            </Button>
            <Button
              mode="contained"
              onPress={submitRejection}
              disabled={!rejectReason.trim() || isProcessing}
              loading={isProcessing}
              buttonColor={theme.colors.error}
            >
              Confirmer le refus
            </Button>
          </View>
        </Modal>
      </Portal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
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
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: "bold",
    marginTop: 16,
    marginBottom: 8,
  },
  emptyText: {
    fontSize: 16,
    textAlign: "center",
    opacity: 0.7,
  },
  listContent: {
    padding: 16,
  },
  separator: {
    height: 12,
  },
  validationCard: {
    borderRadius: 12,
  },
  validationHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
  },
  headerLeft: {
    flex: 1,
  },
  tableName: {
    fontSize: 18,
    fontWeight: "bold",
  },
  orderNumber: {
    fontSize: 14,
    opacity: 0.7,
    marginTop: 2,
  },
  amount: {
    fontSize: 24,
    fontWeight: "bold",
  },
  divider: {
    marginVertical: 12,
  },
  validationDetails: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 12,
  },
  detailRow: {
    flexDirection: "row",
    alignItems: "center",
  },
  detailText: {
    marginLeft: 6,
    fontSize: 14,
    opacity: 0.8,
  },
  reasonContainer: {
    backgroundColor: "#F5F5F5",
    padding: 12,
    borderRadius: 8,
    marginBottom: 16,
  },
  reasonLabel: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 4,
  },
  reasonText: {
    fontSize: 14,
    lineHeight: 20,
  },
  actions: {
    flexDirection: "row",
    gap: 12,
  },
  actionButton: {
    flex: 1,
  },
  modal: {
    backgroundColor: "white",
    margin: 20,
    padding: 24,
    borderRadius: 12,
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 8,
    textAlign: "center",
  },
  modalSubtitle: {
    fontSize: 16,
    opacity: 0.7,
    marginBottom: 16,
    textAlign: "center",
  },
  validationSummary: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 24,
    backgroundColor: "#F5F5F5",
  },
  summaryText: {
    fontSize: 16,
    fontWeight: "600",
    textAlign: "center",
  },
  loader: {
    marginTop: 16,
  },
  cancelButton: {
    marginTop: 16,
  },
  rejectInput: {
    marginBottom: 16,
    backgroundColor: "transparent",
  },
  modalActions: {
    flexDirection: "row",
    justifyContent: "flex-end",
    gap: 12,
  },
});

export default PendingValidationsScreen;
