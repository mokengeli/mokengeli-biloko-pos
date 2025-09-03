// src/screens/settings/PrinterConfigScreen.tsx
import React, { useState, useCallback } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  Alert,
} from 'react-native';
import {
  Appbar,
  Text,
  Card,
  Button,
  Surface,
  useTheme,
  ActivityIndicator,
  Chip,
  Divider,
  IconButton,
  FAB,
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StackNavigationProp } from '@react-navigation/stack';
import { useFocusEffect } from '@react-navigation/native';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useAuth } from '../../contexts/AuthContext';
import printerService, { PrinterConfig } from '../../services/PrinterService';

type PrinterConfigScreenNavigationProp = StackNavigationProp<any, 'PrinterConfig'>;

interface PrinterConfigScreenProps {
  navigation: PrinterConfigScreenNavigationProp;
}

export const PrinterConfigScreen: React.FC<PrinterConfigScreenProps> = ({ navigation }) => {
  const { user } = useAuth();
  const theme = useTheme();

  // États
  const [printers, setPrinters] = useState<PrinterConfig[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [testingPrinter, setTestingPrinter] = useState<string | null>(null);

  // Vérifier si le service d'impression est disponible
  const isPrinterServiceAvailable = printerService.isPrinterLibraryAvailable();

  // Charger les imprimantes
  const loadPrinters = useCallback(async () => {
    if (!user?.tenantCode) return;
    
    try {
      setIsLoading(true);
      await printerService.loadPrinters(user.tenantCode);
      const printersList = printerService.getPrinters(user.tenantCode);
      setPrinters(printersList);
    } catch (error) {
      console.error('Error loading printers:', error);
      Alert.alert('Erreur', 'Impossible de charger les imprimantes');
    } finally {
      setIsLoading(false);
    }
  }, [user?.tenantCode]);

  // Charger au montage et quand on revient sur l'écran
  useFocusEffect(
    useCallback(() => {
      loadPrinters();
    }, [loadPrinters])
  );

  // Naviguer vers la page d'ajout
  const openAddPrinter = () => {
    if (!user?.tenantCode) {
      Alert.alert('Erreur', 'Aucun tenant code disponible. Veuillez vous reconnecter.');
      return;
    }
    
    navigation.navigate('AddEditPrinter' as never);
  };

  // Naviguer vers la page d'édition
  const openEditPrinter = (printer: PrinterConfig) => {
    navigation.navigate('AddEditPrinter' as never, { printerId: printer.id } as never);
  };

  // Supprimer une imprimante
  const deletePrinter = useCallback(async (printerId: string) => {
    const printer = printers.find(p => p.id === printerId);
    if (!printer) return;

    Alert.alert(
      'Supprimer l\'imprimante',
      `Êtes-vous sûr de vouloir supprimer "${printer.name}" ?`,
      [
        { text: 'Annuler', style: 'cancel' },
        {
          text: 'Supprimer',
          style: 'destructive',
          onPress: async () => {
            try {
              await printerService.deletePrinter(printerId);
              await loadPrinters();
              Alert.alert('Succès', 'Imprimante supprimée');
            } catch (error) {
              console.error('Error deleting printer:', error);
              Alert.alert('Erreur', 'Impossible de supprimer l\'imprimante');
            }
          },
        },
      ]
    );
  }, [printers, loadPrinters]);

  // Définir comme imprimante par défaut
  const setDefaultPrinter = useCallback(async (printerId: string) => {
    try {
      await printerService.setDefaultPrinter(printerId);
      await loadPrinters();
      Alert.alert('Succès', 'Imprimante définie par défaut');
    } catch (error) {
      console.error('Error setting default printer:', error);
      Alert.alert('Erreur', 'Impossible de définir l\'imprimante par défaut');
    }
  }, [loadPrinters]);

  // Tester la connexion
  const testConnection = async (printer: PrinterConfig) => {
    setTestingPrinter(printer.id);
    try {
      const isConnected = await printerService.testConnection(printer.id);
      Alert.alert(
        isConnected ? 'Connexion réussie' : 'Connexion échouée',
        isConnected 
          ? `L'imprimante "${printer.name}" est accessible`
          : `Impossible de se connecter à "${printer.name}"`
      );
    } catch (error) {
      console.error('Error testing connection:', error);
      Alert.alert('Erreur', 'Erreur lors du test de connexion');
    } finally {
      setTestingPrinter(null);
    }
  };

  // Test d'impression
  const testPrint = async (printer: PrinterConfig) => {
    try {
      await printerService.testPrint(printer.id);
      Alert.alert('Succès', 'Ticket de test imprimé');
    } catch (error) {
      console.error('Error testing print:', error);
      Alert.alert('Erreur', 'Impossible d\'imprimer le ticket de test');
    }
  };

  // Obtenir la couleur du statut
  const getStatusColor = (status: PrinterConfig['status']) => {
    switch (status) {
      case 'online':
        return theme.colors.primary;
      case 'offline':
        return theme.colors.error;
      default:
        return theme.colors.outline;
    }
  };

  // Obtenir le libellé du statut
  const getStatusLabel = (status: PrinterConfig['status']) => {
    switch (status) {
      case 'online':
        return 'En ligne';
      case 'offline':
        return 'Hors ligne';
      default:
        return 'Inconnu';
    }
  };

  // Rendu d'une imprimante
  const renderPrinter = ({ item }: { item: PrinterConfig }) => (
    <Card style={styles.printerCard}>
      <Card.Content>
        <View style={styles.printerHeader}>
          <View style={styles.printerInfo}>
            <Text variant="titleMedium" style={styles.printerName}>
              {item.name}
            </Text>
            <Text variant="bodyMedium" style={styles.printerAddress}>
              {item.connection.ip}:{item.connection.port}
            </Text>
          </View>
          
          <View style={styles.printerStatus}>
            <Chip 
              mode="flat" 
              compact 
              style={{ backgroundColor: getStatusColor(item.status) }}
              textStyle={{ color: 'white', fontSize: 11 }}
            >
              {getStatusLabel(item.status)}
            </Chip>
            {item.isDefault && (
              <Chip 
                mode="flat" 
                compact 
                style={[styles.defaultChip, { backgroundColor: theme.colors.tertiary }]}
                textStyle={{ fontSize: 11 }}
              >
                Défaut
              </Chip>
            )}
          </View>
        </View>

        <Divider style={styles.divider} />
        
        <View style={styles.printerActions}>
          <View style={styles.actionButtons}>
            <Button
              mode="outlined"
              compact
              onPress={() => testConnection(item)}
              disabled={testingPrinter === item.id}
              loading={testingPrinter === item.id}
              style={styles.actionButton}
            >
              Test
            </Button>
            
            <Button
              mode="outlined"
              compact
              onPress={() => testPrint(item)}
              disabled={item.status === 'offline' || !item.isActive || !isPrinterServiceAvailable}
              style={styles.actionButton}
            >
              Imprimer test
            </Button>
            
            {!item.isDefault && item.isActive && (
              <Button
                mode="contained"
                compact
                onPress={() => setDefaultPrinter(item.id)}
                style={styles.actionButton}
              >
                Défaut
              </Button>
            )}
          </View>
          
          <View style={styles.iconButtons}>
            <IconButton
              icon="cog"
              size={20}
              onPress={() => openEditPrinter(item)}
            />
            <IconButton
              icon="delete"
              size={20}
              iconColor={theme.colors.error}
              onPress={() => deletePrinter(item.id)}
            />
          </View>
        </View>
      </Card.Content>
    </Card>
  );

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => navigation.goBack()} />
        <Appbar.Content title="Configuration Imprimantes" />
        <Appbar.Action 
          icon="bug" 
          onPress={() => navigation.navigate('PrinterDebug')} 
        />
      </Appbar.Header>

      {!printerService.isExternalLibraryAvailable() && (
        <Surface style={styles.warningBanner}>
          <View style={styles.warningContent}>
            <Icon
              name="information"
              size={24}
              color={theme.colors.primary}
            />
            <View style={styles.warningText}>
              <Text variant="titleSmall" style={styles.warningTitle}>
                Mode impression native
              </Text>
              <Text variant="bodySmall" style={styles.warningDescription}>
                Utilisation de l'implémentation native d'impression thermique.
                Les fonctionnalités sont disponibles normalement.
              </Text>
            </View>
          </View>
        </Surface>
      )}

      {isLoading ? (
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Chargement...</Text>
        </View>
      ) : (
        <>
          {printers.length === 0 ? (
            <View style={styles.emptyContainer}>
              <Icon
                name="printer-off"
                size={64}
                color={theme.colors.outline}
              />
              <Text variant="headlineSmall" style={styles.emptyTitle}>
                Aucune imprimante configurée
              </Text>
              <Text variant="bodyMedium" style={styles.emptyText}>
                Ajoutez votre première imprimante thermique pour commencer à imprimer les tickets.
              </Text>
            </View>
          ) : (
            <FlatList
              data={printers}
              keyExtractor={(item) => item.id}
              renderItem={renderPrinter}
              contentContainerStyle={styles.listContainer}
              showsVerticalScrollIndicator={false}
            />
          )}

          <FAB
            icon="plus"
            style={styles.fab}
            onPress={openAddPrinter}
            label="Ajouter"
          />
        </>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  warningBanner: {
    margin: 16,
    borderRadius: 8,
    elevation: 2,
  },
  warningContent: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
  },
  warningText: {
    flex: 1,
    marginLeft: 12,
  },
  warningTitle: {
    fontWeight: 'bold',
    marginBottom: 4,
  },
  warningDescription: {
    opacity: 0.8,
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
  emptyContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 32,
  },
  emptyTitle: {
    marginTop: 16,
    marginBottom: 8,
    textAlign: 'center',
  },
  emptyText: {
    textAlign: 'center',
    opacity: 0.7,
    lineHeight: 22,
  },
  listContainer: {
    padding: 16,
    paddingBottom: 88, // Space for FAB
  },
  printerCard: {
    marginBottom: 16,
    elevation: 2,
  },
  printerHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  printerInfo: {
    flex: 1,
  },
  printerName: {
    fontWeight: 'bold',
    marginBottom: 4,
  },
  printerAddress: {
    opacity: 0.7,
  },
  printerStatus: {
    alignItems: 'flex-end',
    gap: 4,
  },
  defaultChip: {
    marginTop: 4,
  },
  divider: {
    marginVertical: 12,
  },
  printerActions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  actionButtons: {
    flexDirection: 'row',
    gap: 8,
    flex: 1,
  },
  actionButton: {
    flex: 1,
    minWidth: 100,
  },
  iconButtons: {
    flexDirection: 'row',
  },
  fab: {
    position: 'absolute',
    right: 16,
    bottom: 16,
  },
});

export default PrinterConfigScreen;