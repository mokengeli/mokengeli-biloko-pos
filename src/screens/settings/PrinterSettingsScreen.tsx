// src/screens/settings/PrinterSettingsScreen.tsx

import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Alert,
  FlatList,
  RefreshControl,
} from 'react-native';
import {
  Appbar,
  Card,
  Text,
  Button,
  FAB,
  Switch,
  List,
  Divider,
  useTheme,
  ActivityIndicator,
  Surface,
  IconButton,
  Portal,
  Modal,
  TextInput,
  RadioButton,
  Menu,
  Chip,
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StackNavigationProp } from '@react-navigation/stack';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { usePrintManager } from '../../hooks/usePrintManager';
import { PrinterConfig, PrinterType, ConnectionStatus } from '../../services/printing/types';
import { PrinterStorage } from '../../services/printing/PrinterStorage';

type PrinterSettingsScreenNavigationProp = StackNavigationProp<any, 'PrinterSettings'>;

interface PrinterSettingsScreenProps {
  navigation: PrinterSettingsScreenNavigationProp;
}

export const PrinterSettingsScreen: React.FC<PrinterSettingsScreenProps> = ({ navigation }) => {
  const theme = useTheme();
  const {
    printers,
    isInitialized,
    isLoading,
    addPrinter,
    removePrinter,
    testPrinter,
    setDefaultPrinter,
    refreshStatus,
    getConnectionStatus,
    setCategoryMapping,
    updateSettings,
  } = usePrintManager();

  // États
  const [refreshing, setRefreshing] = useState(false);
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [discoveryModalVisible, setDiscoveryModalVisible] = useState(false);
  const [categoryMappingModalVisible, setCategoryMappingModalVisible] = useState(false);
  const [selectedPrinter, setSelectedPrinter] = useState<PrinterConfig | null>(null);
  const [editModalVisible, setEditModalVisible] = useState(false);
  
  // Formulaire d'ajout d'imprimante
  const [newPrinterForm, setNewPrinterForm] = useState({
    name: '',
    ipAddress: '',
    port: '9100',
    type: PrinterType.GENERAL,
    paperWidth: 80,
  });

  // Mapping des catégories
  const [categoryMapping, setCategoryMappingLocal] = useState<Record<string, PrinterType>>({});

  // Charger le mapping des catégories au montage
  useEffect(() => {
    loadCategoryMapping();
  }, []);

  // Charger le mapping actuel
  const loadCategoryMapping = async () => {
    const storage = PrinterStorage.getInstance();
    const settings = await storage.getSettings();
    setCategoryMappingLocal(settings.categoryMapping || {});
  };

  // Rafraîchir les données
  const handleRefresh = async () => {
    setRefreshing(true);
    await refreshStatus();
    await loadCategoryMapping();
    setRefreshing(false);
  };

  // Obtenir l'icône selon le statut
  const getStatusIcon = (status: ConnectionStatus) => {
    switch (status) {
      case ConnectionStatus.CONNECTED:
        return { name: 'check-circle', color: theme.colors.success };
      case ConnectionStatus.DISCONNECTED:
        return { name: 'close-circle', color: theme.colors.error };
      case ConnectionStatus.CONNECTING:
        return { name: 'clock-outline', color: theme.colors.warning };
      case ConnectionStatus.ERROR:
        return { name: 'alert-circle', color: theme.colors.error };
      default:
        return { name: 'help-circle', color: theme.colors.disabled };
    }
  };

  // Obtenir la couleur selon le type d'imprimante
  const getPrinterTypeColor = (type: PrinterType) => {
    switch (type) {
      case PrinterType.KITCHEN:
        return '#FF9800';
      case PrinterType.BAR:
        return '#2196F3';
      case PrinterType.CASHIER:
        return '#4CAF50';
      default:
        return theme.colors.primary;
    }
  };

  // Ajouter une nouvelle imprimante
  const handleAddPrinter = async () => {
    if (!newPrinterForm.name || !newPrinterForm.ipAddress) {
      Alert.alert('Erreur', 'Veuillez remplir tous les champs');
      return;
    }

    try {
      const config = PrinterStorage.createDefaultPrinterConfig(
        newPrinterForm.type,
        newPrinterForm.ipAddress,
        newPrinterForm.name
      );

      config.port = parseInt(newPrinterForm.port);
      config.paperWidth = newPrinterForm.paperWidth as 58 | 80;

      await addPrinter(config);
      
      setAddModalVisible(false);
      setNewPrinterForm({
        name: '',
        ipAddress: '',
        port: '9100',
        type: PrinterType.GENERAL,
        paperWidth: 80,
      });

      Alert.alert('Succès', 'Imprimante ajoutée avec succès');
    } catch (error: any) {
      Alert.alert('Erreur', error.message);
    }
  };

  // Tester une imprimante
  const handleTestPrinter = async (printer: PrinterConfig) => {
    Alert.alert(
      'Test d\'impression',
      `Tester l'imprimante ${printer.name}?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Tester',
          onPress: async () => {
            const result = await testPrinter(printer.id);
            if (result) {
              Alert.alert('Succès', 'Test d\'impression réussi');
            } else {
              Alert.alert('Échec', 'Impossible de communiquer avec l\'imprimante');
            }
          }
        }
      ]
    );
  };

  // Supprimer une imprimante
  const handleDeletePrinter = async (printer: PrinterConfig) => {
    Alert.alert(
      'Confirmation',
      `Supprimer l'imprimante ${printer.name}?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            await removePrinter(printer.id);
            Alert.alert('Succès', 'Imprimante supprimée');
          }
        }
      ]
    );
  };

  // Basculer l'état activé/désactivé
  const togglePrinterEnabled = async (printer: PrinterConfig) => {
    printer.isEnabled = !printer.isEnabled;
    await addPrinter(printer); // Mise à jour
    await refreshStatus();
  };

  // Définir comme imprimante par défaut
  const handleSetDefault = async (printer: PrinterConfig) => {
    await setDefaultPrinter(printer.id, printer.type);
    Alert.alert('Succès', `${printer.name} est maintenant l'imprimante par défaut pour ${printer.type}`);
  };

  // Sauvegarder le mapping des catégories
  const saveCategoryMapping = async () => {
    await setCategoryMapping(categoryMapping);
    setCategoryMappingModalVisible(false);
    Alert.alert('Succès', 'Mapping des catégories sauvegardé');
  };

  // Rendu d'une carte d'imprimante
  const renderPrinterCard = ({ item }: { item: PrinterConfig }) => {
    const statusIcon = getStatusIcon(item.status);
    const typeColor = getPrinterTypeColor(item.type);

    return (
      <Card style={styles.printerCard}>
        <Card.Content>
          <View style={styles.printerHeader}>
            <View style={styles.printerInfo}>
              <View style={styles.printerTitleRow}>
                <Text style={styles.printerName}>{item.name}</Text>
                {item.isDefault && (
                  <Chip 
                    style={[styles.defaultChip, { backgroundColor: typeColor }]}
                    textStyle={{ color: 'white', fontSize: 10 }}
                  >
                    Par défaut
                  </Chip>
                )}
              </View>
              <Text style={styles.printerDetails}>
                {item.ipAddress}:{item.port} • {item.paperWidth}mm
              </Text>
              <View style={styles.printerStatusRow}>
                <Icon 
                  name={statusIcon.name} 
                  size={16} 
                  color={statusIcon.color} 
                />
                <Text style={[styles.statusText, { color: statusIcon.color }]}>
                  {item.status}
                </Text>
                <Chip 
                  style={[styles.typeChip, { backgroundColor: typeColor + '20' }]}
                  textStyle={{ color: typeColor, fontSize: 11 }}
                >
                  {item.type}
                </Chip>
              </View>
            </View>
            <Switch
              value={item.isEnabled}
              onValueChange={() => togglePrinterEnabled(item)}
              color={theme.colors.primary}
            />
          </View>

          <Divider style={styles.divider} />

          <View style={styles.printerActions}>
            <Button 
              mode="text" 
              onPress={() => handleTestPrinter(item)}
              icon="printer"
              compact
            >
              Tester
            </Button>
            {!item.isDefault && (
              <Button 
                mode="text" 
                onPress={() => handleSetDefault(item)}
                icon="star"
                compact
              >
                Par défaut
              </Button>
            )}
            <Button 
              mode="text" 
              onPress={() => {
                setSelectedPrinter(item);
                setEditModalVisible(true);
              }}
              icon="pencil"
              compact
            >
              Modifier
            </Button>
            <IconButton
              icon="delete"
              size={20}
              onPress={() => handleDeletePrinter(item)}
              iconColor={theme.colors.error}
            />
          </View>
        </Card.Content>
      </Card>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => navigation.goBack()} />
        <Appbar.Content title="Configuration des imprimantes" />
        <Appbar.Action 
          icon="refresh" 
          onPress={handleRefresh}
        />
      </Appbar.Header>

      <ScrollView 
        style={styles.scrollView}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
      >
        {/* Actions rapides */}
        <Surface style={styles.quickActions}>
          <Button
            mode="outlined"
            icon="magnify"
            onPress={() => setDiscoveryModalVisible(true)}
            style={styles.quickActionButton}
          >
            Découvrir
          </Button>
          <Button
            mode="outlined"
            icon="tag"
            onPress={() => setCategoryMappingModalVisible(true)}
            style={styles.quickActionButton}
          >
            Catégories
          </Button>
        </Surface>

        {/* Liste des imprimantes */}
        {isLoading && !printers.length ? (
          <View style={styles.loadingContainer}>
            <ActivityIndicator size="large" />
            <Text style={styles.loadingText}>Chargement...</Text>
          </View>
        ) : printers.length === 0 ? (
          <View style={styles.emptyContainer}>
            <Icon name="printer-off" size={64} color={theme.colors.disabled} />
            <Text style={styles.emptyText}>Aucune imprimante configurée</Text>
            <Button 
              mode="contained" 
              onPress={() => setAddModalVisible(true)}
              style={styles.addFirstButton}
            >
              Ajouter une imprimante
            </Button>
          </View>
        ) : (
          <FlatList
            data={printers}
            renderItem={renderPrinterCard}
            keyExtractor={item => item.id}
            scrollEnabled={false}
            contentContainerStyle={styles.list}
          />
        )}
      </ScrollView>

      {/* FAB pour ajouter */}
      {printers.length > 0 && (
        <FAB
          icon="plus"
          style={[styles.fab, { backgroundColor: theme.colors.primary }]}
          onPress={() => setAddModalVisible(true)}
        />
      )}

      {/* Modal d'ajout */}
      <Portal>
        <Modal
          visible={addModalVisible}
          onDismiss={() => setAddModalVisible(false)}
          contentContainerStyle={styles.modal}
        >
          <Text style={styles.modalTitle}>Ajouter une imprimante</Text>
          <Divider style={styles.modalDivider} />

          <TextInput
            mode="outlined"
            label="Nom"
            value={newPrinterForm.name}
            onChangeText={(text) => setNewPrinterForm({ ...newPrinterForm, name: text })}
            style={styles.input}
          />

          <TextInput
            mode="outlined"
            label="Adresse IP"
            value={newPrinterForm.ipAddress}
            onChangeText={(text) => setNewPrinterForm({ ...newPrinterForm, ipAddress: text })}
            keyboardType="numeric"
            style={styles.input}
          />

          <TextInput
            mode="outlined"
            label="Port"
            value={newPrinterForm.port}
            onChangeText={(text) => setNewPrinterForm({ ...newPrinterForm, port: text })}
            keyboardType="numeric"
            style={styles.input}
          />

          <Text style={styles.fieldLabel}>Type d'imprimante</Text>
          <RadioButton.Group
            value={newPrinterForm.type}
            onValueChange={(value) => setNewPrinterForm({ ...newPrinterForm, type: value as PrinterType })}
          >
            <RadioButton.Item label="Cuisine" value={PrinterType.KITCHEN} />
            <RadioButton.Item label="Bar" value={PrinterType.BAR} />
            <RadioButton.Item label="Caisse" value={PrinterType.CASHIER} />
            <RadioButton.Item label="Général" value={PrinterType.GENERAL} />
          </RadioButton.Group>

          <Text style={styles.fieldLabel}>Largeur du papier</Text>
          <RadioButton.Group
            value={newPrinterForm.paperWidth.toString()}
            onValueChange={(value) => setNewPrinterForm({ ...newPrinterForm, paperWidth: parseInt(value) })}
          >
            <RadioButton.Item label="58mm" value="58" />
            <RadioButton.Item label="80mm" value="80" />
          </RadioButton.Group>

          <View style={styles.modalActions}>
            <Button mode="text" onPress={() => setAddModalVisible(false)}>
              Annuler
            </Button>
            <Button mode="contained" onPress={handleAddPrinter}>
              Ajouter
            </Button>
          </View>
        </Modal>
      </Portal>

      {/* Modal de découverte */}
      <Portal>
        <Modal
          visible={discoveryModalVisible}
          onDismiss={() => setDiscoveryModalVisible(false)}
          contentContainerStyle={styles.modal}
        >
          <Text style={styles.modalTitle}>Découverte d'imprimantes</Text>
          <Divider style={styles.modalDivider} />

          <View style={styles.discoveryContent}>
            <Icon name="wifi" size={48} color={theme.colors.primary} />
            <Text style={styles.discoveryText}>
              Recherche d'imprimantes sur le réseau local...
            </Text>
            <Text style={styles.discoverySubtext}>
              Assurez-vous que vos imprimantes sont allumées et connectées au même réseau WiFi
            </Text>
          </View>

          <View style={styles.modalActions}>
            <Button 
              mode="text" 
              onPress={() => setDiscoveryModalVisible(false)}
            >
              Fermer
            </Button>
            <Button 
              mode="contained" 
              onPress={() => {
                setDiscoveryModalVisible(false);
                navigation.navigate('PrinterDiscovery' as never);
              }}
            >
              Scanner
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
    backgroundColor: '#f5f5f5',
  },
  scrollView: {
    flex: 1,
  },
  quickActions: {
    flexDirection: 'row',
    padding: 16,
    gap: 12,
    elevation: 2,
    backgroundColor: 'white',
  },
  quickActionButton: {
    flex: 1,
  },
  list: {
    padding: 16,
    paddingBottom: 80,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    paddingTop: 100,
  },
  emptyText: {
    fontSize: 18,
    marginTop: 16,
    marginBottom: 24,
    opacity: 0.7,
  },
  addFirstButton: {
    paddingHorizontal: 24,
  },
  printerCard: {
    marginBottom: 12,
  },
  printerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  printerInfo: {
    flex: 1,
  },
  printerTitleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  printerName: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  defaultChip: {
    height: 20,
  },
  printerDetails: {
    fontSize: 14,
    opacity: 0.7,
    marginTop: 4,
  },
  printerStatusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
    marginTop: 8,
  },
  statusText: {
    fontSize: 12,
    fontWeight: '500',
  },
  typeChip: {
    height: 22,
  },
  divider: {
    marginVertical: 12,
  },
  printerActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  fab: {
    position: 'absolute',
    margin: 16,
    right: 0,
    bottom: 0,
  },
  modal: {
    backgroundColor: 'white',
    margin: 20,
    padding: 20,
    borderRadius: 8,
    maxHeight: '80%',
  },
  modalTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  modalDivider: {
    marginBottom: 16,
  },
  input: {
    marginBottom: 12,
  },
  fieldLabel: {
    fontSize: 16,
    fontWeight: '500',
    marginTop: 8,
    marginBottom: 8,
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    gap: 12,
    marginTop: 16,
  },
  discoveryContent: {
    alignItems: 'center',
    paddingVertical: 24,
  },
  discoveryText: {
    fontSize: 16,
    marginTop: 16,
    textAlign: 'center',
  },
  discoverySubtext: {
    fontSize: 14,
    marginTop: 8,
    textAlign: 'center',
    opacity: 0.7,
  },
});

export default PrinterSettingsScreen;