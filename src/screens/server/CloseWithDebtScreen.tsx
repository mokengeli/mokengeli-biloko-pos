// src/screens/server/CloseWithDebtScreen.tsx
import React, { useState, useCallback, useRef } from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import {
  Appbar,
  Text,
  Card,
  Button,
  Surface,
  useTheme,
  TextInput,
  Portal,
  Modal,
  ActivityIndicator,
  HelperText,
} from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { RouteProp } from "@react-navigation/native";
import { StackNavigationProp } from "@react-navigation/stack";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import { useAuth } from "../../contexts/AuthContext";
import orderService from "../../api/orderService";
import PinInput from "../../components/common/PinInput";

// Types pour la navigation
type CloseWithDebtParamList = {
  CloseWithDebt: {
    orderId: number;
    tableName: string;
    tableId: number;
    remainingAmount: number;
    currency: string;
  };
};

type CloseWithDebtScreenRouteProp = RouteProp<
  CloseWithDebtParamList,
  "CloseWithDebt"
>;
type CloseWithDebtScreenNavigationProp = StackNavigationProp<
  CloseWithDebtParamList,
  "CloseWithDebt"
>;

interface CloseWithDebtScreenProps {
  navigation: CloseWithDebtScreenNavigationProp;
  route: CloseWithDebtScreenRouteProp;
}

