// src/screens/settings/PrinterEditScreen.tsx

import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Alert,
  KeyboardAvoidingView,
  Platform
} from 'react-native';
import {
  Appbar,
  Surface,
  Text,
  TextInput,
  Button,
  RadioButton,
  Checkbox,
  HelperText,
  IconButton,
  useTheme,
  ActivityIndicator,
  Divider,
  Chip,
  Dialog,
  Portal
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { StackNavigationProp } from '@react-navigation/stack';
import { RouteProp } from '@react-navigation/native';
import { PrinterStorage } from '../../services/printer/PrinterStorage';
import {
  PrinterConfig,
  PrinterBrand,
  PaperWidth,
  PrintDestination,
  PrintPriority,
  DEFAULT_PRINTER_SETTINGS
} from '../../types/printer.types';

type PrinterEditScreenNavigationProp = StackNavigationProp<any, 'PrinterEdit'>;
type PrinterEditScreenRouteProp = RouteProp<{ PrinterEdit: { printerId: string } }, 'PrinterEdit'>;

interface PrinterEditScreenProps {
  navigation: PrinterEditScreenNavigationProp;
  route: PrinterEditScreenRouteProp;
}

export const PrinterEditScreen: React.FC<PrinterEditScreenProps> = ({ 
  navigation, 
  route 
}) => {
  const theme = useTheme();
  const { printerId } = route.params;

  // États du formulaire
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [printer, setPrinter] = useState<PrinterConfig | null>(null);
  
  // Champs éditables
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [ipAddress, setIpAddress] = useState('');
  const [port, setPort] = useState('');
  const [brand, setBrand] = useState<PrinterBrand>('MUNBYN');
  const [paperWidth, setPaperWidth] = useState<PaperWidth>(80);
  const [isActive, setIsActive] = useState(true);
  const [isDefault, setIsDefault] = useState(false);
  
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
  const [errors, setErrors] = useState<{ [key: string]: string }>({});
  const [testing, setTesting] = useState(false);
  const [deleteDialogVisible, setDeleteDialogVisible] = useState(false);

  // Charger les données de l'imprimante
  useEffect(() => {
    loadPrinterData();
  }, [printerId]);

  const loadPrinterData = async () => {
    try {
      const printerData = await PrinterStorage.getPrinter(printerId);
      
      if (!printerData) {
        Alert.alert('Erreur', 'Imprimante introuvable');
        navigation.goBack();
        return;
      }

      setPrinter(printerData);
      
      // Remplir les champs avec les données existantes
      setName(printerData.name);
      setDescription(printerData.description || '');
      setIpAddress(printerData.connectionParams.ip || '');
      setPort(printerData.connectionParams.port?.toString() || '9100');
      setBrand(printerData.brand);
      setPaperWidth(printerData.printSettings.paperWidth);
      setIsActive(printerData.isActive);
      setIsDefault(printerData.isDefault);
      
      // Configurer les destinations
      const newDestinations = { ...destinations };
      printerData.destinations.forEach(dest => {
        newDestinations[dest.destination] = {
          enabled: dest.enabled,
          autoPrint: dest.autoPrint,
          copies: dest.copies
        };
      });
      setDestinations(newDestinations);
      
    } catch (error) {
      console.error('Error loading printer:', error);
      Alert.alert('Erreur', 'Impossible de charger les données de l\'imprimante');
    } finally {
      setLoading(false);
    }
  };

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
      const { PrinterConnection } = await import('../../services/printer/PrinterConnection');
      const testConnection = new PrinterConnection();
      
      const connected = await testConnection.connect({
        ip: ipAddress.trim(),
        port: Number(port),
        timeout: 5000
      });

      if (connected) {
        await testConnection.test();
        await testConnection.disconnect();
        Alert.alert('Succès', 'Connexion établie avec succès !');
      } else {
        Alert.alert('Échec', 'Impossible de se connecter à l\'imprimante');
      }
    } catch (error: any) {
      Alert.alert('Erreur', error.message || 'Erreur lors du test de connexion');
    } finally {
      setTesting(false);
    }
  };

  // Sauvegarder les modifications
  const handleSave = async () => {
    if (!validateForm() || !printer) {
      return;
    }

    setSaving(true);

    try {
      // Construire la configuration mise à jour
      const updatedConfig: PrinterConfig = {
        ...printer,
        name: name.trim(),
        description: description.trim(),
        brand,
        connectionParams: {
          ...printer.connectionParams,
          ip: ipAddress.trim(),
          port: Number(port)
        },
        printSettings: {
          ...printer.printSettings,
          paperWidth
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
        isActive,
        isDefault,
        updatedAt: new Date()
      };

      await PrinterStorage.savePrinter(updatedConfig);
      
      // Si définie comme imprimante par défaut
      if (isDefault && !printer.isDefault) {
        await PrinterStorage.setDefaultPrinter(printerId);
      }

      Alert.alert(
        'Succès',
        'Les modifications ont été enregistrées',
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } catch (error) {
      console.error('Error saving printer:', error);
      Alert.alert('Erreur', 'Impossible d\'enregistrer les modifications');
    } finally {
      setSaving(false);
    }
  };

  // Supprimer l'imprimante
  const handleDelete = async () => {
    setDeleteDialogVisible(false);
    
    try {
      await PrinterStorage.deletePrinter(printerId);
      Alert.alert(
        'Succès',
        'L\'imprimante a été supprimée',
        [{ text: 'OK', onPress: () => navigation.goBack() }]
      );
    } catch (error) {
      console.error('Error deleting printer:', error);
      Alert.alert('Erreur', 'Impossible de supprimer l\'imprimante');
    }
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

  if (loading) {
    return (
      <SafeAreaView style={styles.container}>
        <Appbar.Header>
          <Appbar.BackAction onPress={() => navigation.goBack()} />
          <Appbar.Content title="Modifier l'imprimante" />
        </Appbar.Header>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => navigation.goBack()} />
        <Appbar.Content title="Modifier l'imprimante" />
        <Appbar.Action 
          icon="delete" 
          onPress={() => setDeleteDialogVisible(true)}
          color={theme.colors.error}
        />
      </Appbar.Header>

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={styles.keyboardAvoid}
      >
        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          <View style={styles.content}>
            {/* Informations générales */}
            <Surface style={styles.section}>
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
                label="Description"
                value={description}
                onChangeText={setDescription}
                mode="outlined"
                style={styles.input}
                multiline
                numberOfLines={2}
              />

              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>Imprimante active</Text>
                <Checkbox
                  status={isActive ? 'checked' : 'unchecked'}
                  onPress={() => setIsActive(!isActive)}
                />
              </View>

              <View style={styles.switchRow}>
                <Text style={styles.switchLabel}>Imprimante par défaut</Text>
                <Checkbox
                  status={isDefault ? 'checked' : 'unchecked'}
                  onPress={() => setIsDefault(!isDefault)}
                />
              </View>
            </Surface>

            {/* Connexion réseau */}
            <Surface style={styles.section}>
              <Text style={styles.sectionTitle}>Connexion réseau</Text>
              
              <TextInput
                label="Adresse IP *"
                value={ipAddress}
                onChangeText={setIpAddress}
                mode="outlined"
                error={!!errors.ipAddress}
                style={styles.input}
                keyboardType="numeric"
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
            </Surface>

            {/* Configuration technique */}
            <Surface style={styles.section}>
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
            </Surface>

            {/* Destinations */}
            <Surface style={styles.section}>
              <Text style={styles.sectionTitle}>Destinations d'impression</Text>
              {errors.destinations && (
                <HelperText type="error" visible={true}>
                  {errors.destinations}
                </HelperText>
              )}

              {Object.entries(destinations).map(([key, config]) => {
                const dest = key as PrintDestination;
                return (
                  <View key={dest} style={styles.destinationItem}>
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
                        <View style={styles.optionRow}>
                          <Text style={styles.optionLabel}>Impression auto:</Text>
                          <Checkbox
                            status={config.autoPrint ? 'checked' : 'unchecked'}
                            onPress={() => updateDestination(dest, 'autoPrint', !config.autoPrint)}
                          />
                        </View>
                        
                        <View style={styles.optionRow}>
                          <Text style={styles.optionLabel}>Copies:</Text>
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
                  </View>
                );
              })}
            </Surface>
          </View>
        </ScrollView>

        {/* Actions */}
        <Surface style={styles.actions}>
          <Button mode="text" onPress={() => navigation.goBack()}>
            Annuler
          </Button>
          <Button 
            mode="contained" 
            onPress={handleSave}
            loading={saving}
            disabled={saving}
          >
            Enregistrer
          </Button>
        </Surface>
      </KeyboardAvoidingView>

      {/* Dialog de confirmation de suppression */}
      <Portal>
        <Dialog 
          visible={deleteDialogVisible} 
          onDismiss={() => setDeleteDialogVisible(false)}
        >
          <Dialog.Title>Confirmer la suppression</Dialog.Title>
          <Dialog.Content>
            <Text>
              Êtes-vous sûr de vouloir supprimer l'imprimante "{name}" ?
              Cette action est irréversible.
            </Text>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setDeleteDialogVisible(false)}>
              Annuler
            </Button>
            <Button 
              onPress={handleDelete}
              textColor={theme.colors.error}
            >
              Supprimer
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  keyboardAvoid: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    padding: 16,
    paddingBottom: 100,
  },
  section: {
    padding: 16,
    marginBottom: 16,
    borderRadius: 8,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 16,
    color: '#333',
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
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
  },
  switchLabel: {
    fontSize: 16,
  },
  testButton: {
    marginTop: 8,
  },
  destinationItem: {
    marginBottom: 12,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
    paddingBottom: 8,
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
  optionRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingVertical: 4,
  },
  optionLabel: {
    fontSize: 14,
    opacity: 0.7,
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
    position: 'absolute',
    bottom: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'flex-end',
    padding: 16,
    gap: 8,
    backgroundColor: 'white',
    elevation: 8,
    shadowColor: '#000',
    shadowOffset: { width: 0, height: -2 },
    shadowOpacity: 0.1,
    shadowRadius: 4,
  },
});