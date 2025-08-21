// src/screens/server/ServerHomeScreen.tsx
import React, { useState, useEffect, useCallback } from "react";
import { View, StyleSheet} from "react-native";
import {
  Appbar,
  Text,
  ActivityIndicator,
  Surface,
  useTheme,
  FAB,
  Snackbar,
} from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { StackNavigationProp } from "@react-navigation/stack";
import { useAuth } from "../../contexts/AuthContext";
import { RolesUtils, Role } from "../../utils/roles";
import {
  TableGrid,
  TableStatus,
  TableWithStatus,
} from "../../components/server/TableGrid";
import { QuickActions } from "../../components/server/QuickActions";
import { UrgentTasks, UrgentTask } from "../../components/server/UrgentTasks";
import { TableDetailDialog } from "../../components/server/TableDetailDialog";
import { NotAvailableDialog } from "../../components/common/NotAvailableDialog";
import { usePrinter } from "../../hooks/usePrinter";
import tableService from "../../api/tableService";
import orderService, { DomainOrder } from "../../api/orderService";
// CHANGEMENT: Import Socket.io au lieu de WebSocketService
import { 
  useSocketConnection, 
  useOrderNotifications,
  useSocketEvent 
} from "../../hooks/useSocketConnection";
import { OrderNotificationStatus } from "../../services/SocketIOService";
import { HeaderMenu } from "../../components/common/HeaderMenu";

// Types pour la navigation
type ServerStackParamList = {
  ServerHome: undefined;
  CreateOrder: {
    tableId: number;
    tableName: string;
  };
  ReadyDishes: {
    tableId?: string;
    tableName?: string;
  };
  PrepareBill: {
    orderId: number;
    tableId?: number;
    tableName?: string;
  };
  SplitBill: {
    orderId: number;
    tableName?: string;
    billItems: any[];
    totalAmount: number;
    splitType: "perPerson" | "custom";
    numberOfPeople: number;
    currency: string;
  };
  Payment: {
    orderId: number;
    tableName?: string;
    bills: any[];
    totalAmount: number;
    currency: string;
  };
};

type ServerHomeScreenNavigationProp = StackNavigationProp<
  ServerStackParamList,
  "ServerHome"
>;

interface ServerHomeScreenProps {
  navigation: ServerHomeScreenNavigationProp;
}

