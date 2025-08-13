// src/components/printer/PrinterAddModal.tsx

import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert
} from 'react-native';
import {
  Modal,
  Portal,
  Surface,
  Text,
  TextInput,
  Button,
  Divider,
  RadioButton,
  Checkbox,
  HelperText,
  useTheme,
  ActivityIndicator,
  IconButton,
  Chip
} from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import {
  PrinterConfig,
  PrinterConnectionType,
  PrinterProtocol,
  PrinterBrand,
  PaperWidth,
  PrintDestination,
  PrintPriority,
  DEFAULT_PRINTER_SETTINGS
} from '../../types/printer.types';

interface PrinterAddModalProps {
  visible: boolean;
  onDismiss: () => void;
  onAdd: (config: PrinterConfig) => void;
  initialConfig?: Partial<PrinterConfig>;
}

export const PrinterAddModal: React.FC<PrinterAddModalProps> = ({
  visible,
  onDismiss,
  onAdd,
  initialConfig
}) => {
  const theme = useTheme();

  // États du formulaire
  const [name, setName] = useState(initialConfig?.name || '');
  const [description, setDescription] = useState(initialConfig?.description || '');
  const [connectionType] = useState<PrinterConnectionType>('TCP'); // TCP pour le WiFi
  const [protocol, setProtocol] = useState<PrinterProtocol>(
    initialConfig?.protocol || 'ESC_POS'
  );
  const [brand, setBrand] = useState<PrinterBrand>(
    initialConfig?.brand || 'MUNBYN'
  );

  // Paramètres de connexion
  const [ipAddress, setIpAddress] = useState(
    initialConfig?.connectionParams?.ip || ''
  );
  const [port, setPort] = useState(
    initialConfig?.connectionParams?.port?.toString() || '9100'
  );

  // Paramètres d'impression
  const [paperWidth, setPaperWidth] = useState<PaperWidth>(
    initialConfig?.printSettings?.paperWidth || 80
  );

  // Destinations
  const [destinations, setDestinations] = useState<{
    [key in PrintDestination]: {
      enabled: boolean;
      autoPrint: boolean;
      copies: number;
    };
  }>({
    [PrintDestination.KITCHEN]: { enabled: false, autoPrint: false, copies: 1 },
    [PrintDestination.BAR]: { enabled: false, autoPrint: false, copies: 1 },
    [PrintDestination.CASHIER]: { enabled: false, autoPrint: false, copies: 1 },
    [PrintDestination.CUSTOMER]: { enabled: false, autoPrint: false, copies: 1 },
    [PrintDestination.OFFICE]: { enabled: false, autoPrint: false, copies: 1 }
  });

  // États de validation
  const [testing, setTesting] = useState(false);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  // Validation du formulaire
  const validateForm = (): boolean => {
    const newErrors: { [key: string]: string } = {};

    if (!name.trim()) {
      newErrors.name = 'Le nom est requis';
    }

    if (!ipAddress.trim()) {
      newErrors.ipAddress = 'L\'adresse IP est requise';
    } else if (!isValidIP(ipAddress)) {
      newErrors.ipAddress = 'Adresse IP invalide';
    }

    if (!port.trim()) {
      newErrors.port = 'Le port est requis';
    } else if (isNaN(Number(port)) || Number(port) < 1 || Number(port) > 65535) {
      newErrors.port = 'Port invalide (1-65535)';
    }

    // Vérifier qu'au moins une destination est sélectionnée
    const hasDestination = Object.values(destinations).some(d => d.enabled);
    if (!hasDestination) {
      newErrors.destinations = 'Sélectionnez au moins une destination';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Validation de l'adresse IP
  const isValidIP = (ip: string): boolean => {
    const pattern = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    return pattern.test(ip);
  };

  // Test de connexion
  const testConnection = async () => {
    if (!isValidIP(ipAddress) || !port) {
      Alert.alert('Erreur', 'Veuillez entrer une adresse IP et un port valides');
      return;
    }

    setTesting(true);
    
    try {
      // Importer dynamiquement les services nécessaires
      const { PrinterConnection } = await import('../../services/printer/PrinterConnection');
      
      // Créer une connexion temporaire pour le test
      const testConnection = new PrinterConnection();
      
      // Tenter la connexion
      const connected = await testConnection.connect({
        ip: ipAddress.trim(),
        port: Number(port),
        timeout: 5000
      });

      if (connected) {
        // Tester l'imprimante
        const testResult = await testConnection.test();
        
        // Déconnecter
        await testConnection.disconnect();
        
        if (testResult) {
          Alert.alert(
            'Test réussi',
            'La connexion à l\'imprimante a été établie avec succès !',
            [{ text: 'OK' }]
          );
        } else {
          Alert.alert(
            'Test partiel',
            'La connexion a été établie mais l\'imprimante ne répond pas correctement aux commandes de test.',
            [{ text: 'OK' }]
          );
        }
      } else {
        Alert.alert(
          'Échec de connexion',
          'Impossible de se connecter à l\'imprimante. Vérifiez l\'adresse IP et le port.',
          [{ text: 'OK' }]
        );
      }
    } catch (error: any) {
      Alert.alert(
        'Erreur de connexion',
        error.message || 'Une erreur s\'est produite lors du test de connexion.',
        [{ text: 'OK' }]
      );
    } finally {
      setTesting(false);
    }
  };

  // Sauvegarder la configuration
  const handleSave = () => {
    if (!validateForm()) {
      return;
    }

    // Construire la configuration
    const config: PrinterConfig = {
      id: initialConfig?.id || `printer_${Date.now()}`,
      name: name.trim(),
      description: description.trim(),
      connectionType,
      protocol,
      brand,
      connectionParams: {
        ip: ipAddress.trim(),
        port: Number(port),
        timeout: DEFAULT_PRINTER_SETTINGS.timeout
      },
      printSettings: {
        paperWidth,
        charset: DEFAULT_PRINTER_SETTINGS.charset,
        codepage: DEFAULT_PRINTER_SETTINGS.codepage,
        density: DEFAULT_PRINTER_SETTINGS.density,
        feedLines: DEFAULT_PRINTER_SETTINGS.feedLines
      },
      destinations: Object.entries(destinations)
        .filter(([_, config]) => config.enabled)
        .map(([dest, config]) => ({
          destination: dest as PrintDestination,
          enabled: config.enabled,
          autoPrint: config.autoPrint,
          copies: config.copies,
          priority: config.autoPrint ? PrintPriority.HIGH : PrintPriority.NORMAL
        })),
      isDefault: false,
      isActive: true,
      createdAt: initialConfig?.createdAt || new Date(),
      updatedAt: new Date()
    };

    onAdd(config);
  };

  // Mettre à jour une destination
  const updateDestination = (
    dest: PrintDestination,
    field: 'enabled' | 'autoPrint' | 'copies',
    value: boolean | number
  ) => {
    setDestinations(prev => ({
      ...prev,
      [dest]: {
        ...prev[dest],
        [field]: value
      }
    }));
  };

  // Obtenir le label d'une destination
  const getDestinationLabel = (dest: PrintDestination): string => {
    const labels = {
      [PrintDestination.KITCHEN]: 'Cuisine',
      [PrintDestination.BAR]: 'Bar',
      [PrintDestination.CASHIER]: 'Caisse',
      [PrintDestination.CUSTOMER]: 'Client',
      [PrintDestination.OFFICE]: 'Bureau'
    };
    return labels[dest];
  };

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={onDismiss}
        contentContainerStyle={styles.modal}
        style={styles.modalContainer}
      >
        <KeyboardAvoidingView
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
          style={styles.keyboardAvoid}
        >
          <Surface style={styles.surface}>
            {/* Header */}
            <View style={styles.header}>
              <Text style={styles.title}>
                {initialConfig ? 'Modifier l\'imprimante' : 'Ajouter une imprimante'}
              </Text>
              <IconButton
                icon="close"
                size={24}
                onPress={onDismiss}
              />
            </View>

            <Divider />

            <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
              <View style={styles.content}>
                {/* Informations de base */}
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Informations générales</Text>
                  
                  <TextInput
                    label="Nom de l'imprimante *"
                    value={name}
                    onChangeText={setName}
                    mode="outlined"
                    error={!!errors.name}
                    style={styles.input}
                  />
                  {errors.name && (
                    <HelperText type="error" visible={true}>
                      {errors.name}
                    </HelperText>
                  )}

                  <TextInput
                    label="Description (optionnel)"
                    value={description}
                    onChangeText={setDescription}
                    mode="outlined"
                    style={styles.input}
                    multiline
                    numberOfLines={2}
                  />
                </View>

                {/* Paramètres de connexion */}
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Connexion réseau</Text>
                  
                  <View style={styles.connectionInfo}>
                    <Icon name="wifi" size={20} color={theme.colors.primary} />
                    <Text style={styles.connectionText}>Connexion WiFi (TCP/IP)</Text>
                  </View>

                  <TextInput
                    label="Adresse IP *"
                    value={ipAddress}
                    onChangeText={setIpAddress}
                    mode="outlined"
                    error={!!errors.ipAddress}
                    style={styles.input}
                    keyboardType="numeric"
                    placeholder="192.168.1.100"
                  />
                  {errors.ipAddress && (
                    <HelperText type="error" visible={true}>
                      {errors.ipAddress}
                    </HelperText>
                  )}

                  <TextInput
                    label="Port *"
                    value={port}
                    onChangeText={setPort}
                    mode="outlined"
                    error={!!errors.port}
                    style={styles.input}
                    keyboardType="numeric"
                    placeholder="9100"
                  />
                  {errors.port && (
                    <HelperText type="error" visible={true}>
                      {errors.port}
                    </HelperText>
                  )}

                  <Button
                    mode="outlined"
                    onPress={testConnection}
                    loading={testing}
                    disabled={testing}
                    icon="test-tube"
                    style={styles.testButton}
                  >
                    Tester la connexion
                  </Button>
                </View>

                {/* Configuration technique */}
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Configuration technique</Text>
                  
                  <Text style={styles.fieldLabel}>Marque</Text>
                  <RadioButton.Group
                    onValueChange={(value) => setBrand(value as PrinterBrand)}
                    value={brand}
                  >
                    <View style={styles.radioRow}>
                      <RadioButton.Item label="MUNBYN" value="MUNBYN" />
                      <RadioButton.Item label="EPSON" value="EPSON" />
                    </View>
                    <View style={styles.radioRow}>
                      <RadioButton.Item label="STAR" value="STAR" />
                      <RadioButton.Item label="Générique" value="GENERIC" />
                    </View>
                  </RadioButton.Group>

                  <Text style={styles.fieldLabel}>Largeur du papier</Text>
                  <RadioButton.Group
                    onValueChange={(value) => setPaperWidth(Number(value) as PaperWidth)}
                    value={paperWidth.toString()}
                  >
                    <View style={styles.radioRow}>
                      <RadioButton.Item label="58mm" value="58" />
                      <RadioButton.Item label="80mm" value="80" />
                    </View>
                  </RadioButton.Group>
                </View>

                {/* Destinations */}
                <View style={styles.section}>
                  <Text style={styles.sectionTitle}>Destinations d'impression</Text>
                  {errors.destinations && (
                    <HelperText type="error" visible={true}>
                      {errors.destinations}
                    </HelperText>
                  )}

                  {Object.entries(destinations).map(([key, config]) => {
                    const dest = key as PrintDestination;
                    return (
                      <Surface key={dest} style={styles.destinationCard}>
                        <View style={styles.destinationHeader}>
                          <Checkbox.Item
                            label={getDestinationLabel(dest)}
                            status={config.enabled ? 'checked' : 'unchecked'}
                            onPress={() => updateDestination(dest, 'enabled', !config.enabled)}
                            style={styles.destinationCheckbox}
                          />
                        </View>
                        
                        {config.enabled && (
                          <View style={styles.destinationOptions}>
                            <Checkbox.Item
                              label="Impression automatique"
                              status={config.autoPrint ? 'checked' : 'unchecked'}
                              onPress={() => updateDestination(dest, 'autoPrint', !config.autoPrint)}
                              style={styles.optionCheckbox}
                            />
                            
                            <View style={styles.copiesContainer}>
                              <Text style={styles.copiesLabel}>Copies:</Text>
                              <View style={styles.copiesButtons}>
                                <IconButton
                                  icon="minus"
                                  size={20}
                                  onPress={() => {
                                    if (config.copies > 1) {
                                      updateDestination(dest, 'copies', config.copies - 1);
                                    }
                                  }}
                                  disabled={config.copies <= 1}
                                />
                                <Text style={styles.copiesValue}>{config.copies}</Text>
                                <IconButton
                                  icon="plus"
                                  size={20}
                                  onPress={() => {
                                    if (config.copies < 5) {
                                      updateDestination(dest, 'copies', config.copies + 1);
                                    }
                                  }}
                                  disabled={config.copies >= 5}
                                />
                              </View>
                            </View>
                          </View>
                        )}
                      </Surface>
                    );
                  })}
                </View>
              </View>
            </ScrollView>

            <Divider />

            {/* Actions */}
            <View style={styles.actions}>
              <Button mode="text" onPress={onDismiss}>
                Annuler
              </Button>
              <Button mode="contained" onPress={handleSave}>
                {initialConfig ? 'Enregistrer' : 'Ajouter'}
              </Button>
            </View>
          </Surface>
        </KeyboardAvoidingView>
      </Modal>
    </Portal>
  );
};

const styles = StyleSheet.create({
  modalContainer: {
    justifyContent: 'center',
  },
  modal: {
    margin: 20,
    maxHeight: '90%',
  },
  keyboardAvoid: {
    flex: 1,
  },
  surface: {
    borderRadius: 12,
    overflow: 'hidden',
    maxHeight: '100%',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  scrollView: {
    maxHeight: 500,
  },
  content: {
    padding: 16,
  },
  section: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
    color: '#666',
  },
  input: {
    marginBottom: 8,
  },
  fieldLabel: {
    fontSize: 14,
    marginBottom: 8,
    marginTop: 8,
    opacity: 0.7,
  },
  radioRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  connectionInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#e3f2fd',
    padding: 12,
    borderRadius: 8,
    marginBottom: 12,
  },
  connectionText: {
    marginLeft: 8,
    fontSize: 14,
  },
  testButton: {
    marginTop: 8,
  },
  destinationCard: {
    marginBottom: 8,
    padding: 8,
    borderRadius: 8,
    elevation: 1,
  },
  destinationHeader: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  destinationCheckbox: {
    paddingLeft: 0,
  },
  destinationOptions: {
    paddingLeft: 16,
  },
  optionCheckbox: {
    paddingLeft: 0,
  },
  copiesContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingLeft: 16,
  },
  copiesLabel: {
    fontSize: 14,
    marginRight: 8,
  },
  copiesButtons: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  copiesValue: {
    fontSize: 16,
    marginHorizontal: 8,
    minWidth: 20,
    textAlign: 'center',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    padding: 16,
    gap: 8,
  },
});