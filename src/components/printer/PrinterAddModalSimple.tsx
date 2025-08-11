// src/components/printer/PrinterAddModalSimple.tsx

import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Alert,
  Dimensions,
  KeyboardAvoidingView,
  Platform
} from 'react-native';
import {
  Portal,
  Dialog,
  Text,
  TextInput,
  Button,
  RadioButton,
  useTheme,
  Divider,
  HelperText
} from 'react-native-paper';
import {
  PrinterConfig,
  PaperWidth,
  PrintDestination,
  PrintPriority,
  DEFAULT_PRINTER_SETTINGS
} from '../../types/printer.types';

interface PrinterAddModalSimpleProps {
  visible: boolean;
  onDismiss: () => void;
  onAdd: (config: PrinterConfig) => void;
}

export const PrinterAddModalSimple: React.FC<PrinterAddModalSimpleProps> = ({
  visible,
  onDismiss,
  onAdd
}) => {
  const theme = useTheme();
  const { height: windowHeight } = Dimensions.get('window');

  // États du formulaire
  const [name, setName] = useState('');
  const [ipAddress, setIpAddress] = useState('');
  const [port, setPort] = useState('9100');
  const [paperWidth, setPaperWidth] = useState<string>('80');
  const [testing, setTesting] = useState(false);
  const [errors, setErrors] = useState<{ [key: string]: string }>({});

  // Validation de l'adresse IP
  const isValidIP = (ip: string): boolean => {
    const pattern = /^(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.(25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    return pattern.test(ip);
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

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  // Test de connexion
  const testConnection = async () => {
    if (!isValidIP(ipAddress) || !port) {
      Alert.alert('Erreur', 'Veuillez entrer une adresse IP et un port valides');
      return;
    }

    setTesting(true);
    
    try {
      // Essayer d'importer et utiliser la vraie connexion
      const { PrinterConnection } = await import('../../services/printer/PrinterConnection');
      const testConn = new PrinterConnection();
      
      const connected = await testConn.connect({
        ip: ipAddress.trim(),
        port: Number(port),
        timeout: 5000
      });

      if (connected) {
        await testConn.test();
        await testConn.disconnect();
        Alert.alert('Succès', 'Connexion établie avec succès !');
      } else {
        Alert.alert('Échec', 'Impossible de se connecter à l\'imprimante');
      }
    } catch (error: any) {
      // Si l'import échoue, faire un test simulé
      setTimeout(() => {
        Alert.alert('Test', 'Test de connexion (mode simulation)');
      }, 1000);
    } finally {
      setTesting(false);
    }
  };

  // Sauvegarder la configuration
  const handleSave = () => {
    if (!validateForm()) {
      return;
    }

    const config: PrinterConfig = {
      id: `printer_${Date.now()}`,
      name: name.trim(),
      description: '',
      connectionType: 'TCP',
      protocol: 'ESC_POS',
      brand: 'MUNBYN',
      connectionParams: {
        ip: ipAddress.trim(),
        port: Number(port),
        timeout: DEFAULT_PRINTER_SETTINGS.timeout
      },
      printSettings: {
        paperWidth: Number(paperWidth) as PaperWidth,
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

    onAdd(config);
    
    // Réinitialiser le formulaire
    setName('');
    setIpAddress('');
    setPort('9100');
    setPaperWidth('80');
    setErrors({});
  };

  return (
    <Portal>
      <Dialog 
        visible={visible} 
        onDismiss={onDismiss}
        style={[styles.dialog, { maxHeight: windowHeight * 0.9 }]}
      >
        <Dialog.Title>Ajouter une imprimante</Dialog.Title>
        
        <Dialog.ScrollArea>
          <ScrollView 
            contentContainerStyle={styles.scrollContent}
            keyboardShouldPersistTaps="handled"
          >
            <View style={styles.content}>
              {/* Nom de l'imprimante */}
              <TextInput
                label="Nom de l'imprimante *"
                value={name}
                onChangeText={setName}
                mode="outlined"
                error={!!errors.name}
                style={styles.input}
                placeholder="Ex: Imprimante Cuisine"
              />
              {errors.name && (
                <HelperText type="error" visible={true}>
                  {errors.name}
                </HelperText>
              )}

              {/* Adresse IP */}
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

              {/* Port */}
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

              {/* Largeur du papier */}
              <Text style={styles.label}>Largeur du papier</Text>
              <RadioButton.Group
                onValueChange={setPaperWidth}
                value={paperWidth}
              >
                <View style={styles.radioRow}>
                  <RadioButton.Item label="58mm" value="58" />
                  <RadioButton.Item label="80mm" value="80" />
                </View>
              </RadioButton.Group>

              {/* Bouton de test */}
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
          </ScrollView>
        </Dialog.ScrollArea>

        <Dialog.Actions>
          <Button onPress={onDismiss}>Annuler</Button>
          <Button mode="contained" onPress={handleSave}>
            Ajouter
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
};

const styles = StyleSheet.create({
  dialog: {
    marginHorizontal: 20,
  },
  scrollContent: {
    paddingBottom: 20,
  },
  content: {
    paddingHorizontal: 20,
  },
  input: {
    marginBottom: 8,
  },
  label: {
    fontSize: 16,
    marginTop: 12,
    marginBottom: 8,
    fontWeight: '500',
  },
  radioRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
    marginBottom: 16,
  },
  testButton: {
    marginTop: 16,
    marginBottom: 8,
  },
});