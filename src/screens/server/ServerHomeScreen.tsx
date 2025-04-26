// src/screens/server/ServerHomeScreen.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, RefreshControl, Platform } from 'react-native';
import { Appbar, Text, ActivityIndicator, Surface, useTheme, FAB, Chip } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { useAuth } from '../../contexts/AuthContext';
import { RolesUtils, Role } from '../../utils/roles';
import { TableGrid, TableWithStatus } from '../../components/server/TableGrid';
import { QuickActions } from '../../components/server/QuickActions';
import { UrgentTasks, UrgentTask } from '../../components/server/UrgentTasks';
import { TableDetailDialog } from '../../components/server/TableDetailDialog';
import { NotAvailableDialog } from '../../components/common/NotAvailableDialog';
import { usePrinter } from '../../hooks/usePrinter';
import tableService, { DomainRefTable } from '../../api/tableService';
import orderService, { DomainOrder } from '../../api/orderService';

// Types pour la navigation
type ServerStackParamList = {
  ServerHome: undefined;
  CreateOrder: {
    tableId: number;
    tableName: string;
  };
};

type ServerHomeScreenNavigationProp = StackNavigationProp<ServerStackParamList, 'ServerHome'>;

interface ServerHomeScreenProps {
  navigation: ServerHomeScreenNavigationProp;
}

