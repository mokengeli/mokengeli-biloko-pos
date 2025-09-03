// src/screens/settings/PrinterDebugScreen.tsx
import React, { useState, useEffect } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  RefreshControl,
} from 'react-native';
import {
  Appbar,
  Card,
  Text,
  Button,
  Chip,
  Surface,
  useTheme,
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { StackNavigationProp } from '@react-navigation/stack';
import { RouteProp } from '@react-navigation/native';

import { printerDebugLogger, DebugLog } from '../../services/PrinterDebugLogger';
import { NativePrinterService } from '../../services/NativePrinterService';
import { ThermalPrinterService } from '../../services/ThermalPrinterService';

type RootStackParamList = {
  PrinterDebug: undefined;
};

type PrinterDebugScreenNavigationProp = StackNavigationProp<RootStackParamList, 'PrinterDebug'>;
type PrinterDebugScreenRouteProp = RouteProp<RootStackParamList, 'PrinterDebug'>;

interface Props {
  navigation: PrinterDebugScreenNavigationProp;
  route: PrinterDebugScreenRouteProp;
}

export default function PrinterDebugScreen({ navigation }: Props) {
  const theme = useTheme();
  const [logs, setLogs] = useState<DebugLog[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const [autoRefresh, setAutoRefresh] = useState(false); // Désactivé par défaut pour éviter les conflits

  useEffect(() => {
    // Charger les logs existants une seule fois au montage
    setLogs(printerDebugLogger.getLogs());

    // S'abonner aux changements avec callback stable
    const handleLogsUpdate = (updatedLogs: DebugLog[]) => {
      setLogs([...updatedLogs]); // Créer une nouvelle référence pour forcer le re-render
    };

    const unsubscribe = printerDebugLogger.subscribe(handleLogsUpdate);

    return () => {
      unsubscribe();
    };
  }, []); // Aucune dépendance

  useEffect(() => {
    // Auto-refresh optionnel séparé
    if (!autoRefresh) return;

    const interval = setInterval(() => {
      const currentLogs = printerDebugLogger.getLogs();
      setLogs([...currentLogs]); // Nouvelle référence
    }, 3000); // Augmenté à 3 secondes pour réduire la fréquence

    return () => {
      clearInterval(interval);
    };
  }, [autoRefresh]);

  const onRefresh = React.useCallback(() => {
    setRefreshing(true);
    const currentLogs = printerDebugLogger.getLogs();
    setLogs([...currentLogs]); // Nouvelle référence pour éviter les problèmes
    setTimeout(() => setRefreshing(false), 500);
  }, []);

  const clearLogs = () => {
    printerDebugLogger.clearLogs();
    setLogs([]);
  };

  const runTestSuite = async () => {
    printerDebugLogger.info('=== DÉBUT SUITE DE TESTS ===');
    
    // Test module natif
    const nativeAvailable = NativePrinterService.isNativeModuleAvailable();
    printerDebugLogger.moduleStatus(nativeAvailable, 'react-native-esc-pos-printer');
    
    // Test réseau simple
    const testIP = '192.168.1.100';
    const testPort = 9100;
    
    printerDebugLogger.info(`Test de connectivité réseau`, { ip: testIP, port: testPort });
    
    try {
      const startTime = Date.now();
      const networkOk = await ThermalPrinterService.testConnection(testIP, testPort);
      const responseTime = Date.now() - startTime;
      
      printerDebugLogger.networkTest(testIP, testPort, networkOk, responseTime);
    } catch (error) {
      printerDebugLogger.networkTest(testIP, testPort, false);
    }
    
    printerDebugLogger.info('=== FIN SUITE DE TESTS ===');
  };

  const getLogIcon = (level: DebugLog['level']) => {
    switch (level) {
      case 'success': return { name: 'check-circle', color: theme.colors.primary };
      case 'error': return { name: 'alert-circle', color: theme.colors.error };
      case 'warning': return { name: 'alert', color: theme.colors.tertiary };
      default: return { name: 'information', color: theme.colors.onSurface };
    }
  };

  const getLogColor = (level: DebugLog['level']) => {
    switch (level) {
      case 'success': return theme.colors.primaryContainer;
      case 'error': return theme.colors.errorContainer;
      case 'warning': return theme.colors.tertiaryContainer;
      default: return theme.colors.surfaceVariant;
    }
  };

  const formatTime = (timestamp: Date) => {
    return timestamp.toLocaleTimeString('fr-FR', {
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      fractionalSecondDigits: 3
    });
  };

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => navigation.goBack()} />
        <Appbar.Content title="Debug Impression" />
        <Appbar.Action 
          icon={autoRefresh ? "pause" : "play"} 
          onPress={() => setAutoRefresh(!autoRefresh)}
        />
        <Appbar.Action icon="delete" onPress={clearLogs} />
      </Appbar.Header>

      {/* Status Bar */}
      <Surface style={styles.statusBar}>
        <View style={styles.statusRow}>
          <Chip 
            icon={NativePrinterService.isNativeModuleAvailable() ? "check" : "close"}
            mode="outlined"
            textStyle={{ fontSize: 12 }}
          >
            Module Natif
          </Chip>
          <Chip 
            icon={autoRefresh ? "refresh" : "pause"}
            mode={autoRefresh ? "flat" : "outlined"}
            textStyle={{ fontSize: 12 }}
            onPress={() => setAutoRefresh(!autoRefresh)}
          >
            Auto-Refresh
          </Chip>
          <Text variant="bodySmall" style={styles.logCount}>
            {logs.length} logs
          </Text>
        </View>
      </Surface>

      {/* Actions */}
      <Surface style={styles.actionsBar}>
        <View style={styles.actionsRow}>
          <Button 
            mode="contained" 
            onPress={runTestSuite}
            style={styles.actionButton}
            icon="test-tube"
          >
            Test Suite
          </Button>
          <Button 
            mode="outlined" 
            onPress={onRefresh}
            style={styles.actionButton}
            icon="refresh"
          >
            Actualiser
          </Button>
        </View>
      </Surface>

      {/* Logs List */}
      <ScrollView
        style={styles.scrollView}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
      >
        {logs.length === 0 ? (
          <Card style={styles.emptyCard}>
            <Card.Content style={styles.emptyContent}>
              <Icon name="console" size={48} color={theme.colors.onSurfaceVariant} />
              <Text variant="headlineSmall" style={styles.emptyTitle}>
                Aucun log
              </Text>
              <Text variant="bodyMedium" style={styles.emptySubtitle}>
                Les logs d'impression apparaîtront ici
              </Text>
              <Button 
                mode="contained" 
                onPress={runTestSuite}
                style={styles.emptyButton}
              >
                Lancer un test
              </Button>
            </Card.Content>
          </Card>
        ) : (
          logs.map((log) => {
            const icon = getLogIcon(log.level);
            const bgColor = getLogColor(log.level);
            
            return (
              <Card 
                key={log.id} 
                style={[styles.logCard, { backgroundColor: bgColor }]}
              >
                <Card.Content style={styles.logContent}>
                  <View style={styles.logHeader}>
                    <View style={styles.logHeaderLeft}>
                      <Icon 
                        name={icon.name} 
                        size={20} 
                        color={icon.color}
                        style={styles.logIcon}
                      />
                      <Text variant="labelMedium" style={styles.logTime}>
                        {formatTime(log.timestamp)}
                      </Text>
                    </View>
                    <Chip 
                      mode="flat" 
                      textStyle={{ fontSize: 10 }}
                      style={styles.logLevelChip}
                    >
                      {log.level.toUpperCase()}
                    </Chip>
                  </View>
                  
                  <Text variant="bodyMedium" style={styles.logMessage}>
                    {log.message}
                  </Text>
                  
                  {log.details && (
                    <Surface style={styles.logDetails}>
                      <Text variant="bodySmall" style={styles.logDetailsText}>
                        {typeof log.details === 'string' 
                          ? log.details 
                          : JSON.stringify(log.details, null, 2)
                        }
                      </Text>
                    </Surface>
                  )}
                </Card.Content>
              </Card>
            );
          })
        )}
        
        <View style={styles.bottomPadding} />
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  statusBar: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    elevation: 2,
  },
  statusRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  logCount: {
    fontWeight: 'bold',
  },
  actionsBar: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    marginBottom: 8,
  },
  actionsRow: {
    flexDirection: 'row',
    justifyContent: 'space-around',
  },
  actionButton: {
    flex: 1,
    marginHorizontal: 4,
  },
  scrollView: {
    flex: 1,
    paddingHorizontal: 16,
  },
  emptyCard: {
    marginTop: 32,
  },
  emptyContent: {
    alignItems: 'center',
    paddingVertical: 32,
  },
  emptyTitle: {
    marginTop: 16,
    textAlign: 'center',
  },
  emptySubtitle: {
    marginTop: 8,
    textAlign: 'center',
    opacity: 0.7,
  },
  emptyButton: {
    marginTop: 24,
  },
  logCard: {
    marginBottom: 8,
  },
  logContent: {
    paddingVertical: 12,
  },
  logHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  logHeaderLeft: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  logIcon: {
    marginRight: 8,
  },
  logTime: {
    fontFamily: 'monospace',
  },
  logLevelChip: {
    height: 24,
  },
  logMessage: {
    fontWeight: '500',
    marginBottom: 4,
  },
  logDetails: {
    marginTop: 8,
    padding: 12,
    borderRadius: 8,
    backgroundColor: 'rgba(0, 0, 0, 0.1)',
  },
  logDetailsText: {
    fontFamily: 'monospace',
    fontSize: 11,
  },
  bottomPadding: {
    height: 32,
  },
});