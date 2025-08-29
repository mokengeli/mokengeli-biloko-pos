// src/screens/manager/PendingValidationsScreen.tsx - VERSION REFONTE COMPLÈTE
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
  Snackbar,
} from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { StackNavigationProp } from "@react-navigation/stack";
import { useFocusEffect } from "@react-navigation/native";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import { useAuth } from "../../contexts/AuthContext";
// CHANGEMENT: Utiliser directement le service Socket.io au lieu de créer une nouvelle connexion
import { socketIOService } from "../../services/SocketIOService";
import { useOrderNotifications } from "../../hooks/useOrderNotifications";
import { OrderNotificationStatus, ConnectionStatus } from "../../services/types/WebSocketTypes";
import orderService, { DebtValidationRequest } from "../../api/orderService";
import PinInput from "../../components/common/PinInput";
import { getNotificationMessage, isUrgentNotification, getNotificationColor } from "../../utils/notificationHelpers";

// Types navigation
type PendingValidationsScreenNavigationProp = StackNavigationProp<any, "PendingValidations">;

interface PendingValidationsScreenProps {
  navigation: PendingValidationsScreenNavigationProp;
}

// Interface pour validation sécurisée
interface SafeDebtValidationRequest {
  id: number;
  orderId: number;
  tableId: number;
  tableName: string;
  serverName: string;
  amount: number;
  currency: string;
  reason: string;
  createdAt: string; // Toujours string après validation
}

