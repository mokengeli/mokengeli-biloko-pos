// src/screens/debug/SocketIODebugScreen.tsx
import React, { useState, useEffect, useCallback, useRef } from 'react';
import {
  View,
  ScrollView,
  StyleSheet,
  Alert,
  Platform,
  RefreshControl,
} from 'react-native';
import {
  Appbar,
  Card,
  Button,
  Text,
  Divider,
  Surface,
  Chip,
  List,
  Switch,
  ActivityIndicator,
  useTheme,
  Badge,
  SegmentedButtons,
  TextInput,
  Snackbar,
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useAuth } from '../../contexts/AuthContext';
import { useSocketConnection } from '../../hooks/useSocketConnection';
import { socketIOService, ConnectionStatus, OrderNotification } from '../../services/SocketIOService';
import env from '../../config/environment';
import * as Device from 'expo-device';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import { useOrderNotifications } from '../../hooks/useOrderNotifications';

interface DebugLog {
  id: string;
  timestamp: Date;
  type: 'info' | 'error' | 'warning' | 'success' | 'event' | 'debug';
  message: string;
  data?: any;
}

export const SocketIODebugScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { user } = useAuth();
  const theme = useTheme();
  const scrollViewRef = useRef<ScrollView>(null);
  
  // Socket connection
  const {
    status,
    isConnected,
    isAuthenticated,
    socketId,
    stats,
    connect,
    disconnect,
    reconnect,
    emit,
    notification: connectionNotification,
    dismissNotification
  } = useSocketConnection({
    autoConnect: false,
    showStatusNotifications: false
  });
  
  // Order notifications
  const {
    notifications,
    lastNotification,
    clearNotifications,
    count: notificationCount
  } = useOrderNotifications({
    onNotification: (notif) => {
      addLog('event', `📨 Notification: ${notif.orderStatus}`, notif);
    }
  });
  
  // États locaux
  const [logs, setLogs] = useState<DebugLog[]>([]);
  const [selectedLogLevel, setSelectedLogLevel] = useState('all');
  const [autoScroll, setAutoScroll] = useState(true);
  const [customEvent, setCustomEvent] = useState('test:ping');
  const [customData, setCustomData] = useState('{"message": "Hello from debug"}');
  const [isLoading, setIsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  
  // Snackbar pour les messages
  const [snackbar, setSnackbar] = useState({
    visible: false,
    message: '',
    type: 'info' as 'info' | 'error' | 'success'
  });
  
  // Ajouter un log
  const addLog = useCallback((type: DebugLog['type'], message: string, data?: any) => {
    const newLog: DebugLog = {
      id: Date.now().toString() + Math.random(),
      timestamp: new Date(),
      type,
      message,
      data,
    };
    
    setLogs(prev => [...prev, newLog].slice(-200));
    
    if (autoScroll) {
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [autoScroll]);
  
  // Connexion Socket.io
  const handleConnect = useCallback(async () => {
    if (!user?.tenantCode) {
      Alert.alert('Erreur', 'Code tenant manquant');
      return;
    }
    
    setIsLoading(true);
    addLog('info', `🔌 Connexion au tenant: ${user.tenantCode}`);
    
    try {
      await connect();
      addLog('success', '✅ Connexion établie');
    } catch (error: any) {
      addLog('error', '❌ Échec de connexion', error);
      Alert.alert('Erreur', error.message);
    } finally {
      setIsLoading(false);
    }
  }, [user?.tenantCode, connect, addLog]);
  
  // Déconnexion
  const handleDisconnect = useCallback(async () => {
    setIsLoading(true);
    addLog('info', '🔌 Déconnexion...');
    
    try {
      await disconnect();
      addLog('success', '✅ Déconnecté');
    } catch (error: any) {
      addLog('error', '❌ Erreur lors de la déconnexion', error);
    } finally {
      setIsLoading(false);
    }
  }, [disconnect, addLog]);
  
  // Reconnexion
  const handleReconnect = useCallback(async () => {
    setIsLoading(true);
    addLog('warning', '🔄 Reconnexion...');
    
    try {
      await reconnect();
      addLog('success', '✅ Reconnecté');
    } catch (error: any) {
      addLog('error', '❌ Échec de reconnexion', error);
    } finally {
      setIsLoading(false);
    }
  }, [reconnect, addLog]);
  
  // Test ping
  const handlePing = useCallback(() => {
    addLog('info', '🏓 Envoi ping...');
    
    emit('ping', {}, (response: any) => {
      if (response) {
        addLog('success', '🏓 Pong reçu', response);
      } else {
        addLog('warning', '⚠️ Pas de réponse au ping');
      }
    });
  }, [emit, addLog]);
  
  // Envoi d'événement personnalisé
  const handleCustomEvent = useCallback(() => {
    try {
      const data = JSON.parse(customData);
      addLog('info', `📤 Envoi: ${customEvent}`, data);
      
      emit(customEvent, data, (response: any) => {
        addLog('success', `📥 Réponse reçue`, response);
      });
      
      setSnackbar({
        visible: true,
        message: 'Événement envoyé',
        type: 'success'
      });
    } catch (error: any) {
      addLog('error', 'Erreur parsing JSON', error);
      Alert.alert('Erreur', 'JSON invalide');
    }
  }, [customEvent, customData, emit, addLog]);
  
  // Simuler une notification
  const handleSimulateNotification = useCallback(() => {
    const fakeNotification: OrderNotification = {
      orderId: Math.floor(Math.random() * 1000),
      tableId: Math.floor(Math.random() * 20) + 1,
      tenantCode: user?.tenantCode || 'TEST',
      newState: 'READY',
      previousState: 'PENDING',
      tableState: 'OCCUPIED',
      orderStatus: 'DISH_UPDATE' as any,
      timestamp: new Date().toISOString()
    };
    
    addLog('debug', '🧪 Simulation notification', fakeNotification);
    socketIOService.emit('order:notification', fakeNotification);
  }, [user?.tenantCode, addLog]);
  
  // Rafraîchir
  const onRefresh = useCallback(() => {
    setRefreshing(true);
    
    // Mettre à jour les stats
    const currentStats = socketIOService.getStats();
    addLog('info', '📊 Stats actualisées', currentStats);
    
    setRefreshing(false);
  }, [addLog]);
  
  // Effacer les logs
  const handleClearLogs = useCallback(() => {
    setLogs([]);
    clearNotifications();
    addLog('info', '🗑️ Logs effacés');
  }, [clearNotifications, addLog]);
  
  // Écouter les changements de statut
  useEffect(() => {
    const unsubscribe = socketIOService.onStatusChange((newStatus) => {
      addLog('info', `📡 Statut: ${newStatus}`);
    });
    
    return unsubscribe;
  }, [addLog]);
  
  // Filtrer les logs
  const filteredLogs = logs.filter(log => {
    if (selectedLogLevel === 'all') return true;
    return log.type === selectedLogLevel;
  });
  
  // Obtenir la couleur du statut
  const getStatusColor = (status: ConnectionStatus) => {
    switch (status) {
      case ConnectionStatus.AUTHENTICATED:
        return theme.colors.primary;
      case ConnectionStatus.CONNECTED:
        return '#4CAF50';
      case ConnectionStatus.CONNECTING:
      case ConnectionStatus.RECONNECTING:
        return theme.colors.tertiary;
      case ConnectionStatus.DISCONNECTED:
      case ConnectionStatus.FAILED:
        return theme.colors.error;
      default:
        return theme.colors.onSurface;
    }
  };
  
  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => navigation.goBack()} />
        <Appbar.Content title="🔧 Debug Socket.io" />
        <Appbar.Action icon="refresh" onPress={onRefresh} />
        <Appbar.Action 
          icon="delete" 
          onPress={handleClearLogs}
          iconColor={theme.colors.error}
        />
      </Appbar.Header>
      
      <ScrollView
        ref={scrollViewRef}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        contentContainerStyle={styles.scrollContent}
      >
        {/* Section Connexion */}
        <Card style={styles.card}>
          <Card.Title 
            title="🔌 Connexion Socket.io" 
            right={() => (
              <Chip 
                compact
                style={{ backgroundColor: getStatusColor(status) }}
                textStyle={{ color: 'white', fontSize: 11 }}
              >
                {status}
              </Chip>
            )}
          />
          <Card.Content>
            <View style={styles.infoRow}>
              <Text style={styles.label}>URL:</Text>
              <Text style={styles.value} numberOfLines={1}>
                {env.apiUrl}
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.label}>Socket ID:</Text>
              <Text style={styles.value}>{socketId || 'Non connecté'}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.label}>Tenant:</Text>
              <Text style={styles.value}>{user?.tenantCode || 'N/A'}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.label}>Authentifié:</Text>
              <Icon 
                name={isAuthenticated ? 'check-circle' : 'close-circle'} 
                size={20} 
                color={isAuthenticated ? '#4CAF50' : theme.colors.error}
              />
            </View>
          </Card.Content>
          <Card.Actions>
            <Button 
              mode="contained" 
              onPress={handleConnect}
              disabled={isConnected || isLoading}
              loading={isLoading && status === ConnectionStatus.CONNECTING}
            >
              Connecter
            </Button>
            <Button 
              mode="outlined" 
              onPress={handleDisconnect}
              disabled={!isConnected || isLoading}
            >
              Déconnecter
            </Button>
            <Button 
              mode="outlined" 
              onPress={handleReconnect}
              disabled={!user?.tenantCode || isLoading}
              loading={isLoading && status === ConnectionStatus.RECONNECTING}
            >
              Reconnecter
            </Button>
          </Card.Actions>
        </Card>
        
        {/* Section Statistiques */}
        <Card style={styles.card}>
          <Card.Title title="📊 Statistiques" />
          <Card.Content>
            <View style={styles.statsGrid}>
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>Messages envoyés</Text>
                <Text style={styles.statValue}>{stats?.messagesSent || 0}</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>Messages reçus</Text>
                <Text style={styles.statValue}>{stats?.messagesReceived || 0}</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>Erreurs</Text>
                <Text style={styles.statValue}>{stats?.errors || 0}</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>Latence</Text>
                <Text style={styles.statValue}>{stats?.latency || 0}ms</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>Transport</Text>
                <Text style={styles.statValue}>{stats?.transport || 'N/A'}</Text>
              </View>
              <View style={styles.statItem}>
                <Text style={styles.statLabel}>Reconnexions</Text>
                <Text style={styles.statValue}>{stats?.reconnectAttempts || 0}</Text>
              </View>
            </View>
          </Card.Content>
        </Card>
        
        {/* Section Tests */}
        <Card style={styles.card}>
          <Card.Title title="🧪 Tests" />
          <Card.Content>
            <Button 
              mode="outlined" 
              onPress={handlePing}
              disabled={!isConnected}
              style={styles.testButton}
            >
              Test Ping
            </Button>
            <Button 
              mode="outlined" 
              onPress={handleSimulateNotification}
              disabled={!isConnected}
              style={styles.testButton}
            >
              Simuler Notification
            </Button>
            
            <Divider style={styles.divider} />
            
            <Text style={styles.sectionTitle}>Événement personnalisé</Text>
            <TextInput
              mode="outlined"
              label="Nom de l'événement"
              value={customEvent}
              onChangeText={setCustomEvent}
              style={styles.input}
            />
            <TextInput
              mode="outlined"
              label="Données (JSON)"
              value={customData}
              onChangeText={setCustomData}
              multiline
              numberOfLines={3}
              style={styles.input}
            />
            <Button 
              mode="contained" 
              onPress={handleCustomEvent}
              disabled={!isConnected || !customEvent}
            >
              Envoyer
            </Button>
          </Card.Content>
        </Card>
        
        {/* Section Notifications */}
        <Card style={styles.card}>
          <Card.Title 
            title="📨 Notifications" 
            subtitle={`${notificationCount} notification(s)`}
            right={() => (
              <Badge style={styles.badge}>{notificationCount}</Badge>
            )}
          />
          <Card.Content>
            {lastNotification ? (
              <Surface style={styles.notificationItem}>
                <Text style={styles.notifTitle}>
                  Dernière: Order #{lastNotification.orderId}
                </Text>
                <Text style={styles.notifDetail}>
                  Table: {lastNotification.tableId} | État: {lastNotification.newState}
                </Text>
                <Text style={styles.notifTime}>
                  {new Date(lastNotification.timestamp).toLocaleTimeString()}
                </Text>
              </Surface>
            ) : (
              <Text style={styles.emptyText}>Aucune notification reçue</Text>
            )}
          </Card.Content>
        </Card>
        
        {/* Section Logs */}
        <Card style={styles.card}>
          <Card.Title 
            title="📋 Logs" 
            subtitle={`${filteredLogs.length} log(s)`}
          />
          <Card.Content>
            <View style={styles.controls}>
              <SegmentedButtons
                value={selectedLogLevel}
                onValueChange={setSelectedLogLevel}
                buttons={[
                  { value: 'all', label: 'Tous' },
                  { value: 'error', label: 'Erreurs' },
                  { value: 'event', label: 'Events' },
                  { value: 'info', label: 'Info' },
                ]}
                density="small"
              />
              
              <List.Item
                title="Auto-scroll"
                right={() => (
                  <Switch value={autoScroll} onValueChange={setAutoScroll} />
                )}
              />
            </View>
            
            <ScrollView style={styles.logsContainer} nestedScrollEnabled>
              {filteredLogs.map((log) => (
                <View key={log.id} style={styles.logItem}>
                  <View style={styles.logHeader}>
                    <Chip 
                      compact 
                      style={[styles.logType, styles[`logType_${log.type}`]]}
                      textStyle={styles.logTypeText}
                    >
                      {log.type.toUpperCase()}
                    </Chip>
                    <Text style={styles.logTime}>
                      {log.timestamp.toLocaleTimeString()}
                    </Text>
                  </View>
                  <Text style={styles.logMessage}>{log.message}</Text>
                  {log.data && (
                    <Text style={styles.logData} numberOfLines={5}>
                      {typeof log.data === 'object' 
                        ? JSON.stringify(log.data, null, 2)
                        : String(log.data)
                      }
                    </Text>
                  )}
                </View>
              ))}
            </ScrollView>
          </Card.Content>
        </Card>
      </ScrollView>
      
      {/* Snackbar */}
      <Snackbar
        visible={snackbar.visible}
        onDismiss={() => setSnackbar({ ...snackbar, visible: false })}
        duration={3000}
        style={[
          styles.snackbar,
          snackbar.type === 'error' && styles.snackbarError,
          snackbar.type === 'success' && styles.snackbarSuccess
        ]}
      >
        {snackbar.message}
      </Snackbar>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  scrollContent: {
    paddingBottom: 24,
  },
  card: {
    margin: 12,
    elevation: 2,
  },
  infoRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 4,
  },
  label: {
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  value: {
    fontSize: 14,
    flex: 2,
    textAlign: 'right',
  },
  statsGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 8,
  },
  statItem: {
    width: '50%',
    paddingVertical: 8,
  },
  statLabel: {
    fontSize: 12,
    color: '#666',
  },
  statValue: {
    fontSize: 18,
    fontWeight: 'bold',
    marginTop: 2,
  },
  testButton: {
    marginBottom: 8,
  },
  divider: {
    marginVertical: 12,
  },
  sectionTitle: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
  },
  input: {
    marginBottom: 8,
  },
  badge: {
    marginRight: 12,
  },
  notificationItem: {
    padding: 8,
    borderRadius: 4,
    backgroundColor: '#f0f0f0',
  },
  notifTitle: {
    fontWeight: 'bold',
    fontSize: 12,
  },
  notifDetail: {
    fontSize: 11,
    marginTop: 2,
  },
  notifTime: {
    fontSize: 10,
    color: '#666',
    marginTop: 2,
  },
  emptyText: {
    textAlign: 'center',
    color: '#999',
    padding: 16,
  },
  controls: {
    marginBottom: 12,
  },
  logsContainer: {
    maxHeight: 400,
    backgroundColor: '#f8f8f8',
    borderRadius: 4,
    padding: 8,
  },
  logItem: {
    marginBottom: 8,
    paddingBottom: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#e0e0e0',
  },
  logHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  logType: {
    paddingHorizontal: 8,
    paddingVertical: 2,
  },
  logType_info: {
    backgroundColor: '#2196F3',
  },
  logType_error: {
    backgroundColor: '#f44336',
  },
  logType_warning: {
    backgroundColor: '#FF9800',
  },
  logType_success: {
    backgroundColor: '#4CAF50',
  },
  logType_event: {
    backgroundColor: '#9C27B0',
  },
  logType_debug: {
    backgroundColor: '#757575',
  },
  logTypeText: {
    color: 'white',
    fontSize: 10,
    fontWeight: 'bold',
  },
  logTime: {
    fontSize: 10,
    color: '#666',
  },
  logMessage: {
    fontSize: 12,
    marginBottom: 2,
  },
  logData: {
    fontSize: 10,
    color: '#666',
    fontFamily: Platform.OS === 'ios' ? 'Courier' : 'monospace',
    backgroundColor: '#fff',
    padding: 4,
    borderRadius: 2,
    marginTop: 4,
  },
  snackbar: {
    bottom: 0,
  },
  snackbarError: {
    backgroundColor: '#f44336',
  },
  snackbarSuccess: {
    backgroundColor: '#4CAF50',
  },
});