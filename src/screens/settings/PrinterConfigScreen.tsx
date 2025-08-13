// src/screens/settings/PrinterConfigScreen.tsx

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Alert,
  TouchableOpacity,
  RefreshControl,
  Dimensions
} from 'react-native';
import {
  Appbar,
  Surface,
  Text,
  FAB,
  Card,
  IconButton,
  Badge,
  Chip,
  Dialog,
  Portal,
  Button,
  Divider,
  List,
  useTheme,
  ActivityIndicator,
  Snackbar
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { StackNavigationProp } from '@react-navigation/stack';
import { PrinterStorage } from '../../services/printer/PrinterStorage';
import {
  PrinterConfig,
  PrinterStatus,
  PrintDestination,
  PrinterConnectionType
} from '../../types/printer.types';
import { PrinterAddModal } from '../../components/printer/PrinterAddModal';
import { PrinterAddModalSimple } from '../../components/printer/PrinterAddModalSimple';
import { PrinterTestModal } from '../../components/printer/PrinterTestModal';

type PrinterConfigScreenNavigationProp = StackNavigationProp<any, 'PrinterConfig'>;

interface PrinterConfigScreenProps {
  navigation: PrinterConfigScreenNavigationProp;
}

export const PrinterConfigScreen: React.FC<PrinterConfigScreenProps> = ({ navigation }) => {
  const theme = useTheme();
  const windowWidth = Dimensions.get('window').width;
  const isTablet = windowWidth >= 768;

  // États
  const [printers, setPrinters] = useState<PrinterConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [selectedPrinter, setSelectedPrinter] = useState<PrinterConfig | null>(null);
  
  // États des modals
  const [addModalVisible, setAddModalVisible] = useState(false);
  const [testModalVisible, setTestModalVisible] = useState(false);
  const [deleteDialogVisible, setDeleteDialogVisible] = useState(false);
  const [printerToDelete, setPrinterToDelete] = useState<PrinterConfig | null>(null);
  
  // Snackbar
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');

  // Charger les imprimantes
  const loadPrinters = useCallback(async () => {
    try {
      const loadedPrinters = await PrinterStorage.loadPrinters();
      setPrinters(loadedPrinters);
    } catch (error) {
      console.error('Error loading printers:', error);
      showSnackbar('Erreur lors du chargement des imprimantes');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  // Rafraîchir la liste
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadPrinters();
  }, [loadPrinters]);

  // Afficher un message
  const showSnackbar = (message: string) => {
    setSnackbarMessage(message);
    setSnackbarVisible(true);
  };

  // Charger au montage
  useEffect(() => {
    loadPrinters();
  }, [loadPrinters]);

  // Ajouter une imprimante
  const handleAddPrinter = async (config: PrinterConfig) => {
    try {
      await PrinterStorage.savePrinter(config);
      await loadPrinters();
      setAddModalVisible(false);
      showSnackbar('Imprimante ajoutée avec succès');
    } catch (error) {
      console.error('Error adding printer:', error);
      Alert.alert('Erreur', 'Impossible d\'ajouter l\'imprimante');
    }
  };

  // Définir comme imprimante par défaut
  const handleSetDefault = async (printer: PrinterConfig) => {
    try {
      await PrinterStorage.setDefaultPrinter(printer.id);
      await loadPrinters();
      showSnackbar(`${printer.name} définie comme imprimante par défaut`);
    } catch (error) {
      console.error('Error setting default printer:', error);
      Alert.alert('Erreur', 'Impossible de définir l\'imprimante par défaut');
    }
  };

  // Activer/Désactiver une imprimante
  const handleToggleActive = async (printer: PrinterConfig) => {
    try {
      const updatedPrinter = {
        ...printer,
        isActive: !printer.isActive,
        updatedAt: new Date()
      };
      await PrinterStorage.savePrinter(updatedPrinter);
      await loadPrinters();
      showSnackbar(`${printer.name} ${updatedPrinter.isActive ? 'activée' : 'désactivée'}`);
    } catch (error) {
      console.error('Error toggling printer active state:', error);
      Alert.alert('Erreur', 'Impossible de modifier l\'état de l\'imprimante');
    }
  };

  // Confirmer la suppression
  const confirmDelete = (printer: PrinterConfig) => {
    setPrinterToDelete(printer);
    setDeleteDialogVisible(true);
  };

  // Supprimer une imprimante
  const handleDeletePrinter = async () => {
    if (!printerToDelete) return;

    try {
      await PrinterStorage.deletePrinter(printerToDelete.id);
      await loadPrinters();
      setDeleteDialogVisible(false);
      setPrinterToDelete(null);
      showSnackbar(`${printerToDelete.name} supprimée`);
    } catch (error) {
      console.error('Error deleting printer:', error);
      Alert.alert('Erreur', 'Impossible de supprimer l\'imprimante');
    }
  };

  // Tester une imprimante
  const handleTestPrinter = (printer: PrinterConfig) => {
    setSelectedPrinter(printer);
    setTestModalVisible(true);
  };

  // Obtenir l'icône de connexion
  const getConnectionIcon = (type: PrinterConnectionType) => {
    switch (type) {
      case 'TCP':
        return 'wifi';
      case 'BLUETOOTH':
        return 'bluetooth';
      case 'USB':
        return 'usb';
      default:
        return 'printer';
    }
  };

  // Obtenir la couleur du statut
  const getStatusColor = (isActive: boolean, isDefault: boolean) => {
    if (isDefault) return theme.colors.primary;
    if (isActive) return '#4CAF50';
    return '#999';
  };

  // Formater les destinations
  const formatDestinations = (printer: PrinterConfig): string => {
    const activeDestinations = printer.destinations
      .filter(d => d.enabled)
      .map(d => d.destination);
    
    if (activeDestinations.length === 0) return 'Aucune destination';
    if (activeDestinations.length <= 2) return activeDestinations.join(', ');
    return `${activeDestinations.slice(0, 2).join(', ')} +${activeDestinations.length - 2}`;
  };

  // Rendu d'une carte d'imprimante
  const renderPrinterCard = (printer: PrinterConfig) => (
    <Card
      key={printer.id}
      style={[
        styles.printerCard,
        printer.isDefault && styles.defaultPrinterCard
      ]}
      elevation={printer.isDefault ? 4 : 2}
    >
      <Card.Content>
        <View style={styles.cardHeader}>
          <View style={styles.cardTitleContainer}>
            <Icon
              name={getConnectionIcon(printer.connectionType)}
              size={24}
              color={getStatusColor(printer.isActive, printer.isDefault)}
              style={styles.connectionIcon}
            />
            <View style={styles.titleTextContainer}>
              <Text style={styles.printerName}>{printer.name}</Text>
              {printer.description && (
                <Text style={styles.printerDescription}>{printer.description}</Text>
              )}
            </View>
          </View>
          
          <View style={styles.cardActions}>
            {printer.isDefault && (
              <Badge style={styles.defaultBadge}>Par défaut</Badge>
            )}
            <IconButton
              icon={printer.isActive ? 'toggle-switch' : 'toggle-switch-off'}
              iconColor={printer.isActive ? theme.colors.primary : '#999'}
              size={28}
              onPress={() => handleToggleActive(printer)}
            />
          </View>
        </View>

        <Divider style={styles.divider} />

        <View style={styles.cardDetails}>
          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Adresse IP:</Text>
            <Text style={styles.detailValue}>
              {printer.connectionParams.ip || 'Non configuré'}
              {printer.connectionParams.port && `:${printer.connectionParams.port}`}
            </Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Destinations:</Text>
            <Text style={styles.detailValue}>{formatDestinations(printer)}</Text>
          </View>

          <View style={styles.detailRow}>
            <Text style={styles.detailLabel}>Largeur papier:</Text>
            <Text style={styles.detailValue}>{printer.printSettings.paperWidth}mm</Text>
          </View>

          {printer.lastConnectedAt && (
            <View style={styles.detailRow}>
              <Text style={styles.detailLabel}>Dernière connexion:</Text>
              <Text style={styles.detailValue}>
                {new Date(printer.lastConnectedAt).toLocaleString()}
              </Text>
            </View>
          )}
        </View>

        <View style={styles.destinationChips}>
          {printer.destinations
            .filter(d => d.enabled)
            .map((dest, index) => (
              <Chip
                key={index}
                style={[
                  styles.destinationChip,
                  dest.autoPrint && styles.autoPrintChip
                ]}
                textStyle={styles.chipText}
                icon={dest.autoPrint ? 'play-circle' : undefined}
              >
                {dest.destination}
              </Chip>
            ))}
        </View>

        <Divider style={styles.divider} />

        <View style={styles.cardFooter}>
          <Button
            mode="text"
            onPress={() => handleTestPrinter(printer)}
            icon="test-tube"
          >
            Tester
          </Button>
          
          <Button
            mode="text"
            onPress={() => navigation.navigate('PrinterEdit', { printerId: printer.id })}
            icon="pencil"
          >
            Modifier
          </Button>
          
          {!printer.isDefault && (
            <Button
              mode="text"
              onPress={() => handleSetDefault(printer)}
              icon="star-outline"
            >
              Par défaut
            </Button>
          )}
          
          <IconButton
            icon="delete"
            iconColor={theme.colors.error}
            size={20}
            onPress={() => confirmDelete(printer)}
          />
        </View>
      </Card.Content>
    </Card>
  );

  // Interface de chargement
  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <Appbar.Header>
          <Appbar.BackAction onPress={() => navigation.goBack()} />
          <Appbar.Content title="Configuration d'impression" />
        </Appbar.Header>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Chargement des imprimantes...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => navigation.goBack()} />
        <Appbar.Content title="Configuration d'impression" />
        <Appbar.Action
          icon="magnify"
          onPress={() => navigation.navigate('PrinterDiscovery')}
        />
      </Appbar.Header>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.scrollContent}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[theme.colors.primary]}
          />
        }
      >
        {printers.length === 0 ? (
          <Surface style={styles.emptyContainer}>
            <Icon name="printer-off" size={64} color="#999" />
            <Text style={styles.emptyTitle}>Aucune imprimante configurée</Text>
            <Text style={styles.emptySubtitle}>
              Ajoutez une imprimante pour commencer
            </Text>
            <Button
              mode="contained"
              onPress={() => {
                console.log('[PrinterConfigScreen] Empty state button pressed');
                setAddModalVisible(true);
              }}
              icon="plus"
              style={styles.emptyButton}
            >
              Ajouter une imprimante
            </Button>
          </Surface>
        ) : (
          <View style={styles.printersContainer}>
            {printers.map(renderPrinterCard)}
          </View>
        )}
      </ScrollView>

      <FAB
        style={styles.fab}
        icon="plus"
        onPress={() => {
          console.log('[PrinterConfigScreen] FAB pressed, opening modal');
          setAddModalVisible(true);
        }}
        visible={printers.length > 0}
      />

      {/* Modal d'ajout simplifié */}
      <PrinterAddModalSimple
        visible={addModalVisible}
        onDismiss={() => {
          console.log('[PrinterConfigScreen] Modal dismissed');
          setAddModalVisible(false);
        }}
        onAdd={handleAddPrinter}
      />

      {/* Modal de test */}
      {selectedPrinter && (
        <PrinterTestModal
          visible={testModalVisible}
          onDismiss={() => {
            setTestModalVisible(false);
            setSelectedPrinter(null);
          }}
          printer={selectedPrinter}
        />
      )}

      {/* Dialog de confirmation de suppression */}
      <Portal>
        <Dialog visible={deleteDialogVisible} onDismiss={() => setDeleteDialogVisible(false)}>
          <Dialog.Title>Confirmer la suppression</Dialog.Title>
          <Dialog.Content>
            <Text>
              Êtes-vous sûr de vouloir supprimer l'imprimante "{printerToDelete?.name}" ?
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setDeleteDialogVisible(false)}>Annuler</Button>
            <Button onPress={handleDeletePrinter} textColor={theme.colors.error}>
              Supprimer
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      {/* Snackbar */}
      <Snackbar
        visible={snackbarVisible}
        onDismiss={() => setSnackbarVisible(false)}
        duration={3000}
      >
        {snackbarMessage}
      </Snackbar>
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
  scrollContent: {
    paddingBottom: 80,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
    opacity: 0.7,
  },
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
    margin: 16,
    borderRadius: 12,
  },
  emptyTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginTop: 16,
    marginBottom: 8,
  },
  emptySubtitle: {
    fontSize: 16,
    opacity: 0.7,
    marginBottom: 24,
  },
  emptyButton: {
    marginTop: 8,
  },
  printersContainer: {
    padding: 16,
    gap: 12,
  },
  printerCard: {
    marginBottom: 8,
    borderRadius: 12,
  },
  defaultPrinterCard: {
    borderWidth: 2,
    borderColor: '#4CAF50',
  },
  cardHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  cardTitleContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    flex: 1,
  },
  connectionIcon: {
    marginRight: 12,
  },
  titleTextContainer: {
    flex: 1,
  },
  printerName: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  printerDescription: {
    fontSize: 14,
    opacity: 0.7,
    marginTop: 2,
  },
  cardActions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  defaultBadge: {
    backgroundColor: '#4CAF50',
    marginRight: 8,
  },
  divider: {
    marginVertical: 12,
  },
  cardDetails: {
    gap: 8,
  },
  detailRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  detailLabel: {
    fontSize: 14,
    opacity: 0.7,
  },
  detailValue: {
    fontSize: 14,
    fontWeight: '500',
  },
  destinationChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
    marginTop: 12,
  },
  destinationChip: {
    backgroundColor: '#e3f2fd',
  },
  autoPrintChip: {
    backgroundColor: '#e8f5e9',
  },
  chipText: {
    fontSize: 12,
  },
  cardFooter: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 8,
  },
  fab: {
    position: 'absolute',
    margin: 16,
    right: 0,
    bottom: 0,
  },
});