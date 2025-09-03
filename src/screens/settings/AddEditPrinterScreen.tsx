// src/screens/settings/AddEditPrinterScreen.tsx
import React, { useState, useEffect } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  Alert,
} from 'react-native';
import {
  Appbar,
  Text,
  Surface,
  TextInput,
  Button,
  Switch,
  HelperText,
  ActivityIndicator,
  useTheme,
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { StackNavigationProp } from '@react-navigation/stack';
import { RouteProp } from '@react-navigation/native';
import { useAuth } from '../../contexts/AuthContext';
import printerService, { PrinterConfig } from '../../services/PrinterService';
import { ThermalPrinterService } from '../../services/ThermalPrinterService';
import NativePrinterService from '../../services/NativePrinterService';

type AddEditPrinterScreenNavigationProp = StackNavigationProp<any, 'AddEditPrinter'>;
type AddEditPrinterScreenRouteProp = RouteProp<{ AddEditPrinter: { printerId?: string } }, 'AddEditPrinter'>;

interface AddEditPrinterScreenProps {
  navigation: AddEditPrinterScreenNavigationProp;
  route: AddEditPrinterScreenRouteProp;
}

export const AddEditPrinterScreen: React.FC<AddEditPrinterScreenProps> = ({ 
  navigation, 
  route 
}) => {
  const { user } = useAuth();
  const theme = useTheme();
  const printerId = route.params?.printerId;
  const isEditing = !!printerId;

  // États du formulaire
  const [formData, setFormData] = useState({
    name: '',
    ip: '',
    port: '9100',
    isDefault: false,
    isActive: true,
  });
  const [formErrors, setFormErrors] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState(false);
  const [isLoading, setIsLoading] = useState(false);

  // Charger les données de l'imprimante si on est en mode édition
  useEffect(() => {
    if (isEditing && printerId) {
      setIsLoading(true);
      const printer = printerService.getPrinter(printerId);
      if (printer) {
        setFormData({
          name: printer.name,
          ip: printer.connection.ip,
          port: printer.connection.port.toString(),
          isDefault: printer.isDefault,
          isActive: printer.isActive,
        });
      }
      setIsLoading(false);
    } else {
      // Mode ajout - vérifier s'il faut définir comme défaut
      const loadDefaultStatus = async () => {
        if (user?.tenantCode) {
          await printerService.loadPrinters(user.tenantCode);
          const printers = printerService.getPrinters(user.tenantCode);
          setFormData(prev => ({ ...prev, isDefault: printers.length === 0 }));
        }
      };
      loadDefaultStatus();
    }
  }, [isEditing, printerId, user?.tenantCode]);

  // Gérer la saisie de l'IP avec filtrage et remplacement virgule -> point
  const handleIPChange = (text: string) => {
    // Remplacer les virgules par des points (problème de localisation)
    let cleanText = text.replace(/,/g, '.');
    
    // Filtrer pour ne garder que les chiffres et les points
    cleanText = cleanText.replace(/[^0-9.]/g, '');
    
    // Éviter les points multiples consécutifs
    cleanText = cleanText.replace(/\.{2,}/g, '.');
    
    // Éviter plus de 3 points (une IP a maximum 3 points)
    const pointCount = (cleanText.match(/\./g) || []).length;
    if (pointCount > 3) {
      return;
    }
    
    // Éviter que ça commence par un point
    if (cleanText.startsWith('.')) {
      cleanText = cleanText.substring(1);
    }
    
    // Limiter la longueur (une IP fait maximum 15 caractères)
    if (cleanText.length > 15) {
      return;
    }
    
    setFormData({ ...formData, ip: cleanText });
  };

  // Validation du formulaire
  const validateForm = (): boolean => {
    const errors: Record<string, string> = {};

    if (!formData.name.trim()) {
      errors.name = 'Le nom est requis';
    }

    if (!formData.ip.trim()) {
      errors.ip = 'L\'adresse IP est requise';
    } else {
      const ip = formData.ip.trim();
      const ipRegex = /^(\d{1,3}\.){3}\d{1,3}$/;
      
      if (!ipRegex.test(ip)) {
        errors.ip = 'Format d\'IP invalide (ex: 192.168.1.100)';
      } else {
        // Vérifier que chaque segment est entre 0 et 255
        const segments = ip.split('.');
        const invalidSegment = segments.find(segment => {
          const num = parseInt(segment, 10);
          return isNaN(num) || num < 0 || num > 255;
        });
        
        if (invalidSegment) {
          errors.ip = 'Chaque segment doit être entre 0 et 255';
        }
      }
    }

    if (!formData.port.trim()) {
      errors.port = 'Le port est requis';
    } else {
      const port = parseInt(formData.port, 10);
      if (isNaN(port) || port < 1 || port > 65535) {
        errors.port = 'Le port doit être entre 1 et 65535';
      }
    }

    // Vérifier l'unicité du nom
    if (user?.tenantCode) {
      const existingPrinters = printerService.getPrinters(user.tenantCode);
      const existingNames = existingPrinters
        .filter(p => isEditing ? p.id !== printerId : true)
        .map(p => p.name.toLowerCase());
      
      if (existingNames.includes(formData.name.toLowerCase())) {
        errors.name = 'Ce nom existe déjà';
      }
    }

    setFormErrors(errors);
    return Object.keys(errors).length === 0;
  };

  // Sauvegarder l'imprimante
  const handleSave = async () => {
    if (!validateForm() || !user?.tenantCode) {
      return;
    }

    setIsSaving(true);
    try {
      const config = {
        name: formData.name.trim(),
        tenantCode: user.tenantCode,
        connection: {
          ip: formData.ip.trim(),
          port: parseInt(formData.port, 10),
        },
        isDefault: formData.isDefault,
        isActive: formData.isActive,
      };

      if (isEditing && printerId) {
        await printerService.updatePrinter(printerId, config);
        Alert.alert('Succès', 'Imprimante modifiée avec succès', [
          { text: 'OK', onPress: () => navigation.goBack() }
        ]);
      } else {
        await printerService.addPrinter(config);
        Alert.alert('Succès', 'Imprimante ajoutée avec succès', [
          { text: 'OK', onPress: () => navigation.goBack() }
        ]);
      }
    } catch (error) {
      console.error('Error saving printer:', error);
      Alert.alert('Erreur', 'Impossible de sauvegarder l\'imprimante');
    } finally {
      setIsSaving(false);
    }
  };

  // Test de connexion
  const handleTestConnection = async () => {
    if (!formData.ip.trim() || !formData.port.trim()) {
      Alert.alert('Erreur', 'Veuillez remplir l\'adresse IP et le port');
      return;
    }

    // Valider les données avant le test
    const ip = formData.ip.trim();
    const port = parseInt(formData.port, 10);
    
    if (isNaN(port) || port < 1 || port > 65535) {
      Alert.alert('Erreur', 'Le port doit être un nombre entre 1 et 65535');
      return;
    }

    try {
      console.log(`Testing connection to ${ip}:${port}`);
      
      // Utiliser notre service amélioré
      const isConnected = await ThermalPrinterService.testConnection(ip, port);
      
      Alert.alert(
        isConnected ? 'Connexion détectée !' : 'Connexion échouée',
        isConnected 
          ? `✅ Un périphérique répond à l'adresse ${ip}:${port}\n\n💡 Note : Le test évite d'envoyer des données pour ne pas déclencher d'impression parasite.\n\nVous pouvez sauvegarder cette configuration.`
          : `❌ Aucun périphérique ne répond à ${ip}:${port}\n\nVérifiez :\n• L'adresse IP\n• Le port (généralement 9100)\n• La connexion réseau`
      );
    } catch (error) {
      console.error('Test connection error:', error);
      Alert.alert('Erreur', `Erreur lors du test de connexion: ${error instanceof Error ? error.message : 'Erreur inconnue'}`);
    }
  };

  // Test d'impression complet (avec native si disponible)
  const handleTestPrint = async () => {
    if (!formData.ip.trim() || !formData.port.trim()) {
      Alert.alert('Erreur', 'Veuillez remplir l\'adresse IP et le port');
      return;
    }

    const ip = formData.ip.trim();
    const port = parseInt(formData.port, 10);
    
    if (isNaN(port) || port < 1 || port > 65535) {
      Alert.alert('Erreur', 'Le port doit être un nombre entre 1 et 65535');
      return;
    }

    try {
      console.log(`Testing print to ${ip}:${port}`);
      
      // Vérifier si le module natif est disponible
      if (NativePrinterService.isNativeModuleAvailable()) {
        console.log('Module natif disponible - Utilisation de l\'impression native');
        const isSuccess = await NativePrinterService.printTestTicket(
          formData.name,
          ip,
          port
        );
        
        if (isSuccess) {
          Alert.alert(
            '✅ Impression Native Réussie !',
            `Le ticket de test a été envoyé à l'imprimante ${ip}:${port}\n\n` +
            `Vérifiez votre imprimante !`
          );
        }
        return;
      }
      
      // Fallback sur l'ancienne méthode si pas de module natif
      console.log('Module natif non disponible - Mode simulation');
      
      // D'abord tester la connexion
      const isConnected = await ThermalPrinterService.testConnection(ip, port);
      
      if (!isConnected) {
        Alert.alert(
          'Test d\'impression impossible',
          'L\'imprimante n\'est pas accessible. Testez d\'abord la connexion.'
        );
        return;
      }
      
      // Simuler l'envoi d'un ticket de test
      const isSuccess = await ThermalPrinterService.testPrint(ip, port);
      
      Alert.alert(
        isSuccess ? 'Test d\'impression tenté' : 'Test d\'impression échoué',
        isSuccess 
          ? `✅ Données envoyées à l'imprimante ${ip}:${port}\n\n🔍 VÉRIFIEZ L'IMPRIMANTE maintenant !\n\n💡 Important : Même si l'app montre "succès", les restrictions CORS/HTTPS du navigateur peuvent empêcher la confirmation du résultat. L'impression peut avoir réussi même sans notification.\n\n⚠️ Si rien ne s'imprime, essayez d'accéder à http://${ip} dans votre navigateur pour configurer l'imprimante.`
          : `❌ Échec d'envoi à ${ip}:${port}\n\nCauses possibles :\n• Restrictions CORS/HTTPS du navigateur\n• Imprimante non compatible HTTP\n• Problème réseau\n\n💡 Astuce : Ouvrez http://${ip} dans un navigateur pour accéder à l'interface de l'imprimante.`
      );
    } catch (error) {
      console.error('Test print error:', error);
      Alert.alert('Erreur', `Erreur lors du test d'impression: ${error instanceof Error ? error.message : 'Erreur inconnue'}`);
    }
  };

  if (isLoading) {
    return (
      <SafeAreaView style={styles.container}>
        <Appbar.Header>
          <Appbar.BackAction onPress={() => navigation.goBack()} />
          <Appbar.Content title={isEditing ? 'Modifier imprimante' : 'Ajouter imprimante'} />
        </Appbar.Header>
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Chargement...</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={styles.container}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => navigation.goBack()} />
        <Appbar.Content title={isEditing ? 'Modifier imprimante' : 'Ajouter imprimante'} />
        <Appbar.Action 
          icon="connection" 
          onPress={handleTestConnection}
          disabled={!formData.ip.trim() || !formData.port.trim()}
        />
        <Appbar.Action 
          icon="printer" 
          onPress={handleTestPrint}
          disabled={!formData.ip.trim() || !formData.port.trim()}
        />
      </Appbar.Header>

      <KeyboardAvoidingView 
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'} 
        style={styles.keyboardView}
      >
        <ScrollView style={styles.scrollView} showsVerticalScrollIndicator={false}>
          <View style={styles.content}>
            <Surface style={styles.formCard}>
              <Text variant="titleLarge" style={styles.cardTitle}>
                Informations de l'imprimante
              </Text>

              <TextInput
                mode="outlined"
                label="Nom de l'imprimante"
                value={formData.name}
                onChangeText={(text) => setFormData({ ...formData, name: text })}
                error={!!formErrors.name}
                style={styles.input}
                placeholder="Ex: Imprimante Cuisine"
              />
              <HelperText type="error" visible={!!formErrors.name}>
                {formErrors.name}
              </HelperText>

              <TextInput
                mode="outlined"
                label="Adresse IP"
                value={formData.ip}
                onChangeText={handleIPChange}
                placeholder="192.168.1.100"
                error={!!formErrors.ip}
                style={styles.input}
              />
              <HelperText type="error" visible={!!formErrors.ip}>
                {formErrors.ip}
              </HelperText>

              <TextInput
                mode="outlined"
                label="Port"
                value={formData.port}
                onChangeText={(text) => setFormData({ ...formData, port: text })}
                keyboardType="numeric"
                error={!!formErrors.port}
                style={styles.input}
                placeholder="9100"
              />
              <HelperText type="error" visible={!!formErrors.port}>
                {formErrors.port}
              </HelperText>
            </Surface>

            <Surface style={styles.configCard}>
              <Text variant="titleLarge" style={styles.cardTitle}>
                Configuration
              </Text>

              <View style={styles.switchContainer}>
                <View style={styles.switchRow}>
                  <View style={styles.switchInfo}>
                    <Text variant="bodyLarge">Imprimante par défaut</Text>
                    <Text variant="bodySmall" style={styles.switchDescription}>
                      Cette imprimante sera utilisée automatiquement
                    </Text>
                  </View>
                  <Switch
                    value={formData.isDefault}
                    onValueChange={(value) => setFormData({ ...formData, isDefault: value })}
                  />
                </View>
              </View>

              <View style={styles.switchContainer}>
                <View style={styles.switchRow}>
                  <View style={styles.switchInfo}>
                    <Text variant="bodyLarge">Imprimante active</Text>
                    <Text variant="bodySmall" style={styles.switchDescription}>
                      Désactiver pour empêcher l'utilisation sans supprimer
                    </Text>
                  </View>
                  <Switch
                    value={formData.isActive}
                    onValueChange={(value) => setFormData({ ...formData, isActive: value })}
                  />
                </View>
              </View>
            </Surface>
          </View>
        </ScrollView>

        <View style={styles.actions}>
          <Button
            mode="outlined"
            onPress={() => navigation.goBack()}
            disabled={isSaving}
            style={styles.button}
          >
            Annuler
          </Button>
          <Button
            mode="contained"
            onPress={handleSave}
            loading={isSaving}
            disabled={isSaving}
            style={styles.button}
          >
            {isEditing ? 'Modifier' : 'Ajouter'}
          </Button>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  keyboardView: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  content: {
    padding: 16,
    paddingBottom: 100, // Space for actions
  },
  formCard: {
    padding: 24,
    borderRadius: 12,
    marginBottom: 16,
  },
  configCard: {
    padding: 24,
    borderRadius: 12,
    marginBottom: 16,
  },
  cardTitle: {
    marginBottom: 20,
    fontWeight: 'bold',
  },
  input: {
    marginBottom: 4,
  },
  switchContainer: {
    marginBottom: 20,
  },
  switchRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  switchInfo: {
    flex: 1,
    marginRight: 16,
  },
  switchDescription: {
    marginTop: 4,
    opacity: 0.7,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: 'white',
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
    gap: 12,
  },
  button: {
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
});

export default AddEditPrinterScreen;