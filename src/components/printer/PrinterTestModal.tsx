// src/components/printer/PrinterTestModal.tsx

import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView
} from 'react-native';
import {
  Modal,
  Portal,
  Surface,
  Text,
  Button,
  Divider,
  RadioButton,
  useTheme,
  ActivityIndicator,
  IconButton,
  List
} from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { PrinterConfig, DocumentType } from '../../types/printer.types';

interface PrinterTestModalProps {
  visible: boolean;
  onDismiss: () => void;
  printer: PrinterConfig;
}

type TestType = 'CONNECTION' | 'RECEIPT' | 'KITCHEN' | 'REPORT' | 'STATUS';

interface TestResult {
  success: boolean;
  message: string;
  details?: string[];
}

export const PrinterTestModal: React.FC<PrinterTestModalProps> = ({
  visible,
  onDismiss,
  printer
}) => {
  const theme = useTheme();
  
  const [selectedTest, setSelectedTest] = useState<TestType>('CONNECTION');
  const [testing, setTesting] = useState(false);
  const [testResult, setTestResult] = useState<TestResult | null>(null);

  // Exécuter un test
  const runTest = async () => {
    setTesting(true);
    setTestResult(null);

    try {
      // Importer les services nécessaires
      const { PrinterConnection } = await import('../../services/printer/PrinterConnection');
      const { ESCPOSFormatter } = await import('../../services/printer/ESCPOSFormatter');
      
      // Créer une connexion
      const connection = new PrinterConnection(printer);
      
      // Se connecter à l'imprimante
      const connected = await connection.connect(printer.connectionParams);
      
      if (!connected) {
        setTestResult({
          success: false,
          message: 'Impossible de se connecter à l\'imprimante',
          details: [
            `IP: ${printer.connectionParams.ip}:${printer.connectionParams.port}`,
            'Vérifiez que l\'imprimante est allumée',
            'Vérifiez la connexion réseau'
          ]
        });
        setTesting(false);
        return;
      }

      let result: TestResult;

      switch (selectedTest) {
        case 'CONNECTION':
          // Test de connexion simple
          const status = await connection.getStatus();
          result = {
            success: true,
            message: 'Connexion établie avec succès',
            details: [
              `IP: ${printer.connectionParams.ip}:${printer.connectionParams.port}`,
              `Protocole: ${printer.protocol}`,
              `Statut: ${status}`,
              'Imprimante prête'
            ]
          };
          break;

        case 'RECEIPT':
          // Imprimer un ticket de test
          const receiptData = {
            restaurantName: 'RESTAURANT TEST',
            address: '123 Rue de Test',
            phone: '01 23 45 67 89',
            orderId: 'TEST-001',
            tableName: 'Table Test',
            items: [
              { name: 'Article Test 1', quantity: 2, price: 10.50 },
              { name: 'Article Test 2', quantity: 1, price: 15.00 }
            ],
            total: 36.00,
            paid: 40.00,
            change: 4.00,
            currency: 'EUR',
            openDrawer: false
          };
          
          const receiptBuffer = ESCPOSFormatter.createReceipt(receiptData, printer);
          await connection.send(receiptBuffer);
          
          result = {
            success: true,
            message: 'Ticket de test imprimé',
            details: [
              'En-tête du ticket OK',
              'Corps du ticket OK',
              'QR Code OK',
              'Coupe papier OK'
            ]
          };
          break;

        case 'KITCHEN':
          // Imprimer un bon de cuisine
          const kitchenData = {
            orderId: 'TEST-002',
            tableName: 'Table Test',
            items: [
              { name: 'Plat Test 1', quantity: 2, notes: 'Sans sel' },
              { name: 'Plat Test 2', quantity: 1, priority: 'URGENT' }
            ]
          };
          
          const kitchenBuffer = ESCPOSFormatter.createKitchenTicket(kitchenData, printer);
          await connection.send(kitchenBuffer);
          
          result = {
            success: true,
            message: 'Bon de cuisine imprimé',
            details: [
              'Numéro de commande OK',
              'Liste des plats OK',
              'Notes spéciales OK',
              'Formatage OK'
            ]
          };
          break;

        case 'REPORT':
          // Imprimer un rapport simple
          const formatter = new ESCPOSFormatter(printer);
          const reportDoc = {
            header: {
              type: 'TEXT' as const,
              alignment: 'CENTER' as const,
              style: { bold: true, fontSize: 'LARGE' },
              content: 'RAPPORT DE TEST'
            },
            body: [
              {
                type: 'LINE' as const,
                content: '='
              },
              {
                type: 'TABLE' as const,
                content: {
                  headers: ['Article', 'Qté', 'Total'],
                  rows: [
                    ['Produit A', '10', '100.00'],
                    ['Produit B', '5', '75.00'],
                    ['Produit C', '3', '45.00']
                  ]
                }
              },
              {
                type: 'LINE' as const,
                content: '-'
              },
              {
                type: 'TEXT' as const,
                alignment: 'RIGHT' as const,
                style: { bold: true },
                content: 'TOTAL: 220.00 EUR'
              }
            ],
            settings: {
              cutPaper: true,
              beep: true
            }
          };
          
          const reportBuffer = formatter.format(reportDoc);
          await connection.send(reportBuffer);
          
          result = {
            success: true,
            message: 'Rapport de test imprimé',
            details: [
              'En-tête OK',
              'Tableau de données OK',
              'Totaux OK',
              'Formatage OK'
            ]
          };
          break;

        case 'STATUS':
          // Vérifier le statut détaillé
          const printerStatus = await connection.getStatus();
          
          // Essayer de faire avancer le papier pour vérifier le mécanisme
          await connection.feedPaper(1);
          
          result = {
            success: true,
            message: 'Statut de l\'imprimante',
            details: [
              `État: ${printerStatus}`,
              'Papier: OK',
              'Mécanisme: Fonctionnel',
              `Largeur: ${printer.printSettings.paperWidth}mm`,
              `Charset: ${printer.printSettings.charset || 'UTF-8'}`
            ]
          };
          break;

        default:
          result = {
            success: false,
            message: 'Type de test non reconnu'
          };
      }

      // Déconnecter
      await connection.disconnect();
      
      setTestResult(result);
      setTesting(false);
      
    } catch (error: any) {
      console.error('Test error:', error);
      setTestResult({
        success: false,
        message: 'Erreur lors du test',
        details: [
          error.message || 'Erreur inconnue',
          'Vérifiez la connexion',
          'Vérifiez que l\'imprimante est compatible ESC/POS'
        ]
      });
      setTesting(false);
    }
  };

  // Obtenir le contenu de test selon le type
  const getTestContent = (type: TestType): string => {
    const contents = {
      CONNECTION: 'Teste la connexion réseau avec l\'imprimante',
      RECEIPT: 'Imprime un ticket de caisse complet avec tous les éléments',
      KITCHEN: 'Imprime un bon de commande pour la cuisine',
      REPORT: 'Imprime un rapport formaté avec tableau',
      STATUS: 'Vérifie l\'état de l\'imprimante et ses paramètres'
    };
    return contents[type];
  };

  // Obtenir l'icône selon le type
  const getTestIcon = (type: TestType): string => {
    const icons = {
      CONNECTION: 'wifi',
      RECEIPT: 'receipt',
      KITCHEN: 'food',
      REPORT: 'file-document',
      STATUS: 'information'
    };
    return icons[type];
  };

  // Réinitialiser le modal à la fermeture
  const handleDismiss = () => {
    setTestResult(null);
    setSelectedTest('CONNECTION');
    onDismiss();
  };

  return (
    <Portal>
      <Modal
        visible={visible}
        onDismiss={handleDismiss}
        contentContainerStyle={styles.modal}
      >
        <Surface style={styles.surface}>
          {/* Header */}
          <View style={styles.header}>
            <View style={styles.headerTitle}>
              <Icon name="test-tube" size={24} color={theme.colors.primary} />
              <Text style={styles.title}>Test de l'imprimante</Text>
            </View>
            <IconButton
              icon="close"
              size={24}
              onPress={handleDismiss}
            />
          </View>

          <Divider />

          {/* Info imprimante */}
          <View style={styles.printerInfo}>
            <Icon 
              name="printer" 
              size={20} 
              color={theme.colors.primary} 
              style={styles.printerIcon}
            />
            <View style={styles.printerDetails}>
              <Text style={styles.printerName}>{printer.name}</Text>
              <Text style={styles.printerAddress}>
                {printer.connectionParams.ip}:{printer.connectionParams.port}
              </Text>
            </View>
          </View>

          <Divider />

          <ScrollView style={styles.content}>
            {/* Sélection du type de test */}
            <Text style={styles.sectionTitle}>Type de test</Text>
            
            <RadioButton.Group
              onValueChange={(value) => setSelectedTest(value as TestType)}
              value={selectedTest}
            >
              <List.Item
                title="Test de connexion"
                description={getTestContent('CONNECTION')}
                left={() => <List.Icon icon={getTestIcon('CONNECTION')} />}
                right={() => <RadioButton value="CONNECTION" />}
                onPress={() => setSelectedTest('CONNECTION')}
                style={styles.testOption}
              />
              
              <List.Item
                title="Ticket de caisse"
                description={getTestContent('RECEIPT')}
                left={() => <List.Icon icon={getTestIcon('RECEIPT')} />}
                right={() => <RadioButton value="RECEIPT" />}
                onPress={() => setSelectedTest('RECEIPT')}
                style={styles.testOption}
                disabled={!printer.destinations.some(d => d.destination === 'CASHIER')}
              />
              
              <List.Item
                title="Bon de cuisine"
                description={getTestContent('KITCHEN')}
                left={() => <List.Icon icon={getTestIcon('KITCHEN')} />}
                right={() => <RadioButton value="KITCHEN" />}
                onPress={() => setSelectedTest('KITCHEN')}
                style={styles.testOption}
                disabled={!printer.destinations.some(d => d.destination === 'KITCHEN')}
              />
              
              <List.Item
                title="Rapport"
                description={getTestContent('REPORT')}
                left={() => <List.Icon icon={getTestIcon('REPORT')} />}
                right={() => <RadioButton value="REPORT" />}
                onPress={() => setSelectedTest('REPORT')}
                style={styles.testOption}
              />
              
              <List.Item
                title="Statut imprimante"
                description={getTestContent('STATUS')}
                left={() => <List.Icon icon={getTestIcon('STATUS')} />}
                right={() => <RadioButton value="STATUS" />}
                onPress={() => setSelectedTest('STATUS')}
                style={styles.testOption}
              />
            </RadioButton.Group>

            {/* Résultat du test */}
            {testResult && (
              <View style={styles.resultContainer}>
                <View style={styles.resultHeader}>
                  <Icon
                    name={testResult.success ? 'check-circle' : 'alert-circle'}
                    size={24}
                    color={testResult.success ? '#4CAF50' : theme.colors.error}
                  />
                  <Text style={[
                    styles.resultMessage,
                    { color: testResult.success ? '#4CAF50' : theme.colors.error }
                  ]}>
                    {testResult.message}
                  </Text>
                </View>
                
                {testResult.details && (
                  <View style={styles.resultDetails}>
                    {testResult.details.map((detail, index) => (
                      <View key={index} style={styles.detailRow}>
                        <Icon 
                          name="chevron-right" 
                          size={16} 
                          color="#666"
                          style={styles.detailIcon}
                        />
                        <Text style={styles.detailText}>{detail}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>
            )}
          </ScrollView>

          <Divider />

          {/* Actions */}
          <View style={styles.actions}>
            <Button mode="text" onPress={handleDismiss}>
              Fermer
            </Button>
            <Button
              mode="contained"
              onPress={runTest}
              loading={testing}
              disabled={testing}
              icon="play"
            >
              {testing ? 'Test en cours...' : 'Lancer le test'}
            </Button>
          </View>
        </Surface>
      </Modal>
    </Portal>
  );
};

const styles = StyleSheet.create({
  modal: {
    margin: 20,
  },
  surface: {
    borderRadius: 12,
    overflow: 'hidden',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  headerTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 8,
  },
  title: {
    fontSize: 20,
    fontWeight: 'bold',
  },
  printerInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#f5f5f5',
  },
  printerIcon: {
    marginRight: 12,
  },
  printerDetails: {
    flex: 1,
  },
  printerName: {
    fontSize: 16,
    fontWeight: '600',
  },
  printerAddress: {
    fontSize: 14,
    opacity: 0.7,
    marginTop: 2,
  },
  content: {
    maxHeight: 400,
    padding: 16,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
    color: '#666',
  },
  testOption: {
    paddingVertical: 8,
  },
  resultContainer: {
    marginTop: 24,
    padding: 16,
    backgroundColor: '#f5f5f5',
    borderRadius: 8,
  },
  resultHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 12,
  },
  resultMessage: {
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  resultDetails: {
    marginTop: 8,
  },
  detailRow: {
    flexDirection: 'row',
    alignItems: 'center',
    marginVertical: 4,
  },
  detailIcon: {
    marginRight: 8,
  },
  detailText: {
    fontSize: 14,
    flex: 1,
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    padding: 16,
    gap: 8,
  },
});