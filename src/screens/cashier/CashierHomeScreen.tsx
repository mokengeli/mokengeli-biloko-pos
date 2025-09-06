// src/screens/cashier/CashierHomeScreen.tsx
import React, { useState, useEffect, useCallback } from "react";
import { View, StyleSheet, FlatList, RefreshControl, Alert, Image } from "react-native";
import {
  Appbar,
  Text,
  ActivityIndicator,
  Surface,
  useTheme,
  Searchbar,
  Chip,
  List,
  Button,
  Divider,
  TouchableRipple,
  Badge,
  SegmentedButtons,
} from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { useFocusEffect } from "@react-navigation/native";
import { StackNavigationProp } from "@react-navigation/stack";
import DateTimePicker from '@react-native-community/datetimepicker';
import { Platform } from "react-native";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";

import { useAuth } from "../../contexts/AuthContext";
import { HeaderMenu } from "../../components/common/HeaderMenu";
import { RolesUtils, Role } from "../../utils/roles";
import { NotAvailableDialog } from "../../components/common/NotAvailableDialog";
import cashierService, { 
  DomainCashierOrder, 
  DomainCashierOrderSummary 
} from "../../api/cashierService";
import orderService from "../../api/orderService";
import printerService from "../../services/PrinterService";

// Types pour la navigation
type CashierStackParamList = {
  CashierHome: undefined;
  PrepareBill: {
    orderId: number;
    tableId?: number;
    tableName?: string;
  };
};

type CashierHomeScreenNavigationProp = StackNavigationProp<
  CashierStackParamList,
  "CashierHome"
>;

interface CashierHomeScreenProps {
  navigation: CashierHomeScreenNavigationProp;
}