export const ServerHomeScreen: React.FC<ServerHomeScreenProps> = ({
  navigation,
}) => {
  const { user } = useAuth();
  const theme = useTheme();
  const { printDocument } = usePrinter();

  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tables, setTables] = useState<TableWithStatus[]>([]);
  const [urgentTasks, setUrgentTasks] = useState<UrgentTask[]>([]);
  const [readyCount, setReadyCount] = useState(0);
  const [error, setError] = useState<string | null>(null);

  const [fabOpen, setFabOpen] = useState(false);

  // États pour les dialogues
  const [selectedTable, setSelectedTable] = useState<TableWithStatus | null>(
    null
  );
  const [tableOrders, setTableOrders] = useState<DomainOrder[]>([]);
  const [tableDialogVisible, setTableDialogVisible] = useState(false);
  const [notAvailableDialog, setNotAvailableDialog] = useState({
    visible: false,
    featureName: "",
  });
  const isManager = RolesUtils.hasRole(user?.roles, Role.MANAGER);

  const [recentlyChangedTables, setRecentlyChangedTables] = useState<number[]>(
    []
  );

  // État pour les notifications Snackbar
  const [snackbar, setSnackbar] = useState({
    visible: false,
    message: "",
    type: "info" as "info" | "error" | "success",
  });

  // ============================================================================
  // CHANGEMENT: Utilisation de Socket.io au lieu de WebSocketService
  // ============================================================================
  
  // Connexion Socket.io
  const { 
    isConnected, 
    status: connectionStatus,
    stats: connectionStats 
  } = useSocketConnection({
    autoConnect: true,
    showStatusNotifications: false,
    reconnectOnFocus: true
  });

  // Écouter les notifications de commande
  const { 
    notifications, 
    lastNotification 
  } = useOrderNotifications({
    onNotification: (notification) => {
      console.log("Server received notification:", notification);
      
      // Traiter selon le type de notification
      switch (notification.orderStatus) {
        case OrderNotificationStatus.TABLE_STATUS_UPDATE:
          // Mise à jour du statut de table
          if (notification.tableId) {
            handleTableStatusUpdate(notification);
          }
          break;
          
        case OrderNotificationStatus.NEW_ORDER:
          // Nouvelle commande
          if (notification.tableId) {
            updateTableForNewOrder(notification);
            showNotification(`Nouvelle commande table ${notification.tableId}`, "success");
          }
          break;
          
        case OrderNotificationStatus.DISH_UPDATE:
          // Mise à jour de plat
          if (notification.newState === "READY" || notification.newState === "COOKED") {
            loadReadyDishes();
            showNotification(`Plats prêts pour la table ${notification.tableId}`, "info");
          } else if (notification.newState === "SERVED") {
            loadReadyDishes();
          }
          break;
          
        case OrderNotificationStatus.PAYMENT_UPDATE:
          // Mise à jour de paiement
          if (notification.newState === "PAID" || notification.newState === "FULLY_PAID") {
            handlePaymentUpdate(notification);
          }
          break;
          
        default:
          // Recharger les données pour les autres types
          loadData();
          break;
      }
    }
  });

  // Écouter les événements spécifiques de table
  useSocketEvent('table:update', (data: any) => {
    console.log("Table update event:", data);
    if (data.tableId) {
      markTableAsRecentlyChanged(data.tableId);
      // Mettre à jour le statut de la table
      setTables(prev => prev.map(table => 
        table.tableData.id === data.tableId
          ? { ...table, status: data.status as TableStatus }
          : table
      ));
    }
  });

  // Écouter les plats prêts
  useSocketEvent('dish:ready', (data: any) => {
    console.log("Dish ready event:", data);
    loadReadyDishes();
    if (data.tableName) {
      showNotification(`Plats prêts pour ${data.tableName}`, "success");
    }
  });

  // Fonction pour afficher une notification
  const showNotification = (message: string, type: "info" | "error" | "success" = "info") => {
    setSnackbar({
      visible: true,
      message,
      type
    });
  };

  // Gérer la mise à jour du statut de table
  const handleTableStatusUpdate = useCallback((notification: any) => {
    const { tableId, tableState } = notification;
    
    console.log(`Table #${tableId} status update: ${tableState}`);
    
    setTables(prev => prev.map(table => {
      if (table.tableData.id === tableId) {
        markTableAsRecentlyChanged(tableId);
        
        return {
          ...table,
          status: tableState.toLowerCase() as TableStatus,
          ...(tableState === "FREE" ? {
            occupationTime: undefined,
            orderCount: 0
          } : {})
        };
      }
      return table;
    }));
  }, []);

  // Gérer une nouvelle commande
  const updateTableForNewOrder = useCallback((notification: any) => {
    const { tableId, tableState } = notification;
    
    markTableAsRecentlyChanged(tableId);
    
    setTables(prev => prev.map(table => {
      if (table.tableData.id === tableId) {
        return {
          ...table,
          status: (tableState?.toLowerCase() || "occupied") as TableStatus,
          occupationTime: table.status === "free" ? 1 : table.occupationTime || 1,
          orderCount: (table.orderCount || 0) + 1
        };
      }
      return table;
    }));
  }, []);

  // Gérer une mise à jour de paiement
  const handlePaymentUpdate = useCallback((notification: any) => {
    const { tableId, newState } = notification;
    
    if (newState === "FULLY_PAID" && tableId) {
      // Table peut être libérée après paiement complet
      setTimeout(() => {
        loadData(); // Recharger pour vérifier le statut réel
      }, 2000);
    }
  }, []);

  // ============================================================================
  // FIN DES CHANGEMENTS Socket.io
  // ============================================================================

  // Générer un ID unique pour les tâches
  const generateTaskId = useCallback(() => {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
  }, []);

  // Charger les plats prêts à servir
  const loadReadyDishes = useCallback(async () => {
    if (!user?.tenantCode) return 0;

    try {
      // Récupérer toutes les commandes avec des plats prêts
      const readyOrders = await orderService.getOrdersByState("READY");

      // Compter les plats prêts
      let readyItemsCount = 0;
      readyOrders.forEach((order) => {
        order.items.forEach((item) => {
          if (item.state === "READY" || item.state === "COOKED") {
            readyItemsCount++;
          }
        });
      });

      // Mettre à jour le compteur
      setReadyCount(readyItemsCount);

      // Mettre à jour les tâches urgentes pour les plats prêts
      if (readyItemsCount > 0) {
        setUrgentTasks((prevTasks) => {
          // Conserver les tâches existantes non liées aux plats prêts
          const nonReadyDishTasks = prevTasks.filter(
            (task) => task.type !== "dish_ready"
          );

          // Extraire les tâches existantes liées aux plats prêts pour préserver leur ordre
          const existingReadyDishTasks = prevTasks.filter(
            (task) => task.type === "dish_ready"
          );

          // Créer un Map des tables avec des plats prêts
          const tableWithReadyDishes = new Map<
            string,
            { count: number; orderId: number; tableId: number }
          >();

          // Remplir le Map avec les informations des plats prêts
          readyOrders.forEach((order) => {
            const readyItemsInOrder = order.items.filter(
              (item) => item.state === "READY" || item.state === "COOKED"
            ).length;

            if (readyItemsInOrder > 0) {
              if (tableWithReadyDishes.has(order.tableName)) {
                const existing = tableWithReadyDishes.get(order.tableName)!;
                tableWithReadyDishes.set(order.tableName, {
                  count: existing.count + readyItemsInOrder,
                  orderId: order.id,
                  tableId: order.tableId,
                });
              } else {
                tableWithReadyDishes.set(order.tableName, {
                  count: readyItemsInOrder,
                  orderId: order.id,
                  tableId: order.tableId,
                });
              }
            }
          });

          // Mettre à jour les tâches existantes ou créer de nouvelles tâches
          const updatedReadyDishTasks: UrgentTask[] = [];
          const tablesWithExistingTasks = new Set<string>();

          // D'abord, mettre à jour les tâches existantes pour préserver leur ordre
          existingReadyDishTasks.forEach((task) => {
            if (task.tableName && tableWithReadyDishes.has(task.tableName)) {
              // La table a encore des plats prêts
              const info = tableWithReadyDishes.get(task.tableName)!;
              tablesWithExistingTasks.add(task.tableName);

              // Mettre à jour la tâche existante
              updatedReadyDishTasks.push({
                ...task,
                description: `${info.count} plat${
                  info.count > 1 ? "s" : ""
                } pour la table ${task.tableName}`,
                timestamp: new Date().toISOString(), // Mettre à jour le timestamp pour indiquer une mise à jour
              });
            }
            // Si la table n'a plus de plats prêts, ne pas inclure cette tâche
          });

          // Ensuite, créer des nouvelles tâches pour les tables qui n'en avaient pas
          tableWithReadyDishes.forEach((info, tableName) => {
            if (!tablesWithExistingTasks.has(tableName)) {
              updatedReadyDishTasks.push({
                id: generateTaskId(),
                type: "dish_ready",
                title: "Plats prêts à servir",
                description: `${info.count} plat${
                  info.count > 1 ? "s" : ""
                } pour la table ${tableName}`,
                tableId: info.tableId.toString(), // Utiliser tableId comme identifiant
                tableName: tableName,
                timestamp: new Date().toISOString(),
                priority: "high",
              });
            }
          });

          // Trier les tâches par timestamp pour avoir les plus récentes en premier
          const sortedReadyDishTasks = updatedReadyDishTasks.sort(
            (a, b) =>
              new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime()
          );

          // Combiner les tâches non liées aux plats prêts avec les tâches de plats prêts mises à jour
          return [...nonReadyDishTasks, ...sortedReadyDishTasks];
        });
      } else {
        // S'il n'y a pas de plats prêts, supprimer toutes les tâches de plats prêts
        setUrgentTasks((prevTasks) =>
          prevTasks.filter((task) => task.type !== "dish_ready")
        );
      }

      return readyItemsCount;
    } catch (err) {
      console.error("Error loading ready dishes:", err);
      return 0;
    }
  }, [user?.tenantCode, generateTaskId]);

  // Charger les données initiales
  const loadData = useCallback(async () => {
    if (!user?.tenantCode) {
      setError("Code de restaurant non disponible");
      setIsLoading(false);
      return;
    }

    setIsLoading(true);
    setError(null);

    try {
      // Charger les tables
      const tablesResponse = await tableService.getTables(user.tenantCode);

      // Charger les commandes actives pour déterminer le statut des tables
      const tablesWithStatus: TableWithStatus[] = [];
      const tableOrdersMap = new Map<number, DomainOrder[]>();

      // Pour chaque table, vérifier s'il existe des commandes actives
      for (const table of tablesResponse.content) {
        try {
          const activeOrders = await orderService.getActiveOrdersByTable(
            table.id
          );
          tableOrdersMap.set(table.id, activeOrders);
        } catch (err) {
          console.error(
            `Error fetching active orders for table ${table.id}:`,
            err
          );
          tableOrdersMap.set(table.id, []);
        }
      }

      // Fonction pour calculer le temps d'occupation
      const calculateOccupationTime = (orders: DomainOrder[]): number => {
        if (orders.length === 0) return 0;

        // Trouver la commande la plus ancienne
        const oldestOrder = orders.reduce((oldest, current) => {
          const oldestTime = new Date(oldest.orderDate).getTime();
          const currentTime = new Date(current.orderDate).getTime();
          return currentTime < oldestTime ? current : oldest;
        });

        // Calculer le temps écoulé en minutes
        const now = new Date().getTime();
        const orderTime = new Date(oldestOrder.orderDate).getTime();
        return Math.floor((now - orderTime) / (1000 * 60));
      };

      // Créer la liste finale des tables avec leur statut
      for (const table of tablesResponse.content) {
        const activeOrders = tableOrdersMap.get(table.id) || [];
        const isOccupied = activeOrders.length > 0;

        tablesWithStatus.push({
          tableData: table,
          status: isOccupied ? "occupied" : "free",
          occupationTime: isOccupied
            ? calculateOccupationTime(activeOrders)
            : undefined,
          orderCount: activeOrders.length,
        });
      }

      setTables(tablesWithStatus);

      // Charger les plats prêts à servir
      await loadReadyDishes();

    } catch (err: any) {
      console.error("Error loading data:", err);
      setError(err.message || "Erreur lors du chargement des données");
    } finally {
      setIsLoading(false);
      setRefreshing(false);
    }
  }, [user?.tenantCode, loadReadyDishes]);

  // Rafraîchir les données
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData();
  }, [loadData]);

  // Ouvrir le détail d'une table
  const handleTablePress = useCallback(async (table: TableWithStatus) => {
    setSelectedTable(table);

    try {
      // Récupérer les commandes actives pour cette table
      const activeOrders = await orderService.getActiveOrdersByTable(
        table.tableData.id
      );
      setTableOrders(activeOrders);
    } catch (err) {
      console.error("Error fetching active orders:", err);
      setTableOrders([]);
    }

    setTableDialogVisible(true);
  }, []);

  // Ajouter une nouvelle fonction pour servir les plats prêts
  const handleServeReadyDishes = useCallback(
    (order: DomainOrder) => {
      // Naviguer vers l'écran des plats prêts à servir, filtré par table
      navigation.navigate("ReadyDishes", {
        tableId: order.tableId.toString(),
        tableName: order.tableName,
      });

      // Fermer la modal
      setTableDialogVisible(false);
    },
    [navigation]
  );

  // Gérer l'action "Nouvelle commande"
  const handleNewOrder = useCallback(() => {
    if (selectedTable) {
      navigation.navigate("CreateOrder", {
        tableId: selectedTable.tableData.id,
        tableName: selectedTable.tableData.name,
      });
    }
    setTableDialogVisible(false);
  }, [selectedTable, navigation]);

  // Gérer l'action "Ajouter à la commande"
  const handleAddToOrder = useCallback(
    (order: DomainOrder) => {
      if (selectedTable) {
        navigation.navigate("CreateOrder", {
          tableId: selectedTable.tableData.id,
          tableName: selectedTable.tableData.name,
        });
      }
      setTableDialogVisible(false);
    },
    [navigation, selectedTable]
  );

  // Gérer l'action "Demander l'addition"
  const handleRequestBill = useCallback(
    (order: DomainOrder) => {
      setTableDialogVisible(false);

      navigation.navigate("PrepareBill", {
        orderId: order.id,
        tableId: order.tableId,
        tableName: order.tableName,
      });
    },
    [navigation]
  );

  // Gérer l'action "Imprimer le ticket"
  const handlePrintTicket = useCallback(
    async (order: DomainOrder) => {
      setTableDialogVisible(false);

      const ticketContent = `
    COMMANDE #${order.id}
    Table: ${order.tableName}
    Date: ${new Date(order.orderDate).toLocaleString()}
    
    ARTICLES:
    ${order.items
      .map(
        (item) =>
          `${item.count}x ${item.dishName} - ${item.unitPrice.toFixed(2)}${
            order.currency.code
          }`
      )
      .join("\n")}
    
    TOTAL: ${order.totalPrice.toFixed(2)}${order.currency.code}
    `;

      try {
        await printDocument(ticketContent);
        showNotification("Ticket imprimé avec succès", "success");
      } catch (error) {
        console.error("Erreur d'impression:", error);
        showNotification("Erreur lors de l'impression", "error");
      }
    },
    [printDocument]
  );

  // Naviguer vers la page des plats prêts
  const handleReadyDishes = useCallback(() => {
    navigation.navigate("ReadyDishes", {});
  }, [navigation]);

  // Fonction pour marquer une table comme récemment modifiée (pour l'animation)
  const markTableAsRecentlyChanged = useCallback((tableId: number) => {
    setRecentlyChangedTables((prev) => [...prev, tableId]);

    setTimeout(() => {
      setRecentlyChangedTables((prev) => prev.filter((id) => id !== tableId));
    }, 3000);
  }, []);

  // Définir les items de menu additionnels pour les serveurs
  const serverMenuItems = [
    {
      title: "Configuration d'impression",
      icon: "printer",
      onPress: () =>
        setNotAvailableDialog({
          visible: true,
          featureName: "Configuration d'impression",
        }),
      dividerAfter: true,
    },
  ];

  // Charger les données au démarrage et à chaque fois que l'écran est affiché
  useEffect(() => {
    loadData();
  }, [loadData]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  // Afficher l'état de connexion Socket.io
  useEffect(() => {
    if (!isConnected && !isLoading) {
      showNotification("Connexion au serveur perdue. Reconnexion...", "error");
    } else if (isConnected && connectionStats?.reconnectAttempts > 0) {
      showNotification("Reconnexion établie", "success");
    }
  }, [isConnected, connectionStats?.reconnectAttempts]);

  if (isLoading && !refreshing) {
    return (
      <View style={styles.loadingContainer}>
        <ActivityIndicator size="large" color={theme.colors.primary} />
        <Text style={styles.loadingText}>Chargement...</Text>
      </View>
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={["left", "right"]}>
      <Appbar.Header style={styles.appbar}>
        {/* Bouton de retour pour les managers */}
        {isManager && (
          <Appbar.BackAction
            onPress={() => navigation.navigate("ManagerHome" as never)}
          />
        )}
        <Appbar.Content
          title="Mokengeli Biloko POS"
          subtitle={`${RolesUtils.getRoleDescription(Role.SERVER)}: ${
            user?.firstName || ""
          } ${user?.lastName || ""}`}
        />
        <HeaderMenu additionalItems={serverMenuItems} />
      </Appbar.Header>

      <QuickActions
        onReady={handleReadyDishes}
        readyCount={readyCount}
        disabled={isLoading}
      />

      <View style={styles.contentContainer}>
        {error ? (
          <Surface style={styles.errorContainer}>
            <Text style={styles.errorText}>{error}</Text>
          </Surface>
        ) : (
          <View style={styles.mainContent}>
            <Text style={styles.sectionTitle}>Plan de salle</Text>
            <TableGrid
              tables={tables}
              onTablePress={handleTablePress}
              isLoading={isLoading}
              refreshing={refreshing}
              onRefresh={onRefresh}
              recentlyChangedTables={recentlyChangedTables}
            />

            <UrgentTasks
              tasks={urgentTasks}
              onTaskPress={(task) => {
                if (task.type === "dish_ready") {
                  navigation.navigate("ReadyDishes", {
                    tableId: task.tableId,
                    tableName: task.tableName,
                  });
                } else {
                  setNotAvailableDialog({
                    visible: true,
                    featureName: "Détails de la tâche",
                  });
                }
              }}
              isLoading={isLoading}
            />
          </View>
        )}
      </View>

      {/* Bouton d'action flottant */}
      <FAB.Group
        open={fabOpen}
        icon={fabOpen ? "close" : "menu"}
        actions={[
          {
            icon: "account",
            label: "Mon compte",
            onPress: () => {
              navigation.navigate("ProfilHome" as never);
            },
          },
        ]}
        onStateChange={({ open }) => setFabOpen(open)}
        onPress={() => {
          if (fabOpen) {
            setFabOpen(false);
          }
        }}
        fabStyle={{
          borderRadius: 16,
        }}
      />

      {/* Dialogue de détail de table */}
      <TableDetailDialog
        visible={tableDialogVisible}
        onDismiss={() => setTableDialogVisible(false)}
        table={selectedTable}
        orders={tableOrders}
        onNewOrder={handleNewOrder}
        onAddToOrder={handleAddToOrder}
        onRequestBill={handleRequestBill}
        onPrintTicket={handlePrintTicket}
        onServeReadyDishes={handleServeReadyDishes}
      />

      {/* Dialogue pour les fonctionnalités non disponibles */}
      <NotAvailableDialog
        visible={notAvailableDialog.visible}
        onDismiss={() =>
          setNotAvailableDialog({ visible: false, featureName: "" })
        }
        featureName={notAvailableDialog.featureName}
      />

      {/* Snackbar pour les notifications */}
      <Snackbar
        visible={snackbar.visible}
        onDismiss={() => setSnackbar({ ...snackbar, visible: false })}
        duration={3000}
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
  appbar: {
    height: 56,
    paddingTop: 0,
  },
  contentContainer: {
    flex: 1,
    paddingBottom: 56,
  },
  mainContent: {
    flex: 1,
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
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginTop: 16,
    marginLeft: 16,
    marginBottom: 8,
  },
  errorContainer: {
    margin: 16,
    padding: 16,
    borderRadius: 8,
    backgroundColor: "#ffe6e6",
  },
  errorText: {
    color: "#d32f2f",
    textAlign: "center",
  },
  fab: {
    position: "absolute",
    margin: 16,
    right: 0,
    bottom: 0,
    height: 48,
    width: 48,
    borderRadius: 24,
    justifyContent: "center",
    alignItems: "center",
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