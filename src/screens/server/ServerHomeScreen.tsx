// src/screens/server/ServerHomeScreen.tsx
import React, { useState, useEffect, useCallback } from "react";
import { View, StyleSheet, Animated } from "react-native";
import {
  Appbar,
  Text,
  ActivityIndicator,
  Surface,
  useTheme,
  FAB,
  Snackbar,
  Chip,
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
import { TableSearchBar } from "../../components/server/TableSearchBar";
import { NotAvailableDialog } from "../../components/common/NotAvailableDialog";
import { usePrinter } from "../../hooks/usePrinter";
import tableService from "../../api/tableService";
import orderService, { DomainOrder } from "../../api/orderService";
// CHANGEMENT: Import Socket.io au lieu de WebSocketService
import { 
  useSocketConnection, 
 
} from "../../hooks/useSocketConnection";
import { OrderNotificationStatus, ConnectionStatus } from "../../services/types/WebSocketTypes";
import { HeaderMenu } from "../../components/common/HeaderMenu";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import { useOrderNotifications } from "../../hooks/useOrderNotifications";
import { useSocketEvent } from "../../hooks/useSocketEvent";

// Types pour la navigation (restent identiques)
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
  // ... autres routes
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
  
  // States pour la pagination
  const [currentPage, setCurrentPage] = useState(0);
  const [totalPages, setTotalPages] = useState(0);
  const [hasMoreTables, setHasMoreTables] = useState(true);
  const [loadingMoreTables, setLoadingMoreTables] = useState(false);
  
  // States pour la recherche
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearchMode, setIsSearchMode] = useState(false);
  const [searchLoading, setSearchLoading] = useState(false);

  const [fabOpen, setFabOpen] = useState(false);

  // États pour les dialogues
  const [selectedTable, setSelectedTable] = useState<TableWithStatus | null>(null);
  const [tableOrders, setTableOrders] = useState<DomainOrder[]>([]);
  const [tableDialogVisible, setTableDialogVisible] = useState(false);
  const [notAvailableDialog, setNotAvailableDialog] = useState({
    visible: false,
    featureName: "",
  });
  
  const isManager = RolesUtils.hasRole(user?.roles, Role.MANAGER);

  // AMÉLIORATION: Animation pour les tables
  const [tableAnimations] = useState<Map<number, Animated.Value>>(new Map());
  const [recentlyChangedTables, setRecentlyChangedTables] = useState<number[]>([]);

  // État pour les notifications Snackbar
  const [snackbar, setSnackbar] = useState({
    visible: false,
    message: "",
    type: "info" as "info" | "error" | "success" | "warning",
  });

  // ============================================================================
  // Socket.io - Configuration complète
  // ============================================================================
  
  const { 
    isConnected, 
    status: connectionStatus,
    stats: connectionStats,
    emit
  } = useSocketConnection({
    autoConnect: true,
    showStatusNotifications: false,
    reconnectOnFocus: true
  });

  // Écouter les notifications de commande avec gestion optimisée
  const { 
    notifications, 
    lastNotification,
    count: notificationCount
  } = useOrderNotifications({
    onNotification: (notification) => {
      try {
        console.log("Server received notification:", notification);
        
        // ✅ VALIDATION: Vérifier les données critiques
        if (!notification || typeof notification.orderId !== 'number' || !notification.orderStatus) {
          console.warn('[ServerHome] Invalid notification data:', notification);
          return;
        }
        
        // Traiter selon le type de notification avec animations et protection
        try {
          switch (notification.orderStatus) {
        case OrderNotificationStatus.TABLE_STATUS_UPDATE:
          if (notification.tableId) {
            handleTableStatusUpdateWithAnimation(notification);
          }
          break;
          
        case OrderNotificationStatus.NEW_ORDER:
          if (notification.tableId) {
            updateTableForNewOrderWithAnimation(notification);
            showNotification(
              `📝 Nouvelle commande table ${notification.tableId}`, 
              "success"
            );
          }
          break;
          
        case OrderNotificationStatus.DISH_UPDATE:
          if (notification.newState === "READY" || notification.newState === "COOKED") {
            loadReadyDishes();
            animateReadyCount();
            showNotification(
              `🍽️ Plats prêts pour la table ${notification.tableId}`, 
              "warning"
            );
          } else if (notification.newState === "SERVED") {
            loadReadyDishes();
          }
          break;
          
        case OrderNotificationStatus.PAYMENT_UPDATE:
          if (notification.newState === "PAID" || notification.newState === "FULLY_PAID") {
            handlePaymentUpdateWithAnimation(notification);
            showNotification(
              `💰 Paiement reçu - Table ${notification.tableId}`, 
              "success"
            );
          }
          break;
          
        case OrderNotificationStatus.DEBT_VALIDATION_REQUEST:
          if (notification.tableId) {
            // Pas de rechargement complet, juste une animation légère
            animateTableChange(notification.tableId);
            showNotification(
              `📋 Demande de validation - Table ${notification.tableId}`, 
              "warning"
            );
          }
          break;
          
        case OrderNotificationStatus.ORDER_CLOSED_WITH_DEBT:
          if (notification.tableId) {
            // Mise à jour silencieuse - table libérée
            animateTableChange(notification.tableId);
            setTables(prev => prev.map(table => {
              if (table.tableData.id === notification.tableId) {
                return {
                  ...table,
                  status: "free" as TableStatus,
                  occupationTime: undefined,
                  orderCount: 0
                };
              }
              return table;
            }));
            showNotification(
              `💰 Table ${notification.tableId} fermée avec impayé`, 
              "warning"
            );
          }
          break;
          
        default:
          try {
            loadData();
          } catch (error) {
            console.error('[ServerHome] Error in default handler:', error);
          }
          break;
        }
        } catch (error) {
          console.error('[ServerHome] Error in notification switch:', error, notification);
          // Fallback: recharger les données
          try {
            loadData();
          } catch (fallbackError) {
            console.error('[ServerHome] Critical fallback error:', fallbackError);
          }
        }
      } catch (error) {
        console.error('[ServerHome] Critical error in onNotification:', error, notification);
      }
    }
  });

  // Écouter les événements spécifiques de table avec animation
  useSocketEvent('table:update', (data: any) => {
    console.log("Table update event:", data);
    if (data.tableId) {
      animateTableChange(data.tableId);
      setTables(prev => prev.map(table => 
        table.tableData.id === data.tableId
          ? { ...table, status: data.status as TableStatus }
          : table
      ));
    }
  });

  // Écouter les plats prêts avec compteur animé
  useSocketEvent('dish:ready', (data: any) => {
    console.log("Dish ready event:", data);
    loadReadyDishes();
    animateReadyCount();
    if (data.tableName) {
      showNotification(`🔔 Plats prêts pour ${data.tableName}`, "success");
      
      // Créer/Mettre à jour une tâche urgente
      addUrgentTask({
        type: "dish_ready",
        tableId: data.tableId,
        tableName: data.tableName,
        count: data.count || 1
      });
    }
  });

  // Fonction pour afficher une notification avec style
  const showNotification = (message: string, type: "info" | "error" | "success" | "warning" = "info") => {
    setSnackbar({
      visible: true,
      message,
      type
    });
  };

  // Animation pour les changements de table
  const animateTableChange = (tableId: number) => {
    if (!tableAnimations.has(tableId)) {
      tableAnimations.set(tableId, new Animated.Value(0));
    }
    
    const animation = tableAnimations.get(tableId)!;
    
    Animated.sequence([
      Animated.timing(animation, {
        toValue: 1,
        duration: 300,
        useNativeDriver: true
      }),
      Animated.timing(animation, {
        toValue: 0,
        duration: 300,
        delay: 2000,
        useNativeDriver: true
      })
    ]).start();
    
    markTableAsRecentlyChanged(tableId);
  };

  // Animation pour le compteur de plats prêts
  const animateReadyCount = () => {
    // Animation visuelle du badge de compteur (via state change)
    setReadyCount(prev => {
      // Forcer un re-render avec animation
      return prev;
    });
  };

  // Gérer la mise à jour du statut de table avec animation
  const handleTableStatusUpdateWithAnimation = useCallback((notification: any) => {
    const { tableId, tableState } = notification;
    
    console.log(`Table #${tableId} status update: ${tableState}`);
    animateTableChange(tableId);
    
    setTables(prev => prev.map(table => {
      if (table.tableData.id === tableId) {
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

  // Gérer une nouvelle commande avec animation
  const updateTableForNewOrderWithAnimation = useCallback((notification: any) => {
    const { tableId, tableState } = notification;
    
    animateTableChange(tableId);
    
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

  // Gérer une mise à jour de paiement avec animation silencieuse
  const handlePaymentUpdateWithAnimation = useCallback((notification: any) => {
    const { tableId, newState } = notification;
    
    if (newState === "FULLY_PAID" && tableId) {
      animateTableChange(tableId);
      
      // Mise à jour silencieuse du statut de la table seulement
      setTables(prev => prev.map(table => {
        if (table.tableData.id === tableId) {
          return {
            ...table,
            status: "free" as TableStatus,
            occupationTime: undefined,
            orderCount: 0
          };
        }
        return table;
      }));
    }
  }, []);

  // Ajouter une tâche urgente
  const addUrgentTask = useCallback((taskData: any) => {
    const newTask: UrgentTask = {
      id: generateTaskId(),
      type: taskData.type,
      title: taskData.type === "dish_ready" ? "Plats prêts à servir" : "Tâche urgente",
      description: `${taskData.count || 1} plat(s) pour la table ${taskData.tableName}`,
      tableId: taskData.tableId?.toString(),
      tableName: taskData.tableName,
      timestamp: new Date().toISOString(),
      priority: "high",
    };
    
    setUrgentTasks(prev => {
      const filtered = prev.filter(t => 
        !(t.type === taskData.type && t.tableId === taskData.tableId?.toString())
      );
      return [newTask, ...filtered];
    });
  }, []);

  // Générer un ID unique pour les tâches
  const generateTaskId = useCallback(() => {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
  }, []);

  // Marquer une table comme récemment modifiée
  const markTableAsRecentlyChanged = useCallback((tableId: number) => {
    setRecentlyChangedTables(prev => {
      if (!prev.includes(tableId)) {
        return [...prev, tableId];
      }
      return prev;
    });

    setTimeout(() => {
      setRecentlyChangedTables(prev => prev.filter(id => id !== tableId));
    }, 3000);
  }, []);

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

  // Obtenir l'icône du statut
  const getConnectionIcon = () => {
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
  };

  // [Les fonctions de chargement de données restent identiques...]
  const loadReadyDishes = useCallback(async () => {
    if (!user?.tenantCode) return 0;

    try {
      const readyOrders = await orderService.getOrdersByState("READY");
      let readyItemsCount = 0;
      
      readyOrders.forEach((order) => {
        order.items.forEach((item) => {
          if (item.state === "READY" || item.state === "COOKED") {
            readyItemsCount++;
          }
        });
      });

      setReadyCount(readyItemsCount);
      
      // Mise à jour des tâches urgentes
      if (readyItemsCount > 0) {
        setUrgentTasks((prevTasks) => {
          const nonReadyDishTasks = prevTasks.filter(task => task.type !== "dish_ready");
          const tableWithReadyDishes = new Map();

          readyOrders.forEach((order) => {
            const readyItemsInOrder = order.items.filter(
              item => item.state === "READY" || item.state === "COOKED"
            ).length;

            if (readyItemsInOrder > 0) {
              if (tableWithReadyDishes.has(order.tableName)) {
                const existing = tableWithReadyDishes.get(order.tableName);
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

          const newReadyDishTasks: UrgentTask[] = [];
          tableWithReadyDishes.forEach((info, tableName) => {
            newReadyDishTasks.push({
              id: generateTaskId(),
              type: "dish_ready",
              title: "Plats prêts à servir",
              description: `${info.count} plat${info.count > 1 ? "s" : ""} pour la table ${tableName}`,
              tableId: info.tableId.toString(),
              tableName: tableName,
              timestamp: new Date().toISOString(),
              priority: "high",
            });
          });

          return [...nonReadyDishTasks, ...newReadyDishTasks];
        });
      } else {
        setUrgentTasks(prevTasks => prevTasks.filter(task => task.type !== "dish_ready"));
      }

      return readyItemsCount;
    } catch (err) {
      console.error("Error loading ready dishes:", err);
      return 0;
    }
  }, [user?.tenantCode, generateTaskId]);

  const loadData = useCallback(async (page: number = 0, append: boolean = false) => {
    if (!user?.tenantCode) {
      setError("Code de restaurant non disponible");
      setIsLoading(!append);
      return;
    }

    // Ne pas charger les données normales si on est en mode recherche
    if (isSearchMode && !append) {
      return;
    }

    if (!append) {
      setIsLoading(true);
      setCurrentPage(0);
      setHasMoreTables(true);
    } else {
      setLoadingMoreTables(true);
    }
    setError(null);

    try {
      const tablesResponse = await tableService.getTables(user.tenantCode, page, 10);
      const tablesWithStatus: TableWithStatus[] = [];
      const tableOrdersMap = new Map<number, DomainOrder[]>();

      // Mettre à jour les informations de pagination
      setTotalPages(tablesResponse.totalPages);
      setHasMoreTables(!tablesResponse.last);
      setCurrentPage(page);

      for (const table of tablesResponse.content) {
        try {
          const activeOrders = await orderService.getActiveOrdersByTable(table.id);
          tableOrdersMap.set(table.id, activeOrders);
        } catch (err) {
          console.error(`Error fetching active orders for table ${table.id}:`, err);
          tableOrdersMap.set(table.id, []);
        }
      }

      const calculateOccupationTime = (orders: DomainOrder[]): number => {
        if (orders.length === 0) return 0;
        const oldestOrder = orders.reduce((oldest, current) => {
          const oldestTime = new Date(oldest.orderDate).getTime();
          const currentTime = new Date(current.orderDate).getTime();
          return currentTime < oldestTime ? current : oldest;
        });
        const now = new Date().getTime();
        const orderTime = new Date(oldestOrder.orderDate).getTime();
        return Math.floor((now - orderTime) / (1000 * 60));
      };

      for (const table of tablesResponse.content) {
        const activeOrders = tableOrdersMap.get(table.id) || [];
        const isOccupied = activeOrders.length > 0;
        
        // Vérifier si cette table a des validations en attente
        const hasPendingValidation = activeOrders.some(order => 
          order.paymentStatus === 'PAID_WITH_REJECTED_ITEM' || 
          order.remainingAmount > 0
        );

        tablesWithStatus.push({
          tableData: table,
          status: isOccupied ? "occupied" : "free",
          occupationTime: isOccupied ? calculateOccupationTime(activeOrders) : undefined,
          orderCount: activeOrders.length,
          pendingValidation: hasPendingValidation
        });
      }

      if (append) {
        setTables(prev => [...prev, ...tablesWithStatus]);
      } else {
        setTables(tablesWithStatus);
        await loadReadyDishes();
      }

    } catch (err: any) {
      console.error("Error loading data:", err);
      setError(err.message || "Erreur lors du chargement des données");
    } finally {
      setIsLoading(false);
      setRefreshing(false);
      setLoadingMoreTables(false);
    }
  }, [user?.tenantCode, loadReadyDishes]);

  // Fonction pour charger plus de tables (pagination)
  const loadMoreTables = useCallback(async () => {
    if (loadingMoreTables || !hasMoreTables || isSearchMode) return;
    
    const nextPage = currentPage + 1;
    await loadData(nextPage, true);
  }, [loadData, currentPage, hasMoreTables, loadingMoreTables, isSearchMode]);

  // Fonction de recherche de tables
  const searchTables = useCallback(async (query: string) => {
    if (!user?.tenantCode) return;
    
    setSearchQuery(query);
    
    if (!query.trim()) {
      // Si la recherche est vide, revenir au mode normal
      setIsSearchMode(false);
      setSearchLoading(false);
      await loadData(0, false);
      return;
    }
    
    setSearchLoading(true);
    setIsSearchMode(true);
    setError(null);
    
    try {
      const searchResults = await tableService.getTablesByName(user.tenantCode, query);
      const tablesWithStatus: TableWithStatus[] = [];
      const tableOrdersMap = new Map<number, DomainOrder[]>();
      
      // Charger les commandes actives pour chaque table trouvée
      for (const table of searchResults) {
        try {
          const activeOrders = await orderService.getActiveOrdersByTable(table.id);
          tableOrdersMap.set(table.id, activeOrders);
        } catch (err) {
          console.error(`Error fetching active orders for table ${table.id}:`, err);
          tableOrdersMap.set(table.id, []);
        }
      }
      
      const calculateOccupationTime = (orders: DomainOrder[]): number => {
        if (orders.length === 0) return 0;
        const oldestOrder = orders.reduce((oldest, current) => {
          const oldestTime = new Date(oldest.orderDate).getTime();
          const currentTime = new Date(current.orderDate).getTime();
          return currentTime < oldestTime ? current : oldest;
        });
        const now = new Date().getTime();
        const orderTime = new Date(oldestOrder.orderDate).getTime();
        return Math.floor((now - orderTime) / (1000 * 60));
      };
      
      for (const table of searchResults) {
        const activeOrders = tableOrdersMap.get(table.id) || [];
        const isOccupied = activeOrders.length > 0;
        
        const hasPendingValidation = activeOrders.some(order => 
          order.paymentStatus === 'PAID_WITH_REJECTED_ITEM' || 
          order.remainingAmount > 0
        );
        
        tablesWithStatus.push({
          tableData: table,
          status: isOccupied ? "occupied" : "free",
          occupationTime: isOccupied ? calculateOccupationTime(activeOrders) : undefined,
          orderCount: activeOrders.length,
          pendingValidation: hasPendingValidation
        });
      }
      
      setTables(tablesWithStatus);
      
    } catch (err: any) {
      console.error("Error searching tables:", err);
      setError(err.message || "Erreur lors de la recherche");
    } finally {
      setSearchLoading(false);
    }
  }, [user?.tenantCode, loadData]);

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadData(0, false);
  }, [loadData]);

  // [Les autres handlers restent identiques...]
  const handleTablePress = useCallback(async (table: TableWithStatus) => {
    setSelectedTable(table);
    await loadTableOrders(table.tableData.id);
    setTableDialogVisible(true);
  }, []);

  // Fonction pour charger les commandes d'une table
  const loadTableOrders = useCallback(async (tableId: number) => {
    try {
      const activeOrders = await orderService.getActiveOrdersByTable(tableId);
      setTableOrders(activeOrders);
    } catch (err) {
      console.error("Error fetching active orders:", err);
      setTableOrders([]);
    }
  }, []);

  // Fonction pour rafraîchir les commandes de la table sélectionnée
  const refreshSelectedTableOrders = useCallback(async () => {
    if (selectedTable) {
      await loadTableOrders(selectedTable.tableData.id);
      // Aussi rafraîchir les données générales des tables pour mettre à jour les statuts
      await loadData(0, false);
    }
  }, [selectedTable, loadData, loadTableOrders]);

  const handleServeReadyDishes = useCallback((order: DomainOrder) => {
    navigation.navigate("ReadyDishes", {
      tableId: order.tableId.toString(),
      tableName: order.tableName,
    });
    setTableDialogVisible(false);
  }, [navigation]);

  const handleNewOrder = useCallback(() => {
    if (selectedTable) {
      navigation.navigate("CreateOrder", {
        tableId: selectedTable.tableData.id,
        tableName: selectedTable.tableData.name,
      });
    }
    setTableDialogVisible(false);
  }, [selectedTable, navigation]);

  const handleAddToOrder = useCallback((order: DomainOrder) => {
    if (selectedTable) {
      navigation.navigate("CreateOrder", {
        tableId: selectedTable.tableData.id,
        tableName: selectedTable.tableData.name,
      });
    }
    setTableDialogVisible(false);
  }, [navigation, selectedTable]);

  const handleRequestBill = useCallback((order: DomainOrder) => {
    setTableDialogVisible(false);
    navigation.navigate("PrepareBill", {
      orderId: order.id,
      tableId: order.tableId,
      tableName: order.tableName,
    });
  }, [navigation]);

  const handlePrintTicket = useCallback(async (order: DomainOrder) => {
    setTableDialogVisible(false);
    const ticketContent = `
COMMANDE #${order.orderNumber}
Table: ${order.tableName}
Date: ${new Date(order.orderDate).toLocaleString()}

ARTICLES:
${order.items.map(item => 
  `${item.count}x ${item.dishName} - ${item.unitPrice.toFixed(2)}${order.currency.code}`
).join("\n")}

TOTAL: ${order.totalPrice.toFixed(2)}${order.currency.code}
`;

    try {
      await printDocument(ticketContent);
      showNotification("Ticket imprimé avec succès", "success");
    } catch (error) {
      console.error("Erreur d'impression:", error);
      showNotification("Erreur lors de l'impression", "error");
    }
  }, [printDocument]);

  const handleReadyDishes = useCallback(() => {
    navigation.navigate("ReadyDishes", {});
  }, [navigation]);

  const serverMenuItems = [
    {
      title: "Configuration d'impression",
      icon: "printer",
      onPress: () => setNotAvailableDialog({
        visible: true,
        featureName: "Configuration d'impression",
      }),
      dividerAfter: true,
    },
  ];

  // Effets
  useEffect(() => {
    loadData();
  }, [loadData]);

  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  // Gérer les états de connexion
  useEffect(() => {
    if (!isConnected && !isLoading) {
      showNotification("⚠️ Connexion au serveur perdue. Reconnexion...", "error");
    } else if (isConnected && connectionStats?.reconnectAttempts > 0) {
      showNotification("✅ Reconnexion établie", "success");
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
        
        {/* Indicateur de connexion Socket.io */}
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
            <TableSearchBar
              onSearch={searchTables}
              isLoading={searchLoading}
              placeholder="Rechercher une table..."
            />
            <TableGrid
              tables={tables}
              onTablePress={handleTablePress}
              isLoading={isLoading}
              refreshing={refreshing}
              onRefresh={onRefresh}
              recentlyChangedTables={recentlyChangedTables}
              onLoadMore={loadMoreTables}
              hasMoreData={hasMoreTables && !isSearchMode}
              loadingMore={loadingMoreTables && !isSearchMode}
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

      {/* FAB reste identique */}
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
          if (fabOpen) setFabOpen(false);
        }}
        fabStyle={{ borderRadius: 16 }}
      />

      {/* Dialogues restent identiques */}
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
        onRefreshOrders={refreshSelectedTableOrders}
      />

      <NotAvailableDialog
        visible={notAvailableDialog.visible}
        onDismiss={() => setNotAvailableDialog({ visible: false, featureName: "" })}
        featureName={notAvailableDialog.featureName}
      />

      {/* Snackbar amélioré avec icônes */}
      <Snackbar
        visible={snackbar.visible}
        onDismiss={() => setSnackbar({ ...snackbar, visible: false })}
        duration={snackbar.type === "error" ? 5000 : 3000}
        action={
          !isConnected
            ? {
                label: "Reconnecter",
                onPress: () => {
                  // Forcer reconnexion si nécessaire
                  loadData();
                },
              }
            : undefined
        }
        style={[
          styles.snackbar,
          snackbar.type === "error" && styles.snackbarError,
          snackbar.type === "success" && styles.snackbarSuccess,
          snackbar.type === "warning" && styles.snackbarWarning,
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
  connectionBadge: {
    marginRight: 8,
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
  snackbarWarning: {
    backgroundColor: "#FF9800",
  },
});