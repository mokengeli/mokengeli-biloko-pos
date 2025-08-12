// src/screens/settings/PrinterDiscoveryScreen.tsx

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Alert,
  FlatList,
  RefreshControl
} from 'react-native';
import {
  Appbar,
  Surface,
  Text,
  Button,
  TextInput,
  Card,
  List,
  ProgressBar,
  Chip,
  useTheme,
  ActivityIndicator,
  Snackbar,
  Portal,
  Dialog,
  IconButton
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { StackNavigationProp } from '@react-navigation/stack';
import { NetworkScanner } from '../../services/printer/NetworkScanner';
import { PrinterStorage } from '../../services/printer/PrinterStorage';
import {
  DiscoveredPrinter,
  PrinterConfig,
  PrinterBrand,
  DEFAULT_PRINTER_SETTINGS,
  PrintDestination,
  PrintPriority
} from '../../types/printer.types';

type PrinterDiscoveryScreenNavigationProp = StackNavigationProp<any, 'PrinterDiscovery'>;

interface PrinterDiscoveryScreenProps {
  navigation: PrinterDiscoveryScreenNavigationProp;
}

export const PrinterDiscoveryScreen: React.FC<PrinterDiscoveryScreenProps> = ({ navigation }) => {
  const theme = useTheme();
  const [scanner] = useState(() => new NetworkScanner());

  // États
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [discoveredPrinters, setDiscoveredPrinters] = useState<DiscoveredPrinter[]>([]);
  const [networkInfo, setNetworkInfo] = useState<any>(null);
  const [selectedPrinter, setSelectedPrinter] = useState<DiscoveredPrinter | null>(null);
  const [configDialogVisible, setConfigDialogVisible] = useState(false);
  const [manualIp, setManualIp] = useState('');
  const [manualPort, setManualPort] = useState('9100');
  const [isTestingManual, setIsTestingManual] = useState(false);
  
  // Snackbar
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');

  // Charger les informations réseau au montage
  useEffect(() => {
    loadNetworkInfo();
    
    // Cleanup
    return () => {
      if (scanner) {
        scanner.stopScan();
      }
    };
  }, []);

  // Charger les informations réseau
  const loadNetworkInfo = async () => {
    try {
      const info = await NetworkScanner.getCurrentNetworkInfo();
      setNetworkInfo(info);
      
      if (!info.isConnected || info.type !== 'wifi') {
        Alert.alert(
          'Pas de connexion WiFi',
          'Veuillez vous connecter à un réseau WiFi pour scanner les imprimantes.',
          [{ text: 'OK' }]
        );
      }
    } catch (error) {
      console.error('Error loading network info:', error);
    }
  };

  // Lancer le scan
  const startScan = async () => {
    if (!networkInfo?.isConnected || networkInfo?.type !== 'wifi') {
      Alert.alert(
        'Connexion requise',
        'Une connexion WiFi est nécessaire pour scanner le réseau.',
        [{ text: 'OK' }]
      );
      return;
    }

    setIsScanning(true);
    setScanProgress(0);
    setDiscoveredPrinters([]);

    try {
      const printers = await scanner.scanNetwork((progress, found) => {
        setScanProgress(progress / 100);
        setDiscoveredPrinters(found);
      });

      setDiscoveredPrinters(printers);
      
      if (printers.length === 0) {
        showSnackbar('Aucune imprimante trouvée sur le réseau');
      } else {
        showSnackbar(`${printers.length} imprimante(s) trouvée(s)`);
      }
    } catch (error: any) {
      console.error('Scan error:', error);
      Alert.alert(
        'Erreur de scan',
        error.message || 'Une erreur s\'est produite lors du scan du réseau.',
        [{ text: 'OK' }]
      );
    } finally {
      setIsScanning(false);
      setScanProgress(0);
    }
  };

  // Arrêter le scan
  const stopScan = () => {
    scanner.stopScan();
    setIsScanning(false);
    setScanProgress(0);
    showSnackbar('Scan arrêté');
  };

  // Afficher un message
  const showSnackbar = (message: string) => {
    setSnackbarMessage(message);
    setSnackbarVisible(true);
  };

  const handleManualTest = async () => {
    if (!manualIp) {
      showSnackbar('Veuillez entrer une adresse IP');
      return;
    }

    setIsTestingManual(true);
    const success = await scanner.quickTest(manualIp, parseInt(manualPort, 10));
    setIsTestingManual(false);

    if (success) {
      const printer: DiscoveredPrinter = {
        ip: manualIp,
        port: parseInt(manualPort, 10),
        name: `Imprimante sur ${manualIp}`,
        manufacturer: 'Non identifiée',
        protocol: 'ESC_POS'
      };
      selectPrinter(printer);
    } else {
      showSnackbar('Aucune imprimante détectée à cette adresse');
    }
  };

  // Sélectionner une imprimante pour configuration
  const selectPrinter = (printer: DiscoveredPrinter) => {
    setSelectedPrinter(printer);
    setConfigDialogVisible(true);
  };

  // Ajouter l'imprimante sélectionnée
  const addSelectedPrinter = async () => {
    if (!selectedPrinter) return;

    const config: PrinterConfig = {
      id: `printer_${Date.now()}`,
      name: selectedPrinter.name || `Imprimante sur ${selectedPrinter.ip}`,
      description: `Découverte automatique - ${selectedPrinter.manufacturer || 'Générique'}`,
      connectionType: 'TCP',
      protocol: selectedPrinter.protocol || 'ESC_POS',
      brand: (selectedPrinter.manufacturer?.toUpperCase() as PrinterBrand) || 'GENERIC',
      connectionParams: {
        ip: selectedPrinter.ip,
        port: selectedPrinter.port,
        timeout: DEFAULT_PRINTER_SETTINGS.timeout
      },
      printSettings: {
        paperWidth: DEFAULT_PRINTER_SETTINGS.paperWidth,
        charset: DEFAULT_PRINTER_SETTINGS.charset,
        codepage: DEFAULT_PRINTER_SETTINGS.codepage,
        density: DEFAULT_PRINTER_SETTINGS.density,
        feedLines: DEFAULT_PRINTER_SETTINGS.feedLines
      },
      destinations: [
        {
          destination: PrintDestination.CASHIER,
          enabled: true,
          autoPrint: false,
          copies: 1,
          priority: PrintPriority.NORMAL
        }
      ],
      isDefault: false,
      isActive: true,
      createdAt: new Date(),
      updatedAt: new Date()
    };

    try {
      await PrinterStorage.savePrinter(config);
      setConfigDialogVisible(false);
      showSnackbar('Imprimante ajoutée avec succès');
      
      // Retourner à l'écran de configuration
      setTimeout(() => {
        navigation.goBack();
      }, 1000);
    } catch (error) {
      console.error('Error adding printer:', error);
      Alert.alert('Erreur', 'Impossible d\'ajouter l\'imprimante');
    }
  };

  // Tester une imprimante découverte
  const testPrinter = async (printer: DiscoveredPrinter) => {
    try {
      const { PrinterConnection } = await import('../../services/printer/PrinterConnection');
      const connection = new PrinterConnection();
      
      const connected = await connection.connect({
        ip: printer.ip,
        port: printer.port,
        timeout: 5000
      });

      if (connected) {
        await connection.test();
        await connection.disconnect();
        
        Alert.alert(
          'Test réussi',
          `L'imprimante ${printer.name} répond correctement.`,
          [{ text: 'OK' }]
        );
      } else {
        Alert.alert(
          'Test échoué',
          'Impossible de se connecter à l\'imprimante.',
          [{ text: 'OK' }]
        );
      }
    } catch (error: any) {
      Alert.alert(
        'Erreur de test',
        error.message || 'Une erreur s\'est produite lors du test.',
        [{ text: 'OK' }]
      );
    }
  };

  // Rendu d'une imprimante découverte
  const renderPrinter = ({ item }: { item: DiscoveredPrinter }) => (
    <Card style={styles.printerCard}>
      <Card.Content>
        <View style={styles.printerHeader}>
          <Icon name="printer" size={24} color={theme.colors.primary} />
          <View style={styles.printerInfo}>
            <Text style={styles.printerName}>{item.name}</Text>
            <Text style={styles.printerAddress}>{item.ip}:{item.port}</Text>
            {item.manufacturer && (
              <Chip style={styles.manufacturerChip}>
                {item.manufacturer}
              </Chip>
            )}
          </View>
        </View>
      </Card.Content>
      <Card.Actions>
        <Button onPress={() => testPrinter(item)}>Tester</Button>
        <Button mode="contained" onPress={() => selectPrinter(item)}>
          Ajouter
        </Button>
      </Card.Actions>
    </Card>
  );

  return (
    <SafeAreaView style={styles.container}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => navigation.goBack()} />
        <Appbar.Content title="Découverte d'imprimantes" />
      </Appbar.Header>

      <ScrollView style={styles.scrollView}>
        {/* Informations réseau */}
        <Surface style={styles.networkCard}>
          <View style={styles.networkHeader}>
            <Icon 
              name="wifi" 
              size={24} 
              color={networkInfo?.isConnected ? theme.colors.primary : '#999'} 
            />
            <Text style={styles.networkTitle}>Informations réseau</Text>
          </View>
          
          {networkInfo ? (
            <View style={styles.networkDetails}>
              <View style={styles.networkRow}>
                <Text style={styles.networkLabel}>État:</Text>
                <Text style={styles.networkValue}>
                  {networkInfo.isConnected ? 'Connecté' : 'Déconnecté'}
                </Text>
              </View>
              
              {networkInfo.type && (
                <View style={styles.networkRow}>
                  <Text style={styles.networkLabel}>Type:</Text>
                  <Text style={styles.networkValue}>
                    {networkInfo.type.toUpperCase()}
                  </Text>
                </View>
              )}
              
              {networkInfo.ip && (
                <View style={styles.networkRow}>
                  <Text style={styles.networkLabel}>Adresse IP:</Text>
                  <Text style={styles.networkValue}>{networkInfo.ip}</Text>
                </View>
              )}
              
              {networkInfo.subnet && networkInfo.prefixLength && (
                <View style={styles.networkRow}>
                  <Text style={styles.networkLabel}>Sous-réseau:</Text>
                  <Text style={styles.networkValue}>{`${networkInfo.subnet}/${networkInfo.prefixLength}`}</Text>
                </View>
              )}
              
              {networkInfo.ssid && (
                <View style={styles.networkRow}>
                  <Text style={styles.networkLabel}>Réseau WiFi:</Text>
                  <Text style={styles.networkValue}>{networkInfo.ssid}</Text>
                </View>
              )}
            </View>
          ) : (
            <ActivityIndicator size="small" color={theme.colors.primary} />
          )}
        </Surface>

        {/* Contrôles de scan */}
        <Surface style={styles.scanCard}>
          <Text style={styles.scanTitle}>Recherche d'imprimantes</Text>
          <Text style={styles.scanDescription}>
            Le scan va rechercher toutes les imprimantes sur votre réseau local.
            Cela peut prendre quelques minutes.
          </Text>
          
          {isScanning && (
            <View style={styles.progressContainer}>
              <ProgressBar progress={scanProgress} color={theme.colors.primary} />
              <Text style={styles.progressText}>
                {Math.round(scanProgress * 100)}% - Scan en cours...
              </Text>
            </View>
          )}
          
          <View style={styles.scanActions}>
            {!isScanning ? (
              <Button
                mode="contained"
                onPress={startScan}
                icon="magnify"
                disabled={!networkInfo?.isConnected || networkInfo?.type !== 'wifi'}
              >
                Lancer le scan
              </Button>
            ) : (
              <Button
                mode="outlined"
                onPress={stopScan}
                icon="stop"
              >
                Arrêter le scan
              </Button>
            )}
          </View>

          <View style={styles.manualContainer}>
            <Text style={styles.manualTitle}>Recherche manuelle</Text>
            <View style={styles.manualInputs}>
              <TextInput
                label="Adresse IP"
                value={manualIp}
                onChangeText={setManualIp}
                style={[styles.manualInput, { flex: 2 }]}
                keyboardType="numeric"
              />
              <TextInput
                label="Port"
                value={manualPort}
                onChangeText={setManualPort}
                style={[styles.manualInput, { flex: 1 }]}
                keyboardType="numeric"
              />
            </View>
            <Button
              mode="outlined"
              onPress={handleManualTest}
              loading={isTestingManual}
              disabled={isTestingManual}
              icon="lan-connect"
            >
              Tester
            </Button>
          </View>
        </Surface>

        {/* Résultats du scan */}
        {discoveredPrinters.length > 0 && (
          <View style={styles.resultsContainer}>
            <Text style={styles.resultsTitle}>
              Imprimantes trouvées ({discoveredPrinters.length})
            </Text>
            
            {discoveredPrinters.map((printer, index) => (
              <View key={`${printer.ip}-${printer.port}-${index}`}>
                {renderPrinter({ item: printer })}
              </View>
            ))}
          </View>
        )}

        {/* Message si aucune imprimante trouvée */}
        {!isScanning && scanProgress === 0 && discoveredPrinters.length === 0 && (
          <Surface style={styles.emptyCard}>
            <Icon name="printer-search" size={48} color="#999" />
            <Text style={styles.emptyText}>
              Aucune imprimante détectée
            </Text>
            <Text style={styles.emptySubtext}>
              Assurez-vous que vos imprimantes sont allumées et connectées au même réseau WiFi.
            </Text>
          </Surface>
        )}
      </ScrollView>

      {/* Dialog de configuration rapide */}
      <Portal>
        <Dialog 
          visible={configDialogVisible} 
          onDismiss={() => setConfigDialogVisible(false)}
        >
          <Dialog.Title>Ajouter l'imprimante</Dialog.Title>
          <Dialog.Content>
            {selectedPrinter && (
              <View>
                <Text style={styles.dialogText}>
                  Voulez-vous ajouter cette imprimante ?
                </Text>
                <View style={styles.dialogDetails}>
                  <Text style={styles.dialogLabel}>Nom:</Text>
                  <Text>{selectedPrinter.name}</Text>
                </View>
                <View style={styles.dialogDetails}>
                  <Text style={styles.dialogLabel}>Adresse:</Text>
                  <Text>{selectedPrinter.ip}:{selectedPrinter.port}</Text>
                </View>
                {selectedPrinter.manufacturer && (
                  <View style={styles.dialogDetails}>
                    <Text style={styles.dialogLabel}>Fabricant:</Text>
                    <Text>{selectedPrinter.manufacturer}</Text>
                  </View>
                )}
                <Text style={styles.dialogNote}>
                  Vous pourrez configurer les paramètres détaillés après l'ajout.
                </Text>
              </View>
            )}
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setConfigDialogVisible(false)}>
              Annuler
            </Button>
            <Button mode="contained" onPress={addSelectedPrinter}>
              Ajouter
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
  networkCard: {
    margin: 16,
    padding: 16,
    borderRadius: 8,
  },
  networkHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  networkTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  networkDetails: {
    gap: 8,
  },
  networkRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  networkLabel: {
    fontSize: 14,
    opacity: 0.7,
  },
  networkValue: {
    fontSize: 14,
    fontWeight: '500',
  },
  scanCard: {
    margin: 16,
    marginTop: 0,
    padding: 16,
    borderRadius: 8,
  },
  scanTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  scanDescription: {
    fontSize: 14,
    opacity: 0.7,
    marginBottom: 16,
  },
  progressContainer: {
    marginBottom: 16,
  },
  progressText: {
    fontSize: 12,
    textAlign: 'center',
    marginTop: 8,
    opacity: 0.7,
  },
  scanActions: {
    alignItems: 'center',
  },
  manualContainer: {
    marginTop: 24,
    gap: 12,
  },
  manualInputs: {
    flexDirection: 'row',
    gap: 8,
    marginBottom: 8,
  },
  manualInput: {
    flex: 1,
  },
  manualTitle: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  resultsContainer: {
    padding: 16,
    paddingTop: 0,
  },
  resultsTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  printerCard: {
    marginBottom: 12,
    borderRadius: 8,
  },
  printerHeader: {
    flexDirection: 'row',
    alignItems: 'flex-start',
  },
  printerInfo: {
    flex: 1,
    marginLeft: 12,
  },
  printerName: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  printerAddress: {
    fontSize: 14,
    opacity: 0.7,
    marginTop: 2,
  },
  manufacturerChip: {
    marginTop: 8,
    alignSelf: 'flex-start',
  },
  emptyCard: {
    margin: 16,
    padding: 32,
    borderRadius: 8,
    alignItems: 'center',
  },
  emptyText: {
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    opacity: 0.7,
    marginTop: 8,
    textAlign: 'center',
  },
  dialogText: {
    marginBottom: 16,
  },
  dialogDetails: {
    flexDirection: 'row',
    marginBottom: 8,
  },
  dialogLabel: {
    fontWeight: 'bold',
    marginRight: 8,
    width: 80,
  },
  dialogNote: {
    marginTop: 16,
    fontSize: 12,
    opacity: 0.7,
    fontStyle: 'italic',
  },
});