export const CloseWithDebtScreen: React.FC<CloseWithDebtScreenProps> = ({
  navigation,
  route,
}) => {
  const pinInputRef = useRef<any>(null);
  const { orderId, tableName, tableId, remainingAmount, currency } =
    route.params;
  const { user } = useAuth();
  const theme = useTheme();

  // États
  const [reason, setReason] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [pinModalVisible, setPinModalVisible] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Validation du formulaire
  const isFormValid = reason.trim().length >= 10; // Au moins 10 caractères pour la raison

  // Fermer avec validation immédiate (PIN)
  const handleImmediateValidation = () => {
    if (!isFormValid) {
      Alert.alert(
        "Formulaire incomplet",
        "Veuillez saisir une raison détaillée (au moins 10 caractères).",
        [{ text: "OK" }]
      );
      return;
    }

    setPinModalVisible(true);
  };

  // Fermer avec demande de validation
  const handleRemoteValidation = async () => {
    if (!isFormValid) {
      Alert.alert(
        "Formulaire incomplet",
        "Veuillez saisir une raison détaillée (au moins 10 caractères).",
        [{ text: "OK" }]
      );
      return;
    }

    setIsProcessing(true);
    setError(null);

    try {
      // Appeler l'API pour enregistrer la demande de validation
      await orderService.closeWithDebt({
        orderId,
        reason: reason.trim(),
        validationType: "REMOTE",
        amount: remainingAmount,
      });

      // Afficher un message de succès
      Alert.alert(
        "Demande envoyée",
        "La table a été libérée. Une demande de validation a été envoyée au manager.",
        [
          {
            text: "OK",
            onPress: () => {
              // Retourner à l'écran d'accueil
              navigation.navigate("ServerHome" as never);
            },
          },
        ]
      );
    } catch (err: any) {
      console.error("Error requesting remote validation:", err);
      setError(err.message || "Erreur lors de l'envoi de la demande");
    } finally {
      setIsProcessing(false);
    }
  };

  // Valider avec le PIN
  const handlePinValidation = async (pin: string) => {
    // Éviter les appels multiples
    if (isProcessing) return;

    setIsProcessing(true);
    setError(null);

    try {
      await orderService.closeWithDebt({
        orderId,
        reason: reason.trim(),
        validationType: "IMMEDIATE",
        validationCode: pin,
        amount: remainingAmount,
      });

      // Succès - fermer la modal
      setPinModalVisible(false);

      Alert.alert(
        "Commande clôturée",
        "La commande a été clôturée avec impayé et la table est maintenant libre.",
        [
          {
            text: "OK",
            onPress: () => {
              navigation.navigate("ServerHome" as never);
            },
          },
        ]
      );
    } catch (err: any) {
      console.error("Error validating with PIN:", err);

      // En cas d'erreur, vider le PIN et permettre une nouvelle tentative
      if (pinInputRef.current) {
        pinInputRef.current.clear();
      }

      if (err.response?.status === 401 || err.message?.includes("PIN")) {
        Alert.alert(
          "Code PIN incorrect",
          "Le code PIN saisi est incorrect. Veuillez réessayer.",
          [{ text: "OK" }]
        );
      } else {
        Alert.alert("Erreur", err.message || "Erreur lors de la validation", [
          { text: "OK" },
        ]);
      }
    } finally {
      setIsProcessing(false);
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["left", "right"]}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => navigation.goBack()} />
        <Appbar.Content
          title="Clôturer avec impayé"
          subtitle={`${tableName} - Commande #${orderId}`}
        />
      </Appbar.Header>

      <KeyboardAvoidingView
        style={styles.keyboardView}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
      >
        <ScrollView
          style={styles.scrollView}
          contentContainerStyle={styles.scrollContent}
          keyboardShouldPersistTaps="handled"
        >
          {/* Carte d'avertissement */}
          <Card style={[styles.warningCard, { backgroundColor: "#FFEBEE" }]}>
            <Card.Content>
              <View style={styles.warningHeader}>
                <Icon
                  name="alert-circle"
                  size={32}
                  color={theme.colors.error}
                />
                <Text
                  style={[styles.warningTitle, { color: theme.colors.error }]}
                >
                  Montant impayé
                </Text>
              </View>
              <Text style={[styles.amountText, { color: theme.colors.error }]}>
                {remainingAmount.toFixed(2)} {currency}
              </Text>
              <Text style={styles.warningDescription}>
                Ce montant sera enregistré comme une perte et la table sera
                libérée immédiatement.
              </Text>
            </Card.Content>
          </Card>

          {/* Formulaire */}
          <Surface style={styles.formCard}>
            <Text style={styles.formTitle}>Raison de la perte</Text>

            <TextInput
              mode="outlined"
              label="Raison détaillée *"
              placeholder="Ex: Client parti sans payer, impossible de le rattraper..."
              value={reason}
              onChangeText={setReason}
              multiline
              numberOfLines={4}
              style={styles.reasonInput}
              error={reason.length > 0 && reason.length < 10}
            />

            <HelperText
              type={reason.length > 0 && reason.length < 10 ? "error" : "info"}
            >
              {reason.length > 0 && reason.length < 10
                ? `${10 - reason.length} caractères manquants`
                : "Minimum 10 caractères requis"}
            </HelperText>

            {error && (
              <View style={styles.errorContainer}>
                <Icon
                  name="alert-circle-outline"
                  size={20}
                  color={theme.colors.error}
                />
                <Text style={styles.errorText}>{error}</Text>
              </View>
            )}
          </Surface>

          {/* Actions */}
          <View style={styles.actionsContainer}>
            <Button
              mode="contained"
              onPress={handleImmediateValidation}
              style={[styles.actionButton, styles.immediateButton]}
              icon="shield-check"
              loading={isProcessing && pinModalVisible}
              disabled={!isFormValid || isProcessing}
            >
              Valider immédiatement
            </Button>

            <Button
              mode="outlined"
              onPress={handleRemoteValidation}
              style={[styles.actionButton, styles.remoteButton]}
              icon="account-clock"
              loading={isProcessing && !pinModalVisible}
              disabled={!isFormValid || isProcessing}
            >
              Demander validation
            </Button>
          </View>

          {/* Information */}
          <Card style={styles.infoCard}>
            <Card.Content>
              <View style={styles.infoRow}>
                <Icon
                  name="information"
                  size={20}
                  color={theme.colors.primary}
                />
                <Text style={styles.infoText}>
                  La table sera libérée immédiatement, même en attente de
                  validation.
                </Text>
              </View>
            </Card.Content>
          </Card>
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Modal de saisie du PIN */}
      <Portal>
        <Modal
          visible={pinModalVisible}
          onDismiss={() => !isProcessing && setPinModalVisible(false)}
          contentContainerStyle={styles.pinModal}
        >
          <Text style={styles.pinModalTitle}>Validation par code PIN</Text>
          <Text style={styles.pinModalSubtitle}>
            Saisissez votre code PIN à 4 chiffres
          </Text>

          <PinInput
            ref={pinInputRef}
            onComplete={handlePinValidation}
            disabled={isProcessing}
            clearOnError={true}
          />

          {isProcessing && (
            <ActivityIndicator
              size="small"
              color={theme.colors.primary}
              style={styles.pinLoader}
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
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  keyboardView: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  warningCard: {
    marginBottom: 16,
    borderRadius: 12,
  },
  warningHeader: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 12,
  },
  warningTitle: {
    fontSize: 20,
    fontWeight: "bold",
    marginLeft: 12,
  },
  amountText: {
    fontSize: 32,
    fontWeight: "bold",
    textAlign: "center",
    marginVertical: 16,
  },
  warningDescription: {
    fontSize: 14,
    textAlign: "center",
    opacity: 0.8,
  },
  formCard: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  formTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 16,
  },
  reasonInput: {
    backgroundColor: "transparent",
    marginBottom: 4,
  },
  errorContainer: {
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#FFEBEE",
    padding: 12,
    borderRadius: 8,
    marginTop: 12,
  },
  errorText: {
    flex: 1,
    marginLeft: 8,
    color: "#D32F2F",
  },
  actionsContainer: {
    gap: 12,
    marginBottom: 16,
  },
  actionButton: {
    paddingVertical: 8,
  },
  immediateButton: {
    backgroundColor: "#4CAF50",
  },
  remoteButton: {
    borderColor: "#FF9800",
  },
  infoCard: {
    backgroundColor: "#E3F2FD",
  },
  infoRow: {
    flexDirection: "row",
    alignItems: "flex-start",
  },
  infoText: {
    flex: 1,
    marginLeft: 8,
    fontSize: 14,
    lineHeight: 20,
  },
  pinModal: {
    backgroundColor: "white",
    margin: 20,
    padding: 24,
    borderRadius: 12,
    alignItems: "center",
  },
  pinModalTitle: {
    fontSize: 20,
    fontWeight: "bold",
    marginBottom: 8,
  },
  pinModalSubtitle: {
    fontSize: 16,
    opacity: 0.7,
    marginBottom: 24,
    textAlign: "center",
  },
  pinLoader: {
    marginTop: 16,
  },
  cancelButton: {
    marginTop: 16,
  },
});

export default CloseWithDebtScreen;
