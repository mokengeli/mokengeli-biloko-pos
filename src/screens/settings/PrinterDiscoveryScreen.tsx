// src/screens/settings/PrinterDiscoveryScreen.tsx

import React, { useState, useEffect, useCallback } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  Alert,
  RefreshControl,
} from 'react-native';
import {
  Appbar,
  Card,
  Text,
  Button,
  ActivityIndicator,
  Surface,
  List,
  useTheme,
  TextInput,
  Portal,
  Modal,
  Divider,
  RadioButton,
  ProgressBar,
  Chip,
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StackNavigationProp } from '@react-navigation/stack';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { PrinterDiscovery } from '../../services/printing/PrinterDiscovery';
import { PrinterStorage } from '../../services/printing/PrinterStorage';
import { PrinterType, DiscoveredPrinter } from '../../services/printing/types';
import { usePrintManager } from '../../hooks/usePrintManager';

type PrinterDiscoveryScreenNavigationProp = StackNavigationProp<any, 'PrinterDiscovery'>;

interface PrinterDiscoveryScreenProps {
  navigation: PrinterDiscoveryScreenNavigationProp;
}

export const PrinterDiscoveryScreen: React.FC<PrinterDiscoveryScreenProps> = ({ navigation }) => {
  const theme = useTheme();
  const { addPrinter, testPrinter } = usePrintManager();
  const discoveryService = PrinterDiscovery.getInstance();
  
  // États
  const [isScanning, setIsScanning] = useState(false);
  const [scanProgress, setScanProgress] = useState(0);
  const [discoveredPrinters, setDiscoveredPrinters] = useState<DiscoveredPrinter[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [manualModalVisible, setManualModalVisible] = useState(false);
  const [configModalVisible, setConfigModalVisible] = useState(false);
  const [selectedPrinter, setSelectedPrinter] = useState<DiscoveredPrinter | null>(null);
  const [networkInfo, setNetworkInfo] = useState<any>(null);
  
  // Formulaire manuel
  const [manualForm, setManualForm] = useState({
    ipAddress: '',
    port: '9100',
  });
  
  // Configuration de l'imprimante sélectionnée
  const [printerConfig, setPrinterConfig] = useState({
    name: '',
    type: PrinterType.GENERAL,
    paperWidth: 80,
  });
  
  // Charger les informations réseau au montage
  useEffect(() => {
    loadNetworkInfo();
  }, []);
  
  // Charger les informations réseau
  const loadNetworkInfo = async () => {
    try {
      const info = await discoveryService.getNetworkInfo();
      setNetworkInfo(info);
    } catch (error) {
      console.error('Error loading network info:', error);
    }
  };
  
  // Scanner le réseau
  const startNetworkScan = async () => {
    if (isScanning) return;
    
    setIsScanning(true);
    setDiscoveredPrinters([]);
    setScanProgress(0);
    
    try {
      // Configurer le listener de progression
      discoveryService.on('scanProgress', (data) => {
        setScanProgress(data.percentage / 100);
      });
      
      // Configurer le listener pour les imprimantes trouvées
      discoveryService.on('PRINTER_FOUND', (data) => {
        console.log('[Discovery] Printer found:', data);
      });
      
      // Lancer le scan
      const printers = await discoveryService.discoverPrinters({
        timeout: 2000,
        concurrent: 10,
      });
      
      setDiscoveredPrinters(printers);
      
      if (printers.length === 0) {
        Alert.alert(
          'Aucune imprimante trouvée',
          'Assurez-vous que vos imprimantes sont allumées et connectées au même réseau WiFi.',
          [{ text: 'OK' }]
        );
      }
    } catch (error: any) {
      Alert.alert('Erreur', error.message || 'Erreur lors du scan du réseau');
    } finally {
      setIsScanning(false);
      setScanProgress(0);
      discoveryService.removeAllListeners();
    }
  };
  
  // Scan rapide (port 9100 uniquement)
  const quickScan = async () => {
    if (isScanning) return;
    
    setIsScanning(true);
    setDiscoveredPrinters([]);
    
    try {
      const printers = await discoveryService.quickDiscover();
      setDiscoveredPrinters(printers);
      
      if (printers.length === 0) {
        Alert.alert(
          'Aucune imprimante trouvée',
          'Essayez le scan approfondi ou ajoutez manuellement l\'imprimante.',
          [{ text: 'OK' }]
        );
      }
    } catch (error: any) {
      Alert.alert('Erreur', error.message);
    } finally {
      setIsScanning(false);
    }
  };
  
  // Arrêter le scan
  const stopScan = () => {
    discoveryService.stopScan();
    setIsScanning(false);
    setScanProgress(0);
  };
  
  // Tester une IP manuelle
  const testManualPrinter = async () => {
    if (!manualForm.ipAddress) {
      Alert.alert('Erreur', 'Veuillez entrer une adresse IP');
      return;
    }
    
    try {
      const printer = await discoveryService.testSpecificPrinter(
        manualForm.ipAddress,
        parseInt(manualForm.port)
      );
      
      if (printer) {
        setDiscoveredPrinters([printer]);
        setManualModalVisible(false);
        Alert.alert('Succès', 'Imprimante trouvée!');
      } else {
        Alert.alert('Échec', 'Aucune imprimante trouvée à cette adresse');
      }
    } catch (error: any) {
      Alert.alert('Erreur', error.message);
    }
  };
  
  // Configurer et ajouter une imprimante
  const configurePrinter = (printer: DiscoveredPrinter) => {
    setSelectedPrinter(printer);
    setPrinterConfig({
      name: `Imprimante ${printer.ipAddress}`,
      type: PrinterType.GENERAL,
      paperWidth: 80,
    });
    setConfigModalVisible(true);
  };
  
  // Sauvegarder la configuration
  const savePrinterConfig = async () => {
    if (!selectedPrinter || !printerConfig.name) {
      Alert.alert('Erreur', 'Veuillez remplir tous les champs');
      return;
    }
    
    try {
      const config = PrinterStorage.createDefaultPrinterConfig(
        printerConfig.type,
        selectedPrinter.ipAddress,
        printerConfig.name
      );
      
      config.port = selectedPrinter.port;
      config.paperWidth = printerConfig.paperWidth as 58 | 80;
      
      await addPrinter(config);
      
      setConfigModalVisible(false);
      Alert.alert(
        'Succès',
        'Imprimante ajoutée avec succès',
        [
          { 
            text: 'OK',
            onPress: () => navigation.goBack()
          }
        ]
      );
    } catch (error: any) {
      Alert.alert('Erreur', error.message);
    }
  };
  
  // Rafraîchir
  const handleRefresh = async () => {
    setRefreshing(true);
    await loadNetworkInfo();
    setRefreshing(false);
  };
  
  // Rendu d'une imprimante découverte
  const renderDiscoveredPrinter = ({ item }: { item: DiscoveredPrinter }) => (
    <Card style={styles.printerCard}>
      <Card.Content>
        <View style={styles.printerHeader}>
          <Icon 
            name="printer" 
            size={32} 
            color={item.isResponding ? theme.colors.primary : theme.colors.disabled}
          />
          <View style={styles.printerInfo}>
            <Text style={styles.printerIp}>{item.ipAddress}:{item.port}</Text>
            <Text style={styles.printerDetails}>
              {item.manufacturer || 'Fabricant inconnu'} • {item.model || 'Modèle inconnu'}
            </Text>
            {item.hostname && (
              <Text style={styles.printerHostname}>{item.hostname}</Text>
            )}
          </View>
        </View>
        
        <View style={styles.printerStatus}>
          <Chip 
            style={[
              styles.statusChip,
              { backgroundColor: item.isResponding ? '#E8F5E9' : '#FFEBEE' }
            ]}
            textStyle={{ 
              color: item.isResponding ? '#4CAF50' : '#F44336',
              fontSize: 11
            }}
          >
            {item.isResponding ? 'En ligne' : 'Hors ligne'}
          </Chip>
        </View>
        
        <Button
          mode="contained"
          onPress={() => configurePrinter(item)}
          style={styles.addButton}
          disabled={!item.isResponding}
        >
          Ajouter cette imprimante
        </Button>
      </Card.Content>
    </Card>
  );
  
  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => navigation.goBack()} />
        <Appbar.Content title="Découverte d'imprimantes" />
        <Appbar.Action 
          icon="refresh" 
          onPress={handleRefresh}
        />
      </Appbar.Header>
      
      {/* Informations réseau */}
      {networkInfo && (
        <Surface style={styles.networkInfo}>
          <View style={styles.networkRow}>
            <Icon 
              name="wifi" 
              size={20} 
              color={networkInfo.isConnected ? theme.colors.primary : theme.colors.error}
            />
            <Text style={styles.networkText}>
              {networkInfo.isConnected 
                ? `Connecté • IP: ${networkInfo.ipAddress || 'Inconnue'}`
                : 'Non connecté au réseau'}
            </Text>
          </View>
          {networkInfo.subnet && (
            <Text style={styles.subnetText}>Subnet: {networkInfo.subnet}.0/24</Text>
          )}
        </Surface>
      )}
      
      {/* Actions de scan */}
      <Surface style={styles.scanActions}>
        <Button
          mode="contained"
          onPress={quickScan}
          style={styles.scanButton}
          loading={isScanning}
          disabled={isScanning || !networkInfo?.isConnected}
          icon="magnify"
        >
          Scan rapide
        </Button>
        
        <Button
          mode="outlined"
          onPress={startNetworkScan}
          style={styles.scanButton}
          loading={isScanning}
          disabled={isScanning || !networkInfo?.isConnected}
          icon="radar"
        >
          Scan complet
        </Button>
        
        <Button
          mode="text"
          onPress={() => setManualModalVisible(true)}
          icon="ip"
        >
          IP manuelle
        </Button>
      </Surface>
      
      {/* Barre de progression */}
      {isScanning && (
        <View style={styles.progressContainer}>
          <ProgressBar progress={scanProgress} color={theme.colors.primary} />
          <Text style={styles.progressText}>
            Recherche en cours... {Math.round(scanProgress * 100)}%
          </Text>
          <Button mode="text" onPress={stopScan}>
            Arrêter
          </Button>
        </View>
      )}
      
      {/* Liste des imprimantes découvertes */}
      <FlatList
        data={discoveredPrinters}
        renderItem={renderDiscoveredPrinter}
        keyExtractor={(item) => `${item.ipAddress}:${item.port}`}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
        ListEmptyComponent={
          !isScanning ? (
            <View style={styles.emptyContainer}>
              <Icon name="printer-search" size={64} color={theme.colors.disabled} />
              <Text style={styles.emptyText}>
                {discoveredPrinters.length === 0 
                  ? 'Aucune imprimante découverte'
                  : 'Recherche terminée'}
              </Text>
              <Text style={styles.emptySubtext}>
                Lancez un scan pour rechercher des imprimantes
              </Text>
            </View>
          ) : null
        }
      />
      
      {/* Modal pour IP manuelle */}
      <Portal>
        <Modal
          visible={manualModalVisible}
          onDismiss={() => setManualModalVisible(false)}
          contentContainerStyle={styles.modal}
        >
          <Text style={styles.modalTitle}>Ajouter par adresse IP</Text>
          <Divider style={styles.modalDivider} />
          
          <TextInput
            mode="outlined"
            label="Adresse IP"
            value={manualForm.ipAddress}
            onChangeText={(text) => setManualForm({ ...manualForm, ipAddress: text })}
            keyboardType="numeric"
            placeholder="192.168.1.100"
            style={styles.input}
          />
          
          <TextInput
            mode="outlined"
            label="Port"
            value={manualForm.port}
            onChangeText={(text) => setManualForm({ ...manualForm, port: text })}
            keyboardType="numeric"
            placeholder="9100"
            style={styles.input}
          />
          
          <View style={styles.modalActions}>
            <Button mode="text" onPress={() => setManualModalVisible(false)}>
              Annuler
            </Button>
            <Button mode="contained" onPress={testManualPrinter}>
              Tester
            </Button>
          </View>
        </Modal>
      </Portal>
      
      {/* Modal de configuration */}
      <Portal>
        <Modal
          visible={configModalVisible}
          onDismiss={() => setConfigModalVisible(false)}
          contentContainerStyle={styles.modal}
        >
          <Text style={styles.modalTitle}>Configurer l'imprimante</Text>
          <Divider style={styles.modalDivider} />
          
          <TextInput
            mode="outlined"
            label="Nom de l'imprimante"
            value={printerConfig.name}
            onChangeText={(text) => setPrinterConfig({ ...printerConfig, name: text })}
            style={styles.input}
          />
          
          <Text style={styles.fieldLabel}>Type d'imprimante</Text>
          <RadioButton.Group
            value={printerConfig.type}
            onValueChange={(value) => setPrinterConfig({ ...printerConfig, type: value as PrinterType })}
          >
            <RadioButton.Item label="Cuisine" value={PrinterType.KITCHEN} />
            <RadioButton.Item label="Bar" value={PrinterType.BAR} />
            <RadioButton.Item label="Caisse" value={PrinterType.CASHIER} />
            <RadioButton.Item label="Général" value={PrinterType.GENERAL} />
          </RadioButton.Group>
          
          <Text style={styles.fieldLabel}>Largeur du papier</Text>
          <RadioButton.Group
            value={printerConfig.paperWidth.toString()}
            onValueChange={(value) => setPrinterConfig({ ...printerConfig, paperWidth: parseInt(value) })}
          >
            <RadioButton.Item label="58mm" value="58" />
            <RadioButton.Item label="80mm" value="80" />
          </RadioButton.Group>
          
          <View style={styles.modalActions}>
            <Button mode="text" onPress={() => setConfigModalVisible(false)}>
              Annuler
            </Button>
            <Button mode="contained" onPress={savePrinterConfig}>
              Ajouter
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
  networkInfo: {
    padding: 16,
    backgroundColor: 'white',
    elevation: 2,
  },
  networkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  networkText: {
    fontSize: 14,
    flex: 1,
  },
  subnetText: {
    fontSize: 12,
    opacity: 0.7,
    marginTop: 4,
    marginLeft: 28,
  },
  scanActions: {
    flexDirection: 'row',
    padding: 16,
    gap: 8,
    backgroundColor: 'white',
    elevation: 1,
  },
  scanButton: {
    flex: 1,
  },
  progressContainer: {
    padding: 16,
    backgroundColor: 'white',
    elevation: 1,
  },
  progressText: {
    fontSize: 14,
    textAlign: 'center',
    marginVertical: 8,
  },
  list: {
    padding: 16,
  },
  printerCard: {
    marginBottom: 12,
  },
  printerHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  printerInfo: {
    flex: 1,
    marginLeft: 12,
  },
  printerIp: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  printerDetails: {
    fontSize: 14,
    opacity: 0.7,
    marginTop: 2,
  },
  printerHostname: {
    fontSize: 12,
    opacity: 0.5,
    marginTop: 2,
  },
  printerStatus: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  statusChip: {
    height: 24,
  },
  addButton: {
    marginTop: 8,
  },
  emptyContainer: {
    alignItems: 'center',
    paddingTop: 64,
  },
  emptyText: {
    fontSize: 18,
    marginTop: 16,
    fontWeight: '500',
  },
  emptySubtext: {
    fontSize: 14,
    marginTop: 8,
    opacity: 0.7,
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
});

export default PrinterDiscoveryScreen;