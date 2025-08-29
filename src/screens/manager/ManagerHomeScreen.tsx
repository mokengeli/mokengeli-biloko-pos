// src/screens/manager/ManagerHomeScreen.tsx - VERSION CORRIGÉE
import React, { useState, useEffect } from "react";
import { View, StyleSheet } from "react-native";
import {
  Appbar,
  SegmentedButtons,
  Surface,
  Text,
  useTheme,
  Portal,
  Modal,
  List,
  Divider,
  Badge,
  Chip,
  Snackbar,
} from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../../contexts/AuthContext";
import { useNavigation } from "@react-navigation/native";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import { HeaderMenu } from "../../components/common/HeaderMenu";
import envConfig from "../../config/environment";
import { 
  useSocketConnection, 
} from "../../hooks/useSocketConnection";
import { ConnectionStatus } from '../../services/types/WebSocketTypes';
import { useOrderNotifications } from "../../hooks/useOrderNotifications";
import { NavigationHelper } from "../../utils/navigationHelper";

type ViewMode = "overview" | "server" | "kitchen";

export const ManagerHomeScreen: React.FC = () => {
  const { user } = useAuth();
  const theme = useTheme();
  const navigation = useNavigation();
  const [viewMode, setViewMode] = useState<ViewMode>("overview");
  const [menuVisible, setMenuVisible] = useState(false);

  // État pour les notifications
  const [snackbar, setSnackbar] = useState({
    visible: false,
    message: "",
    type: "info" as "info" | "error" | "success",
  });

  // ============================================================================
  // Connexion Socket.io
  // ============================================================================
  const { 
    isConnected, 
    status: connectionStatus,
    stats: connectionStats 
  } = useSocketConnection({
    autoConnect: true,
    showStatusNotifications: false,
    reconnectOnFocus: true
  });

  // Écouter les notifications globales du restaurant
  const { 
    notifications,
    lastNotification,
    count: notificationCount 
  } = useOrderNotifications({
    onNotification: (notification) => {
      // CORRECTION: S'assurer que notification est bien défini et utiliser JSON.stringify pour les objets
      if (notification) {
        console.log("Manager received notification:", JSON.stringify(notification));
        
        // Notifications importantes pour le manager
        switch (notification.orderStatus) {
          case "DEBT_VALIDATION_REQUEST":
            setSnackbar({
              visible: true,
              message: `Nouvelle demande de validation d'impayé - Table ${notification.tableId}`,
              type: "info"
            });
            break;
            
          case "DEBT_VALIDATION_APPROVED":
            setSnackbar({
              visible: true,
              message: `Validation d'impayé approuvée - Commande #${notification.orderId}`,
              type: "success"
            });
            break;
            
          case "DEBT_VALIDATION_REJECTED":
            setSnackbar({
              visible: true,
              message: `Validation d'impayé rejetée - Commande #${notification.orderId}`,
              type: "error"
            });
            break;
            
          case "PAYMENT_UPDATE":
            if (notification.newState === "PAID_WITH_REJECTED_ITEM") {
              setSnackbar({
                visible: true,
                message: `Paiement avec plats rejetés - Commande #${notification.orderId}`,
                type: "info"
              });
            }
            break;
        }
      }
    }
  });

  // Naviguer vers les différentes vues
  const handleViewChange = (mode: ViewMode) => {
    setViewMode(mode);
    switch (mode) {
      case "server":
        navigation.navigate("ServerHome" as never);
        break;
      case "kitchen":
        navigation.navigate("KitchenHome" as never);
        break;
      case "overview":
        // Rester sur cette vue
        break;
    }
  };

  // Obtenir la couleur du statut de connexion
  const getConnectionColor = () => {
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
  };

  // Obtenir le label du statut
  const getConnectionLabel = () => {
    switch (connectionStatus) {
      case ConnectionStatus.AUTHENTICATED:
        return "Connecté";
      case ConnectionStatus.CONNECTED:
        return "En ligne";
      case ConnectionStatus.CONNECTING:
        return "Connexion...";
      case ConnectionStatus.RECONNECTING:
        return "Reconnexion...";
      case ConnectionStatus.DISCONNECTED:
        return "Hors ligne";
      case ConnectionStatus.FAILED:
        return "Échec";
      default:
        return String(connectionStatus); // CORRECTION: Convertir en string
    }
  };

  // Afficher l'état de connexion dans la console en dev
  useEffect(() => {
    if (envConfig.environment === 'development' || __DEV__) {
      // CORRECTION: Utiliser JSON.stringify pour les objets
      console.log("[Manager] Socket connection status:", connectionStatus);
      if (connectionStats) {
        console.log("[Manager] Connection stats:", JSON.stringify(connectionStats));
      }
    }
  }, [connectionStatus, connectionStats]);

  return (
    <SafeAreaView style={styles.container} edges={["left", "right"]}>
      <Appbar.Header>
        <Appbar.Content
          title="Mokengeli Biloko POS - Manager"
          subtitle={`${user?.firstName || ""} ${user?.lastName || ""}`}
        />
        {/* Indicateur de connexion Socket.io */}
        <View style={styles.connectionIndicator}>
          <Chip 
            compact
            mode="flat"
            style={{ 
              backgroundColor: getConnectionColor(),
              marginRight: 8
            }}
            textStyle={{ color: 'white', fontSize: 10 }}
          >
            <Icon 
              name={isConnected ? "wifi" : "wifi-off"} 
              size={12} 
              color="white" 
            />{" "}
            {getConnectionLabel()}
          </Chip>
        </View>
        {notificationCount > 0 && (
          <Badge style={styles.notificationBadge}>{notificationCount}</Badge>
        )}
        <HeaderMenu />
      </Appbar.Header>

      <Surface style={styles.content}>
        {/* Sélecteur de vue */}
        <View style={styles.viewSelector}>
          <Text style={styles.sectionTitle}>Mode de vue</Text>
          <SegmentedButtons
            value={viewMode}
            onValueChange={(value) => handleViewChange(value as ViewMode)}
            buttons={[
              {
                value: "overview",
                label: "Supervision",
                icon: "monitor-dashboard",
              },
              {
                value: "server",
                label: "Service",
                icon: "room-service",
              },
              {
                value: "kitchen",
                label: "Cuisine",
                icon: "chef-hat",
              },
            ]}
            style={styles.segmentedButtons}
          />
        </View>

        {/* Vue Supervision */}
        {viewMode === "overview" && (
          <View style={styles.overviewContainer}>
            <Surface style={styles.quickAccessCard}>
              <Text style={styles.cardTitle}>Accès rapide</Text>
              <Divider style={styles.divider} />

              <List.Item
                title="Vue Service"
                description="Gérer les tables et commandes"
                left={(props) => <List.Icon {...props} icon="room-service" />}
                right={(props) => <List.Icon {...props} icon="chevron-right" />}
                onPress={() => handleViewChange("server")}
              />

              <List.Item
                title="Vue Cuisine"
                description="Superviser la préparation"
                left={(props) => <List.Icon {...props} icon="chef-hat" />}
                right={(props) => <List.Icon {...props} icon="chevron-right" />}
                onPress={() => handleViewChange("kitchen")}
              />
              
              <List.Item
                title="Validations en attente"
                description="Gérer les pertes et impayés"
                left={(props) => (
                  <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                    <List.Icon {...props} icon="alert-circle" />
                    {notificationCount > 0 && (
                      <Badge size={16} style={{ marginLeft: -8 }}>
                        {notificationCount}
                      </Badge>
                    )}
                  </View>
                )}
                right={(props) => <List.Icon {...props} icon="chevron-right" />}
                onPress={() => navigation.navigate("PendingValidations" as never)}
              />

              <List.Item
                title="Rapports"
                description="Disponibles sur l'application web"
                left={(props) => <List.Icon {...props} icon="chart-line" />}
                right={(props) => <List.Icon {...props} icon="open-in-new" />}
                disabled
              />
              
              {/* Écran de debug - seulement en développement */}
              {(envConfig.environment === 'development' || __DEV__) && (
                <>
                  <Divider style={styles.divider} />
                  <List.Item
                    title="🔧 Debug Socket.io"
                    description="Outils de diagnostic (Dev only)"
                    left={(props) => (
                      <List.Icon {...props} icon="bug" color="#FF5722" />
                    )}
                    right={(props) => (
                      <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                        <Chip 
                          compact 
                          mode="flat"
                          style={{ 
                            backgroundColor: getConnectionColor(),
                            marginRight: 8
                          }}
                          textStyle={{ color: 'white', fontSize: 10 }}
                        >
                          {isConnected ? "ON" : "OFF"}
                        </Chip>
                        <Badge style={{ backgroundColor: "#FF5722" }}>DEV</Badge>
                      </View>
                    )}
                    onPress={() => NavigationHelper.navigateToDebug(navigation)}
                  />
                </>
              )}
            </Surface>

            {/* Affichage des statistiques de connexion en mode dev */}
            {(envConfig.environment === 'development' || __DEV__) && connectionStats && (
              <Surface style={styles.statsCard}>
                <Text style={styles.statsTitle}>📊 Socket.io Stats</Text>
                <View style={styles.statsRow}>
                  <Text style={styles.statsLabel}>Messages:</Text>
                  <Text style={styles.statsValue}>
                    ↑{connectionStats.messagesSent || 0} ↓{connectionStats.messagesReceived || 0}
                  </Text>
                </View>
                <View style={styles.statsRow}>
                  <Text style={styles.statsLabel}>Latence:</Text>
                  <Text style={styles.statsValue}>
                    {connectionStats.latency || 0}ms
                  </Text>
                </View>
                <View style={styles.statsRow}>
                  <Text style={styles.statsLabel}>Transport:</Text>
                  <Text style={styles.statsValue}>
                    {String(connectionStats.transport || 'N/A')}
                  </Text>
                </View>
              </Surface>
            )}

            <Surface style={styles.infoCard}>
              <Icon name="information" size={24} color={theme.colors.primary} />
              <Text style={styles.infoText}>
                En tant que manager, vous pouvez accéder aux vues Service et
                Cuisine pour superviser les opérations en temps réel.
                {isConnected && " Les notifications sont actives."}
              </Text>
            </Surface>
          </View>
        )}
      </Surface>

      {/* Snackbar pour les notifications */}
      <Snackbar
        visible={snackbar.visible}
        onDismiss={() => setSnackbar({ ...snackbar, visible: false })}
        duration={4000}
        action={
          snackbar.type === "info" && notificationCount > 0
            ? {
                label: "Voir",
                onPress: () => navigation.navigate("PendingValidations" as never),
              }
            : undefined
        }
        style={[
          styles.snackbar,
          snackbar.type === "error" && styles.snackbarError,
          snackbar.type === "success" && styles.snackbarSuccess,
        ]}
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
  content: {
    flex: 1,
    padding: 16,
  },
  viewSelector: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 12,
  },
  segmentedButtons: {
    marginTop: 8,
  },
  overviewContainer: {
    flex: 1,
  },
  quickAccessCard: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 12,
  },
  divider: {
    marginBottom: 12,
  },
  infoCard: {
    padding: 16,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#E3F2FD",
  },
  infoText: {
    flex: 1,
    marginLeft: 12,
    fontSize: 14,
    lineHeight: 20,
  },
  modalContainer: {
    padding: 20,
  },
  modalContent: {
    borderRadius: 12,
    padding: 0,
    overflow: "hidden",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "bold",
    padding: 16,
    textAlign: "center",
  },
  modalDivider: {
    marginBottom: 8,
  },
  connectionIndicator: {
    marginRight: 8,
  },
  notificationBadge: {
    position: 'absolute',
    top: 8,
    right: 48,
    backgroundColor: '#FF5722',
  },
  statsCard: {
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
    backgroundColor: '#f8f8f8',
  },
  statsTitle: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  statsRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    paddingVertical: 2,
  },
  statsLabel: {
    fontSize: 12,
    color: '#666',
  },
  statsValue: {
    fontSize: 12,
    fontWeight: '600',
  },
  snackbar: {
    bottom: 0,
  },
  snackbarError: {
    backgroundColor: "#D32F2F",
  },
  snackbarSuccess: {
    backgroundColor: "#4CAF50",
  },
});