export const ServerHomeScreen: React.FC<ServerHomeScreenProps> = ({ navigation }) => {
  const { user, logout } = useAuth();
  const theme = useTheme();
  const { printDocument } = usePrinter();

  const [isLoading, setIsLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [tables, setTables] = useState<TableWithStatus[]>([]);
  const [urgentTasks, setUrgentTasks] = useState<UrgentTask[]>([]);
  const [readyCount, setReadyCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  
  // États pour les dialogues
  const [selectedTable, setSelectedTable] = useState<TableWithStatus | null>(null);
  const [tableOrders, setTableOrders] = useState<DomainOrder[]>([]);
  const [tableDialogVisible, setTableDialogVisible] = useState(false);
  const [notAvailableDialog, setNotAvailableDialog] = useState({
    visible: false,
    featureName: '',
  });

// Charger les données initiales
const loadData = useCallback(async () => {
  if (!user?.tenantCode) {
    setError('Code de restaurant non disponible');
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
    const tableStatusMap = new Map<number, boolean>(); // Map pour stocker le statut d'occupation des tables
    let readyItemsCount = 0;
    
    // Pour chaque table, vérifier s'il existe des commandes actives
    for (const table of tablesResponse.content) {
      try {
        const activeOrders = await orderService.getActiveOrdersByTable(table.id);
        const isOccupied = activeOrders.length > 0;
        
        // Stocker le statut de la table
        tableStatusMap.set(table.id, isOccupied);
        
        // Compter les articles prêts pour le badge
        if (isOccupied) {
          for (const order of activeOrders) {
            for (const item of order.items) {
              if (item.state === 'READY' || item.state === 'COOKED') {
                readyItemsCount++;
              }
            }
          }
        }
      } catch (err) {
        console.error(`Error fetching active orders for table ${table.id}:`, err);
        // En cas d'erreur, supposer que la table est libre
        tableStatusMap.set(table.id, false);
      }
    }
    
    // Créer la liste finale des tables avec leur statut
    for (const table of tablesResponse.content) {
      const isOccupied = tableStatusMap.get(table.id) || false;
      
      tablesWithStatus.push({
        tableData: table,
        status: isOccupied ? 'occupied' : 'free',
        occupationTime: isOccupied ? Math.floor(Math.random() * 90) + 15 : undefined, // Simuler le temps d'occupation
        orderCount: isOccupied && Math.random() > 0.7 ? 1 : 0, // Certaines tables occupées nécessitent une attention
      });
    }
    
    setTables(tablesWithStatus);
    setReadyCount(readyItemsCount);

    // Simuler des tâches urgentes pour la démo
    // Dans une implémentation réelle, cela viendrait d'une API
    const mockUrgentTasks: UrgentTask[] = [
      {
        id: '1',
        type: 'dish_ready',
        title: 'Plats prêts à servir',
        description: '2 plats pour la table 5 sont prêts',
        tableId: '5',
        tableName: 'Table 5',
        timestamp: new Date().toISOString(),
        priority: 'high',
      },
      {
        id: '2',
        type: 'kitchen_message',
        title: 'Message de la cuisine',
        description: 'Plus de sauce champignons disponible',
        timestamp: new Date(Date.now() - 30 * 60000).toISOString(),
        priority: 'low',
      },
    ];
    
    setUrgentTasks(mockUrgentTasks);
  } catch (err: any) {
    console.error('Error loading data:', err);
    setError(err.message || 'Erreur lors du chargement des données');
  } finally {
    setIsLoading(false);
    setRefreshing(false);
  }
}, [user?.tenantCode]);

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
      const activeOrders = await orderService.getActiveOrdersByTable(table.tableData.id);
      setTableOrders(activeOrders);
    } catch (err) {
      console.error('Error fetching active orders:', err);
      setTableOrders([]);
    }
    
    setTableDialogVisible(true);
  }, []);
  // Gérer l'action "Nouvelle commande"
  const handleNewOrder = useCallback(() => {
    if (selectedTable) {
      navigation.navigate('CreateOrder', {
        tableId: selectedTable.tableData.id,
        tableName: selectedTable.tableData.name
      });
    }
    setTableDialogVisible(false);
  }, [selectedTable, navigation]);

  // Gérer l'action "Ajouter à la commande"
  const handleAddToOrder = useCallback((order: DomainOrder) => {
    if (selectedTable) {
      // Navigation vers l'écran de création de commande
      // Le mode d'ajout est déjà configuré dans TableDetailDialog via setEditMode
      navigation.navigate('CreateOrder', {
        tableId: selectedTable.tableData.id,
        tableName: selectedTable.tableData.name
      });
    }
    setTableDialogVisible(false);
  }, [navigation, selectedTable]);

  // Gérer l'action "Demander l'addition"
  const handleRequestBill = useCallback((order: DomainOrder) => {
    setTableDialogVisible(false);
    setNotAvailableDialog({
      visible: true,
      featureName: 'Demande d\'addition',
    });
  }, []);

  // Gérer l'action "Imprimer le ticket"
  const handlePrintTicket = useCallback(async (order: DomainOrder) => {
    setTableDialogVisible(false);
    
    // Formater les données pour l'impression
    const ticketContent = `
    COMMANDE #${order.id}
    Table: ${order.refTable}
    Date: ${new Date(order.orderDate).toLocaleString()}
    
    ARTICLES:
    ${order.items.map(item => `${item.count}x ${item.dishName} - ${item.unitPrice.toFixed(2)}${order.currency.code}`).join('\n')}
    
    TOTAL: ${order.totalPrice.toFixed(2)}${order.currency.code}
    `;
    
    try {
      await printDocument(ticketContent);
      // Afficher une confirmation ou notification d'impression réussie
    } catch (error) {
      // Gérer l'erreur d'impression
      console.error('Erreur d\'impression:', error);
    }
  }, [printDocument]);

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
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <Appbar.Header style={styles.appbar}>
        <Appbar.Content 
          title="Mokengeli Biloko POS" 
          subtitle={`${RolesUtils.getRoleDescription(Role.SERVER)}: ${user?.firstName || ''} ${user?.lastName || ''}`}
        />
        <Appbar.Action icon="printer" onPress={() => setNotAvailableDialog({
          visible: true,
          featureName: 'Configuration d\'impression',
        })} />
        <Appbar.Action icon="logout" onPress={logout} />
      </Appbar.Header>
      
      <QuickActions
        onNewOrder={() => setNotAvailableDialog({
          visible: true,
          featureName: 'Nouvelle commande',
        })}
        onTakeout={() => setNotAvailableDialog({
          visible: true,
          featureName: 'Commande à emporter',
        })}
        onMyOrders={() => setNotAvailableDialog({
          visible: true,
          featureName: 'Mes commandes',
        })}
        onReady={() => setNotAvailableDialog({
          visible: true,
          featureName: 'Plats prêts',
        })}
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
            />
            
            <UrgentTasks
              tasks={urgentTasks}
              onTaskPress={(task) => setNotAvailableDialog({
                visible: true,
                featureName: 'Détails de la tâche',
              })}
              isLoading={isLoading}
            />
          </View>
        )}
      </View>
      
      {/* Bouton d'action flottant pour ajouter rapidement une commande */}
      <FAB
        style={styles.fab}
        icon="plus"
        onPress={() => setNotAvailableDialog({
          visible: true,
          featureName: 'Nouvelle commande rapide',
        })}
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
      />
      
      {/* Dialogue pour les fonctionnalités non disponibles */}
      <NotAvailableDialog
        visible={notAvailableDialog.visible}
        onDismiss={() => setNotAvailableDialog({ visible: false, featureName: '' })}
        featureName={notAvailableDialog.featureName}
      />
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  appbar: {
    height: 56, // Hauteur réduite de l'Appbar
    paddingTop: 0, // Suppression du padding supérieur
  },
  contentContainer: {
    flex: 1,
    paddingBottom: 80, // Espace pour le bouton flottant
  },
  mainContent: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 16,
    marginLeft: 16,
    marginBottom: 8,
  },
  errorContainer: {
    margin: 16,
    padding: 16,
    borderRadius: 8,
    backgroundColor: '#ffe6e6',
  },
  errorText: {
    color: '#d32f2f',
    textAlign: 'center',
  },
  fab: {
    position: 'absolute',
    margin: 16,
    right: 0,
    bottom: 0,
  },
});