export const PendingValidationsScreen: React.FC<PendingValidationsScreenProps> = ({ navigation }) => {
  const pinInputRef = useRef<any>(null);
  const { user } = useAuth();
  const theme = useTheme();

  // États principaux
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [validations, setValidations] = useState<SafeDebtValidationRequest[]>([]);
  const [error, setError] = useState<string | null>(null);

  // États pour les modals
  const [selectedValidation, setSelectedValidation] = useState<SafeDebtValidationRequest | null>(null);
  const [pinModalVisible, setPinModalVisible] = useState(false);
  const [rejectModalVisible, setRejectModalVisible] = useState(false);
  const [rejectReason, setRejectReason] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);

  // États pour les notifications
  const [snackbar, setSnackbar] = useState({
    visible: false,
    message: "",
    type: "info" as "info" | "error" | "success" | "warning",
  });

  // ============================================================================
  // CONNEXION SOCKET.IO (Pattern ServerHomeScreen - SANS créer de nouvelle connexion)
  // ============================================================================
  
  const [isConnected, setIsConnected] = useState(socketIOService.isConnected());
  const [connectionStatus, setConnectionStatus] = useState(socketIOService.getStatus());
  const [connectionStats] = useState(socketIOService.getStats());

  // Écouter l'état de connexion via le service directement (comme dans ServerHomeScreen)
  useEffect(() => {
    const unsubscribe = socketIOService.onStatusChange((status) => {
      setConnectionStatus(status);
      setIsConnected(
        status === ConnectionStatus.CONNECTED || 
        status === ConnectionStatus.AUTHENTICATED
      );
    });

    return unsubscribe;
  }, []);

  // ============================================================================
  // FONCTIONS UTILITAIRES SÉCURISÉES
  // ============================================================================

  // Fonction de validation et nettoyage des données
  const sanitizeValidationData = useCallback((rawData: any): SafeDebtValidationRequest | null => {
    try {
      if (!rawData || typeof rawData !== 'object') {
        console.warn('[PendingValidations] Invalid validation object:', rawData);
        return null;
      }

      // Vérifier les champs requis
      const requiredFields = ['id', 'orderId', 'tableId', 'amount'];
      for (const field of requiredFields) {
        if (rawData[field] === undefined || rawData[field] === null) {
          console.warn(`[PendingValidations] Missing required field: ${field}`, rawData);
          return null;
        }
      }

      // Nettoyer le timestamp - PROTECTION CRITIQUE contre {sessionId, timestamp}
      let cleanTimestamp: string;
      if (rawData.createdAt) {
        if (typeof rawData.createdAt === 'object') {
          console.warn('[PendingValidations] Corrupted timestamp object detected, using fallback:', rawData.createdAt);
          cleanTimestamp = new Date().toISOString();
        } else if (typeof rawData.createdAt === 'string' || typeof rawData.createdAt === 'number') {
          try {
            const date = new Date(rawData.createdAt);
            if (isNaN(date.getTime())) {
              cleanTimestamp = new Date().toISOString();
            } else {
              cleanTimestamp = date.toISOString();
            }
          } catch {
            cleanTimestamp = new Date().toISOString();
          }
        } else {
          cleanTimestamp = new Date().toISOString();
        }
      } else {
        cleanTimestamp = new Date().toISOString();
      }

      // Créer l'objet sécurisé
      const safeValidation: SafeDebtValidationRequest = {
        id: Number(rawData.id),
        orderId: Number(rawData.orderId),
        tableId: Number(rawData.tableId),
        tableName: String(rawData.tableName || 'Table inconnue'),
        serverName: String(rawData.serverName || 'Serveur inconnu'),
        amount: Number(rawData.amount || 0),
        currency: String(rawData.currency || 'FCFA'),
        reason: String(rawData.reason || 'Aucune raison spécifiée'),
        createdAt: cleanTimestamp
      };

      return safeValidation;

    } catch (error) {
      console.error('[PendingValidations] Error sanitizing validation data:', error, rawData);
      return null;
    }
  }, []);

  // Formatage sécurisé du temps
  const formatTimeAgo = useCallback((timestamp: string): string => {
    try {
      const date = new Date(timestamp);
      if (isNaN(date.getTime())) {
        return 'Date invalide';
      }

      const now = new Date();
      const diffMs = now.getTime() - date.getTime();
      const diffMins = Math.floor(diffMs / (1000 * 60));
      
      if (diffMins < 1) return 'À l\'instant';
      if (diffMins < 60) return `Il y a ${diffMins} min`;
      
      const diffHours = Math.floor(diffMins / 60);
      if (diffHours < 24) return `Il y a ${diffHours}h`;
      
      const diffDays = Math.floor(diffHours / 24);
      return `Il y a ${diffDays}j`;
      
    } catch (error) {
      console.error('[PendingValidations] Error formatting time:', error, timestamp);
      return 'Date invalide';
    }
  }, []);

  // Fonction d'affichage des notifications
  const showNotification = useCallback((message: string, type: typeof snackbar.type = "info") => {
    setSnackbar({ visible: true, message, type });
  }, []);

  // Obtenir la couleur de connexion
  const getConnectionColor = useCallback(() => {
    switch (connectionStatus) {
      case ConnectionStatus.AUTHENTICATED:
        return theme.colors.primary;
      case ConnectionStatus.CONNECTED:
        return "#4CAF50";
      case ConnectionStatus.CONNECTING:
      case ConnectionStatus.RECONNECTING:
        return theme.colors.tertiary;
      case ConnectionStatus.DISCONNECTED:
      case ConnectionStatus.FAILED:
        return theme.colors.error;
      default:
        return theme.colors.onSurface;
    }
  }, [connectionStatus, theme]);

  // Obtenir l'icône de connexion
  const getConnectionIcon = useCallback(() => {
    switch (connectionStatus) {
      case ConnectionStatus.AUTHENTICATED:
      case ConnectionStatus.CONNECTED:
        return "wifi";
      case ConnectionStatus.CONNECTING:
      case ConnectionStatus.RECONNECTING:
        return "wifi-strength-2";
      case ConnectionStatus.DISCONNECTED:
        return "wifi-off";
      case ConnectionStatus.FAILED:
        return "wifi-alert";
      default:
        return "wifi";
    }
  }, [connectionStatus]);

  // ============================================================================
  // GESTION DES DONNÉES
  // ============================================================================

  // Charger les validations avec protection complète
  const loadValidations = useCallback(async () => {
    if (!user?.tenantCode) {
      setError("Code tenant manquant");
      setIsLoading(false);
      setRefreshing(false);
      return;
    }

    try {
      setError(null);
      console.log('[PendingValidations] Loading validations...');

      const response = await orderService.getPendingDebtValidations(user.tenantCode);
      
      if (!Array.isArray(response)) {
        console.warn('[PendingValidations] Invalid response format:', response);
        setValidations([]);
        return;
      }

      // Nettoyer et valider toutes les données
      const safeValidations = response
        .map(sanitizeValidationData)
        .filter((v): v is SafeDebtValidationRequest => v !== null);

      console.log(`[PendingValidations] Loaded ${safeValidations.length}/${response.length} validations`);
      
      // Mise à jour sécurisée du state
      setValidations(prev => {
        try {
          return safeValidations;
        } catch (error) {
          console.error('[PendingValidations] Error updating state:', error);
          return prev;
        }
      });

      if (safeValidations.length !== response.length) {
        const filteredCount = response.length - safeValidations.length;
        showNotification(`${filteredCount} validation(s) corrompue(s) filtrée(s)`, "warning");
      }

    } catch (error) {
      console.error('[PendingValidations] Error loading validations:', error);
      setError("Erreur lors du chargement des validations");
      
      if (isConnected) {
        showNotification("Erreur de chargement des validations", "error");
      } else {
        showNotification("Hors ligne - Données non disponibles", "warning");
      }
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [user?.tenantCode, isConnected, sanitizeValidationData, showNotification]);

  // ============================================================================
  // NOTIFICATIONS WEBSOCKET
  // ============================================================================
  
  const { lastNotification } = useOrderNotifications({
    onNotification: useCallback((notification) => {
      try {
        console.log('[PendingValidations] Received notification:', notification);

        // Validation robuste
        if (!notification || typeof notification.orderId !== 'number' || !notification.orderStatus) {
          console.warn('[PendingValidations] Invalid notification:', notification);
          return;
        }

        // Traiter selon le type
        switch (notification.orderStatus) {
          case OrderNotificationStatus.DEBT_VALIDATION_REQUEST:
            console.log('[PendingValidations] New validation request, reloading...');
            loadValidations();
            showNotification("Nouvelle demande de validation reçue", "info");
            break;
            
          default:
            // Ignorer les autres types de notifications
            break;
        }

      } catch (error) {
        console.error('[PendingValidations] Error handling notification:', error);
      }
    }, [loadValidations, showNotification])
  });

  // ============================================================================
  // CYCLE DE VIE DU COMPOSANT
  // ============================================================================
  
  // Chargement initial avec useFocusEffect comme ServerHomeScreen
  useFocusEffect(
    useCallback(() => {
      console.log('[PendingValidations] Screen focused, loading data...');
      loadValidations();
    }, [loadValidations])
  );

  // Rafraîchissement
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadValidations();
  }, [loadValidations]);

  // ============================================================================
  // ACTIONS DE VALIDATION
  // ============================================================================

  const handleValidate = useCallback((validation: SafeDebtValidationRequest) => {
    setSelectedValidation(validation);
    setPinModalVisible(true);
  }, []);

  const handleReject = useCallback((validation: SafeDebtValidationRequest) => {
    setSelectedValidation(validation);
    setRejectReason("");
    setRejectModalVisible(true);
  }, []);

  const submitValidation = useCallback(async (pin: string) => {
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
      
      showNotification("Validation approuvée avec succès", "success");
      loadValidations();

    } catch (error: any) {
      console.error('[PendingValidations] Validation error:', error);
      
      // Vider le PIN en cas d'erreur
      if (pinInputRef.current) {
        pinInputRef.current.clear();
      }

      if (error.response?.status === 401 || error.message?.includes("PIN")) {
        showNotification("Code PIN incorrect", "error");
      } else {
        showNotification("Erreur lors de la validation", "error");
      }
    } finally {
      setIsProcessing(false);
    }
  }, [selectedValidation, isProcessing, showNotification, loadValidations]);

  const submitRejection = useCallback(async () => {
    if (!selectedValidation || !rejectReason.trim() || isProcessing) return;

    setIsProcessing(true);
    try {
      await orderService.validateDebtRequest({
        debtValidationId: selectedValidation.id,
        approved: false,
        rejectionReason: rejectReason.trim(),
      });

      setRejectModalVisible(false);
      setSelectedValidation(null);
      
      showNotification("Demande refusée", "success");
      loadValidations();

    } catch (error) {
      console.error('[PendingValidations] Rejection error:', error);
      showNotification("Erreur lors du refus", "error");
    } finally {
      setIsProcessing(false);
    }
  }, [selectedValidation, rejectReason, isProcessing, showNotification, loadValidations]);

  // ============================================================================
  // RENDU DES COMPOSANTS
  // ============================================================================

  const renderValidation = useCallback(({ item }: { item: SafeDebtValidationRequest }) => {
    const timeAgo = formatTimeAgo(item.createdAt);

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
          </View>

          <View style={styles.reasonContainer}>
            <Text style={styles.reasonLabel}>Raison :</Text>
            <Text style={styles.reasonText}>{item.reason}</Text>
          </View>

          <View style={styles.actions}>
            <Button
              mode="contained"
              onPress={() => handleValidate(item)}
              style={[styles.actionButton, { backgroundColor: theme.colors.primary }]}
              icon="check"
              disabled={isProcessing}
            >
              Valider
            </Button>
            <Button
              mode="outlined"
              onPress={() => handleReject(item)}
              style={[styles.actionButton, { borderColor: theme.colors.error }]}
              textColor={theme.colors.error}
              icon="close"
              disabled={isProcessing}
            >
              Refuser
            </Button>
          </View>
        </Card.Content>
      </Card>
    );
  }, [formatTimeAgo, handleValidate, handleReject, isProcessing, theme]);

  // Rendu principal
  return (
    <SafeAreaView style={styles.container} edges={["left", "right"]}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => navigation.goBack()} />
        <Appbar.Content title="Validations en attente" />
        
        {/* Indicateur de connexion */}
        <View style={styles.connectionBadge}>
          <Chip 
            compact
            mode="flat"
            style={{ 
              backgroundColor: getConnectionColor(),
              paddingHorizontal: 8,
              height: 24
            }}
            textStyle={{ color: 'white', fontSize: 10 }}
          >
            <Icon 
              name={getConnectionIcon()} 
              size={14} 
              color="white" 
            />
            {connectionStats?.latency > 0 && ` ${connectionStats.latency}ms`}
          </Chip>
        </View>
        
        <Appbar.Action 
          icon="refresh" 
          onPress={onRefresh}
          disabled={refreshing}
        />
      </Appbar.Header>

      {isLoading && validations.length === 0 ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Chargement...</Text>
        </View>
      ) : error ? (
        <View style={styles.errorContainer}>
          <Icon name="alert-circle" size={64} color={theme.colors.error} />
          <Text style={styles.errorTitle}>Erreur de chargement</Text>
          <Text style={styles.errorText}>{error}</Text>
          <Button mode="contained" onPress={loadValidations} style={styles.retryButton}>
            Réessayer
          </Button>
        </View>
      ) : validations.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Icon name="check-circle" size={64} color={theme.colors.primary} />
          <Text style={styles.emptyTitle}>Aucune validation en attente</Text>
          <Text style={styles.emptyText}>
            Toutes les demandes ont été traitées
          </Text>
          {!isConnected && (
            <View style={styles.connectionWarning}>
              <Icon name="wifi-off" size={20} color={theme.colors.error} />
              <Text style={[styles.warningText, { color: theme.colors.error }]}>
                Hors ligne - Les mises à jour en temps réel sont désactivées
              </Text>
            </View>
          )}
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
                {selectedValidation.tableName} - {selectedValidation.amount.toFixed(2)} {selectedValidation.currency}
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
                {selectedValidation.tableName} - {selectedValidation.amount.toFixed(2)} {selectedValidation.currency}
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

      {/* Snackbar pour les notifications */}
      <Snackbar
        visible={snackbar.visible}
        onDismiss={() => setSnackbar(prev => ({ ...prev, visible: false }))}
        duration={3000}
        style={{
          backgroundColor: 
            snackbar.type === "error" ? theme.colors.error :
            snackbar.type === "success" ? "#4CAF50" :
            snackbar.type === "warning" ? "#FF9800" :
            theme.colors.primary
        }}
      >
        {snackbar.message}
      </Snackbar>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  connectionBadge: {
    marginRight: 8,
  },
  connectionWarning: {
    flexDirection: "row",
    alignItems: "center",
    marginTop: 16,
    padding: 12,
    backgroundColor: "#FFEBEE",
    borderRadius: 8,
  },
  warningText: {
    marginLeft: 8,
    fontSize: 14,
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
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  errorTitle: {
    fontSize: 20,
    fontWeight: "bold",
    marginTop: 16,
    marginBottom: 8,
  },
  errorText: {
    fontSize: 16,
    textAlign: "center",
    opacity: 0.7,
    marginBottom: 24,
  },
  retryButton: {
    minWidth: 120,
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
    elevation: 2,
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