export const CashierHomeScreen: React.FC<CashierHomeScreenProps> = ({
  navigation,
}) => {
  const { user } = useAuth();
  const theme = useTheme();
  
  // Vérification du rôle pour l'accès aux fonctionnalités
  const isManager = RolesUtils.hasRole(user?.roles, Role.MANAGER);

  // États principaux
  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [orders, setOrders] = useState<DomainCashierOrder[]>([]);
  const [summary, setSummary] = useState<DomainCashierOrderSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  // États pour la recherche
  const [searchQuery, setSearchQuery] = useState("");
  const [isSearching, setIsSearching] = useState(false);
  const [searchType, setSearchType] = useState<'ORDER' | 'TABLE'>('ORDER');

  // États pour la date
  const [selectedDate, setSelectedDate] = useState(new Date());
  const [showDatePicker, setShowDatePicker] = useState(false);

  // États pour les filtres
  const [selectedStatus, setSelectedStatus] = useState("ALL");

  // État pour le dialogue non disponible
  const [notAvailableDialog, setNotAvailableDialog] = useState<{
    visible: boolean;
    featureName: string;
  }>({ visible: false, featureName: "" });

  const statusOptions = [
    { value: "ALL", label: "Toutes", icon: "format-list-bulleted" },
    { value: "PENDING", label: "En attente", icon: "clock-outline" },
    { value: "READY", label: "Prêtes", icon: "check-circle-outline" },
    { value: "PAID", label: "Payées", icon: "cash-check" },
  ];

  // Charger les données
  const loadData = useCallback(async (showLoader = true) => {
    if (!user?.tenantCode) {
      setError("Code de restaurant non disponible");
      setIsLoading(false);
      return;
    }

    try {
      if (showLoader) setIsLoading(true);
      setError(null);

      const dateStr = cashierService.formatDateForAPI(selectedDate);
      
      let result: DomainCashierOrderSummary;
      
      if (searchQuery.trim()) {
        result = await cashierService.searchOrders(
          user.tenantCode, 
          searchQuery.trim(), 
          searchType, 
          dateStr
        );
      } else {
        result = await cashierService.getCashierOrderSummary({
          tenantCode: user.tenantCode,
          date: dateStr,
          status: selectedStatus,
        });
      }

      setSummary(result);
      setOrders(result.orders || []);
      
    } catch (err: any) {
      console.error("Error loading cashier data:", err);
      setError(err.message || "Erreur lors du chargement des données");
      setOrders([]);
      setSummary(null);
    } finally {
      setIsLoading(false);
      setRefreshing(false);
      setIsSearching(false);
    }
  }, [selectedDate, selectedStatus, searchQuery, searchType, user?.tenantCode]);

  // Recharger les données au focus
  useFocusEffect(
    useCallback(() => {
      loadData();
    }, [loadData])
  );

  // Charger les imprimantes au montage
  useEffect(() => {
    const loadPrinters = async () => {
      if (user?.tenantCode) {
        try {
          await printerService.loadPrinters(user.tenantCode);
          console.log('Imprimantes chargées pour CashierHomeScreen:', user.tenantCode);
        } catch (error) {
          console.error('Erreur lors du chargement des imprimantes:', error);
        }
      }
    };
    loadPrinters();
  }, [user?.tenantCode]);

  // Recherche avec debounce
  useEffect(() => {
    const timer = setTimeout(() => {
      if (searchQuery.length > 0) {
        setIsSearching(true);
        loadData(false);
      } else if (searchQuery.length === 0) {
        loadData(false);
      }
    }, 500);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // Actualiser quand la date, le statut ou le type de recherche change
  useEffect(() => {
    loadData();
  }, [selectedDate, selectedStatus, searchType]);

  // Gestionnaires
  const handleRefresh = () => {
    setRefreshing(true);
    loadData(false);
  };

  const handleDateChange = (event: any, date?: Date) => {
    setShowDatePicker(false);
    if (date) {
      setSelectedDate(date);
    }
  };

  const handleOrderPress = (order: DomainCashierOrder) => {
    navigation.navigate("PrepareBill", {
      orderId: order.orderId,
      tableId: order.tableId,
      tableName: order.tableName,
    });
  };

  const handlePrintTicket = () => {
    navigation.navigate("PrinterConfig" as never);
  };

  // Menu items pour HeaderMenu
  const cashierMenuItems = [
    {
      title: "Configuration imprimantes",
      icon: "printer-settings",
      onPress: () => navigation.navigate("PrinterConfig" as never),
      dividerAfter: true,
    },
  ];

  const handlePrintOrder = async (order: DomainCashierOrder) => {
    try {
      // Récupérer les détails complets de la commande
      const orderDetails = await orderService.getOrderById(order.orderId);
      
      if (!orderDetails) {
        throw new Error("Impossible de récupérer les détails de la commande");
      }
      
      // Imprimer le ticket avec le nom de l'établissement
      await printerService.printTicket(orderDetails, undefined, user?.tenantName);
      
      Alert.alert(
        "Impression réussie",
        `Le ticket de la commande #${order.orderNumber} a été imprimé avec succès!`,
        [{ text: "OK" }]
      );
    } catch (err: any) {
      console.error("Error printing order:", err);
      Alert.alert(
        "Erreur d'impression",
        err.message || "Impossible d'imprimer le ticket",
        [
          { text: "Annuler", style: "cancel" },
          { 
            text: "Réessayer", 
            onPress: () => handlePrintOrder(order) 
          }
        ]
      );
    }
  };

  const formatOrderTime = (createdAt: string): string => {
    const date = new Date(createdAt);
    return date.toLocaleTimeString("fr-FR", { 
      hour: "2-digit", 
      minute: "2-digit" 
    });
  };

  // Rendu d'une commande
  const renderOrderItem = ({ item: order }: { item: DomainCashierOrder }) => {
    const statusColor = cashierService.getOrderStatusColor(order);
    const displayStatus = cashierService.getOrderDisplayStatus(order);
    const dishesText = cashierService.getDishesStatusText(order.dishesStatus);
    
    const themeColors = {
      success: theme.colors.success || '#4CAF50',
      warning: theme.colors.warning || '#FF9800', 
      error: theme.colors.error || '#F44336',
    };

    return (
      <TouchableRipple
        onPress={() => handleOrderPress(order)}
        style={styles.orderItem}
      >
        <Surface style={styles.orderCard} elevation={1}>
          <View style={styles.orderHeader}>
            <View style={styles.orderInfo}>
              <View style={styles.orderTitle}>
                <Icon
                  name="receipt"
                  size={16}
                  color={themeColors[statusColor]}
                  style={styles.orderIcon}
                />
                <Text style={styles.orderNumber}>#{order.orderNumber}</Text>
                <Text style={styles.tableName}>{order.tableName}</Text>
                {order.waitingTime > 10 && (
                  <Badge 
                    style={[styles.urgentBadge, { backgroundColor: themeColors.error }]}
                    size={16}
                  >
                    !
                  </Badge>
                )}
              </View>
              <Text style={styles.orderTime}>
                {formatOrderTime(order.createdAt)}
                {order.waitingTime > 0 && ` • Attente: ${order.waitingTime}min`}
              </Text>
            </View>
            
            <View style={styles.orderAmount}>
              <Text style={styles.totalAmount}>
                {order.totalAmount.toFixed(2)} {order.currencyCode}
              </Text>
              {order.remainingAmount > 0 && (
                <Text style={styles.remainingAmount}>
                  Reste: {order.remainingAmount.toFixed(2)} {order.currencyCode}
                </Text>
              )}
            </View>
          </View>

          <Divider style={styles.divider} />

          <View style={styles.orderFooter}>
            <View style={styles.statusContainer}>
              <Chip
                mode="outlined"
                compact
                textStyle={{ fontSize: 12 }}
                style={[
                  styles.statusChip,
                  { borderColor: themeColors[statusColor] }
                ]}
              >
                {displayStatus}
              </Chip>
            </View>
            
            <Text style={styles.dishesStatus}>
              {dishesText}
            </Text>
            
            <TouchableRipple
              onPress={() => handlePrintOrder(order)}
              style={styles.printButton}
              borderless
            >
              <Icon
                name="printer"
                size={20}
                color={theme.colors.primary}
              />
            </TouchableRipple>
          </View>
        </Surface>
      </TouchableRipple>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={["left", "right"]}>
      <Appbar.Header>
        {isManager && (
          <Appbar.BackAction
            onPress={() => navigation.navigate("ManagerHome" as never)}
          />
        )}
        
        {/* Logo */}
        <Image 
          source={require('../../../assets/logos/icon.png')}
          style={styles.logo}
        />
        
        <Appbar.Content
          title="Mokengeli Biloko POS"
        />
        
        <HeaderMenu additionalItems={cashierMenuItems} />
      </Appbar.Header>

      {/* Barre de recherche */}
      <Surface style={styles.searchContainer} elevation={1}>
        {/* Sélecteur de type de recherche */}
        <SegmentedButtons
          value={searchType}
          onValueChange={(value) => setSearchType(value as 'ORDER' | 'TABLE')}
          buttons={[
            {
              value: 'ORDER',
              label: 'Commande',
              icon: 'receipt',
            },
            {
              value: 'TABLE',
              label: 'Table',
              icon: 'table-furniture',
            },
          ]}
          style={styles.searchTypeSelector}
        />
        
        <Searchbar
          placeholder={
            searchType === 'ORDER' 
              ? "Rechercher par numéro de commande..." 
              : "Rechercher par nom/numéro de table..."
          }
          onChangeText={setSearchQuery}
          value={searchQuery}
          style={styles.searchBar}
          loading={isSearching}
          icon="magnify"
        />
        
        {/* Sélecteur de date */}
        <View style={styles.dateContainer}>
          <Button
            mode="outlined"
            onPress={() => setShowDatePicker(true)}
            icon="calendar"
            compact
            style={styles.dateButton}
          >
            {selectedDate.toLocaleDateString("fr-FR")}
          </Button>
        </View>
      </Surface>

      {/* Filtres de statut */}
      <View style={styles.filtersContainer}>
        <FlatList
          horizontal
          showsHorizontalScrollIndicator={false}
          data={statusOptions}
          keyExtractor={(item) => item.value}
          renderItem={({ item }) => (
            <Chip
              selected={selectedStatus === item.value}
              onPress={() => setSelectedStatus(item.value)}
              mode={selectedStatus === item.value ? "flat" : "outlined"}
              style={styles.filterChip}
              icon={item.icon}
            >
              {item.label}
            </Chip>
          )}
          contentContainerStyle={styles.filtersContent}
        />
      </View>

      {/* Résumé du jour */}
      {summary && !searchQuery && (
        <Surface style={styles.summaryContainer} elevation={1}>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Commandes du jour:</Text>
            <Text style={styles.summaryValue}>{summary.totalOrders}</Text>
          </View>
          <View style={styles.summaryRow}>
            <Text style={styles.summaryLabel}>Chiffre d'affaires:</Text>
            <Text style={styles.summaryValue}>
              {summary.totalRevenue.toFixed(2)} {summary.currencyCode}
            </Text>
          </View>
        </Surface>
      )}

      {/* Liste des commandes */}
      {isLoading && !refreshing ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" />
          <Text style={styles.loadingText}>Chargement des commandes...</Text>
        </View>
      ) : error ? (
        <View style={styles.errorContainer}>
          <Icon name="alert-circle" size={48} color={theme.colors.error} />
          <Text style={styles.errorText}>{error}</Text>
          <Button mode="outlined" onPress={() => loadData()}>
            Réessayer
          </Button>
        </View>
      ) : orders.length === 0 ? (
        <View style={styles.emptyContainer}>
          <Icon name="receipt" size={48} color={theme.colors.outline} />
          <Text style={styles.emptyText}>
            {searchQuery 
              ? "Aucune commande trouvée" 
              : "Aucune commande pour cette date"}
          </Text>
        </View>
      ) : (
        <FlatList
          data={orders}
          keyExtractor={(item) => item.orderId.toString()}
          renderItem={renderOrderItem}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
          }
          contentContainerStyle={styles.listContainer}
          showsVerticalScrollIndicator={false}
        />
      )}

      {/* DatePicker */}
      {showDatePicker && (
        <DateTimePicker
          value={selectedDate}
          mode="date"
          display={Platform.OS === "ios" ? "spinner" : "default"}
          onChange={handleDateChange}
        />
      )}

      {/* Dialogue fonctionnalité non disponible */}
      <NotAvailableDialog
        visible={notAvailableDialog.visible}
        featureName={notAvailableDialog.featureName}
        onDismiss={() => setNotAvailableDialog({ visible: false, featureName: "" })}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  logo: {
    width: 28,
    height: 28,
    marginLeft: 12,
    marginRight: 10,
    borderRadius: 6,
    backgroundColor: 'rgba(255, 255, 255, 0.1)',
    padding: 2,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: 1 },
    shadowOpacity: 0.15,
    shadowRadius: 2,
    elevation: 2,
  },
  searchContainer: {
    padding: 16,
    backgroundColor: "white",
  },
  searchTypeSelector: {
    marginBottom: 12,
  },
  searchBar: {
    marginBottom: 12,
  },
  dateContainer: {
    alignItems: "flex-start",
  },
  dateButton: {
    minWidth: 140,
  },
  filtersContainer: {
    backgroundColor: "white",
    paddingVertical: 8,
  },
  filtersContent: {
    paddingHorizontal: 16,
    gap: 8,
  },
  filterChip: {
    marginRight: 8,
  },
  summaryContainer: {
    margin: 16,
    padding: 16,
    backgroundColor: "white",
    borderRadius: 8,
  },
  summaryRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    marginBottom: 8,
  },
  summaryLabel: {
    fontSize: 14,
    color: "#666",
  },
  summaryValue: {
    fontSize: 14,
    fontWeight: "bold",
  },
  listContainer: {
    padding: 16,
  },
  orderItem: {
    marginBottom: 12,
    borderRadius: 8,
    overflow: "hidden",
  },
  orderCard: {
    padding: 16,
    backgroundColor: "white",
    borderRadius: 8,
  },
  orderHeader: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "flex-start",
    marginBottom: 12,
  },
  orderInfo: {
    flex: 1,
  },
  orderTitle: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: 4,
  },
  orderIcon: {
    marginRight: 6,
  },
  orderNumber: {
    fontSize: 16,
    fontWeight: "bold",
    marginRight: 8,
  },
  tableName: {
    fontSize: 14,
    color: "#666",
    marginRight: 8,
  },
  urgentBadge: {
    color: "white",
  },
  orderTime: {
    fontSize: 12,
    color: "#999",
  },
  orderAmount: {
    alignItems: "flex-end",
  },
  totalAmount: {
    fontSize: 18,
    fontWeight: "bold",
  },
  remainingAmount: {
    fontSize: 12,
    color: "#666",
    marginTop: 2,
  },
  divider: {
    marginVertical: 12,
  },
  orderFooter: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  statusContainer: {
    flex: 1,
  },
  statusChip: {
    alignSelf: "flex-start",
  },
  dishesStatus: {
    fontSize: 12,
    color: "#666",
    textAlign: "right",
    flex: 1,
    marginLeft: 8,
  },
  printButton: {
    padding: 8,
    borderRadius: 20,
    marginLeft: 8,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  loadingText: {
    marginTop: 16,
    color: "#666",
  },
  errorContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  errorText: {
    textAlign: "center",
    marginVertical: 16,
    color: "#666",
  },
  emptyContainer: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 32,
  },
  emptyText: {
    marginTop: 16,
    color: "#666",
    textAlign: "center",
  },
});

export default CashierHomeScreen;