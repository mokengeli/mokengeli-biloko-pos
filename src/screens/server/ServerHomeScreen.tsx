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
import {
  webSocketService,
  OrderNotification,
  OrderNotificationStatus,
} from "../../services/WebSocketService";
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
          // Cela peut être adapté selon vos besoins spécifiques
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
      const tableOrdersMap = new Map<number, DomainOrder[]>(); // Map pour stocker les commandes actives par table

      // Pour chaque table, vérifier s'il existe des commandes actives
      for (const table of tablesResponse.content) {
        try {
          const activeOrders = await orderService.getActiveOrdersByTable(
            table.id
          );
          tableOrdersMap.set(table.id, activeOrders); // Stocker les commandes, pas juste un boolean
        } catch (err) {
          console.error(
            `Error fetching active orders for table ${table.id}:`,
            err
          );
          tableOrdersMap.set(table.id, []); // Tableau vide en cas d'erreur
        }
      }

      // AJOUTER cette fonction helper
      const calculateOccupationTime = (orders: DomainOrder[]): number => {
        if (orders.length === 0) return 0;

        // Trouver la commande la plus ancienne
        const oldestOrder = orders.reduce((oldest, current) => {
          const oldestTime = new Date(oldest.orderDate).getTime();
          const currentTime = new Date(current.orderDate).getTime();
          console.log({ oldestTime, currentTime });
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
            ? calculateOccupationTime(activeOrders) // Temps réel calculé
            : undefined,
          orderCount: activeOrders.length, // Nombre réel de commandes
        });
      }

      setTables(tablesWithStatus);

      // Charger les plats prêts à servir
      const readyItemsCount = await loadReadyDishes();

      // Les tâches urgentes seront mises à jour par la fonction loadReadyDishes
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
        // Navigation vers l'écran de création de commande
        // Le mode d'ajout est déjà configuré dans TableDetailDialog via setEditMode
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
      // Fermer le dialogue de la table
      setTableDialogVisible(false);

      // Naviguer vers l'écran de préparation d'addition
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

      // Formater les données pour l'impression
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
        // Afficher une confirmation ou notification d'impression réussie
      } catch (error) {
        // Gérer l'erreur d'impression
        console.error("Erreur d'impression:", error);
      }
    },
    [printDocument]
  );

  // Naviguer vers la page des plats prêts
  const handleReadyDishes = useCallback(() => {
    // Naviguer vers l'écran des plats prêts à servir
    navigation.navigate("ReadyDishes", {});
  }, [navigation]);

  // Configuration du WebSocket
  useEffect(() => {
    if (!user?.tenantCode) return;

    // Se connecter au WebSocket
    webSocketService.connect(user.tenantCode).catch((error) => {
      console.error("WebSocket connection error:", error);
      setError("Erreur de connexion au service de notification en temps réel");
    });

    // S'abonner aux notifications
    const unsubscribe = webSocketService.addSubscription(
      user.tenantCode,
      handleOrderNotification
    );

    // Nettoyage à la destruction du composant
    return () => {
      unsubscribe();
    };
  }, [user?.tenantCode]);

  // Fonction pour marquer une table comme récemment modifiée (pour l'animation)
  const markTableAsRecentlyChanged = useCallback((tableId: number) => {
    setRecentlyChangedTables((prev) => [...prev, tableId]);

    // Retirer la marque après un délai (pour terminer l'animation)
    setTimeout(() => {
      setRecentlyChangedTables((prev) => prev.filter((id) => id !== tableId));
    }, 3000); // Animation de 3 secondes
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

  // Gestionnaire de notifications WebSocket
  const handleOrderNotification = useCallback(
    (notification: OrderNotification) => {
      console.log("Notification reçue:", notification);

      // Gestion des mises à jour de statut de table
      if (
        notification.orderStatus ===
          OrderNotificationStatus.TABLE_STATUS_UPDATE &&
        notification.tableId
      ) {
        console.log(
          `Table #${notification.tableId} nouvelle statut: ${notification.tableState}`
        );

        // Mise à jour du statut de la table selon la notification
        setTables((prevTables) =>
          prevTables.map((table) => {
            if (table.tableData.id === notification.tableId) {
              // Marquer la table comme récemment modifiée
              markTableAsRecentlyChanged(notification.tableId);

              return {
                ...table,
                status: notification.tableState.toLowerCase() as TableStatus,
                // Réinitialiser les propriétés quand la table devient libre
                ...(notification.tableState === "FREE"
                  ? {
                      occupationTime: undefined,
                      orderCount: 0,
                    }
                  : {}),
              };
            }
            return table;
          })
        );
      }
      // Gestion des nouvelles commandes
      else if (
        notification.orderStatus === OrderNotificationStatus.NEW_ORDER &&
        notification.tableId
      ) {
        // Marquer la table comme récemment modifiée
        markTableAsRecentlyChanged(notification.tableId);

        // Mettre à jour la table avec le statut provenant du payload
        setTables((prevTables) =>
          prevTables.map((table) => {
            if (table.tableData.id === notification.tableId) {
              return {
                ...table,
                status: notification.tableState.toLowerCase() as TableStatus,
                occupationTime:
                  table.status === "free" ? 1 : table.occupationTime || 1,
                orderCount: (table.orderCount || 0) + 1,
              };
            }
            return table;
          })
        );
      }
      // Autres types de notifications (mises à jour de plats, etc.)
      else {
        // Mettre à jour la table avec le statut actuel si disponible
        if (notification.tableId && notification.tableState) {
          setTables((prevTables) =>
            prevTables.map((table) => {
              if (table.tableData.id === notification.tableId) {
                // Marquer la table comme récemment modifiée pour les changements significatifs
                if (table.status !== notification.tableState.toLowerCase()) {
                  markTableAsRecentlyChanged(notification.tableId);
                }

                return {
                  ...table,
                  status: notification.tableState.toLowerCase() as TableStatus,
                  // Réinitialiser les propriétés quand la table devient libre
                  ...(notification.tableState === "FREE"
                    ? {
                        occupationTime: undefined,
                        orderCount: 0,
                      }
                    : {}),
                };
              }
              return table;
            })
          );
        }

        // Traiter les autres événements (plats prêts, etc.)
        if (
          notification.newState === "READY" ||
          notification.newState === "COOKED"
        ) {
          loadReadyDishes();
        } else if (
          notification.newState === "SERVED" ||
          notification.newState === "PAID"
        ) {
          loadReadyDishes();
        }
      }
    },
    [loadReadyDishes, markTableAsRecentlyChanged]
  );
  // Charger les données au démarrage et à chaque fois que l'écran est affiché
  useEffect(() => {
    loadData();
  }, [loadData]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

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
                // Si c'est une tâche de plats prêts, naviguer vers l'écran des plats prêts
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

      {/* Bouton d'action flottant pour ajouter rapidement une commande */}
      <FAB.Group
        open={fabOpen}
        icon={fabOpen ? "close" : "menu"}
        actions={[
          {
            icon: "account",
            label: "Mon compte",
            onPress: () => {
              navigation.navigate("ProfilHome");
            },
          },
        ]}
        onStateChange={({ open }) => setFabOpen(open)}
        onPress={() => {
          if (fabOpen) {
            // Fermer le menu
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
        onServeReadyDishes={handleServeReadyDishes} // Ajout de la nouvelle prop
      />

      {/* Dialogue pour les fonctionnalités non disponibles */}
      <NotAvailableDialog
        visible={notAvailableDialog.visible}
        onDismiss={() =>
          setNotAvailableDialog({ visible: false, featureName: "" })
        }
        featureName={notAvailableDialog.featureName}
      />
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
});
