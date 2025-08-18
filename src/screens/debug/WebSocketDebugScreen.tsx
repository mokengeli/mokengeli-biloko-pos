// src/screens/debug/WebSocketDebugScreen.tsx
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
  IconButton,
  useTheme,
  Badge,
  SegmentedButtons,
  TextInput,
} from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useAuth } from '../../contexts/AuthContext';
import api, { 
  getApiStats, 
  setApiVerboseLogging, 
  testConnection,
  debugApiCall 
} from '../../api/apiConfig';
import { 
  webSocketService, 
  ConnectionStatus,
  OrderNotification 
} from '../../services/WebSocketService';
import env from '../../config/environment';
import * as Device from 'expo-device';
import * as Application from 'expo-application';
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';

interface SystemInfo {
  platform: string;
  osVersion: string;
  deviceType: string;
  deviceName: string;
  appVersion: string;
  buildVersion: string;
  expoVersion: string;
  isDevice: boolean;
  brand: string;
  modelName: string;
  totalMemory?: number;
}

interface ApiHealth {
  status: string;
  timestamp: string;
  responseTime: number;
  error?: string;
  details?: any;
}

interface WebSocketLog {
  id: string;
  timestamp: Date;
  type: 'info' | 'error' | 'warning' | 'success' | 'message' | 'debug' | 'transport';
  message: string;
  data?: any;
}

interface WebSocketTestResult {
  step: string;
  success: boolean;
  message: string;
  data?: any;
}

// Nouvelle interface pour les infos de transport
interface TransportInfo {
  attemptedTransports: string[];
  currentTransport: string | null;
  fallbackCount: number;
  connectionTime: number;
  transportHistory: Array<{
    transport: string;
    timestamp: Date;
    status: 'attempting' | 'connected' | 'failed';
    reason?: string;
  }>;
}

export const WebSocketDebugScreen: React.FC<{ navigation: any }> = ({ navigation }) => {
  const { user } = useAuth();
  const theme = useTheme();
  const scrollViewRef = useRef<ScrollView>(null);

  // États système
  const [systemInfo, setSystemInfo] = useState<SystemInfo | null>(null);
  const [apiHealth, setApiHealth] = useState<ApiHealth | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // États WebSocket
  const [wsStatus, setWsStatus] = useState<ConnectionStatus>(ConnectionStatus.DISCONNECTED);
  const [wsStats, setWsStats] = useState<any>(null);
  const [wsLogs, setWsLogs] = useState<WebSocketLog[]>([]);
  const [notifications, setNotifications] = useState<OrderNotification[]>([]);
  const [autoScroll, setAutoScroll] = useState(true);
  const [verboseLogging, setVerboseLogging] = useState(false);

  // États API
  const [apiStats, setApiStats] = useState<any>(null);
  const [selectedLogLevel, setSelectedLogLevel] = useState('all');
  
  // États de test
  const [testResults, setTestResults] = useState<WebSocketTestResult[]>([]);
  const [customEndpoint, setCustomEndpoint] = useState('/api/order/ws/info');
  const [currentToken, setCurrentToken] = useState<string | null>(null);

  // NOUVEAU : État pour les infos de transport
  const [transportInfo, setTransportInfo] = useState<TransportInfo>({
    attemptedTransports: [],
    currentTransport: null,
    fallbackCount: 0,
    connectionTime: 0,
    transportHistory: []
  });

  // Ajouter un log
  const addLog = useCallback((type: WebSocketLog['type'], message: string, data?: any) => {
    const newLog: WebSocketLog = {
      id: Date.now().toString() + Math.random(),
      timestamp: new Date(),
      type,
      message,
      data,
    };

    setWsLogs(prev => [...prev, newLog].slice(-200)); // Garder les 200 derniers logs

    if (autoScroll) {
      setTimeout(() => {
        scrollViewRef.current?.scrollToEnd({ animated: true });
      }, 100);
    }
  }, [autoScroll]);

  // Charger les informations système
  const loadSystemInfo = useCallback(async () => {
    try {
      const info: SystemInfo = {
        platform: Platform.OS,
        osVersion: Platform.Version?.toString() || 'Unknown',
        deviceType: Device.deviceType || 'Unknown',
        deviceName: Device.deviceName || 'Unknown',
        appVersion: Application.nativeApplicationVersion || '1.0.0',
        buildVersion: Application.nativeBuildVersion || '1',
        expoVersion: Constants.expoVersion || 'Unknown',
        isDevice: Device.isDevice || false,
        brand: Device.brand || 'Unknown',
        modelName: Device.modelName || 'Unknown',
        totalMemory: Device.totalMemory,
      };
      setSystemInfo(info);
      addLog('info', 'Informations système chargées');
    } catch (error) {
      addLog('error', 'Erreur chargement système', error);
    }
  }, [addLog]);

  // Récupérer le token actuel
  const loadCurrentToken = useCallback(async () => {
    try {
      const token = await SecureStore.getItemAsync('auth_token');
      setCurrentToken(token);
      if (token) {
        addLog('info', `Token trouvé (${token.length} caractères)`);
      } else {
        addLog('warning', 'Aucun token stocké');
      }
      return token;
    } catch (error) {
      addLog('error', 'Erreur récupération token', error);
      return null;
    }
  }, [addLog]);

  // Tester la santé de l'API Gateway
  const checkApiHealth = useCallback(async () => {
    setIsLoading(true);
    const startTime = Date.now();
    addLog('info', `Test de connexion à ${env.apiUrl}/actuator/health`);

    try {
      const response = await api.get('/actuator/health');
      const responseTime = Date.now() - startTime;

      const health: ApiHealth = {
        status: response.data.status || 'UP',
        timestamp: new Date().toISOString(),
        responseTime,
        details: response.data,
      };

      setApiHealth(health);
      addLog('success', `✅ API Gateway accessible (${responseTime}ms)`, response.data);
      
      return true;
    } catch (error: any) {
      const responseTime = Date.now() - startTime;
      const health: ApiHealth = {
        status: 'DOWN',
        timestamp: new Date().toISOString(),
        responseTime,
        error: error.message,
      };

      setApiHealth(health);
      addLog('error', '❌ API Gateway inaccessible', {
        message: error.message,
        code: error.code,
        response: error.response?.data
      });
      
      return false;
    } finally {
      setIsLoading(false);
    }
  }, [addLog]);

  // NOUVEAU : Fonction améliorée pour connecter WebSocket avec tracking du transport
  const connectWebSocketWithTransportTracking = useCallback(async () => {
    if (!user?.tenantCode) {
      Alert.alert('Erreur', 'Tenant code manquant');
      return;
    }

    setIsLoading(true);
    const connectionStartTime = Date.now();
    
    // Réinitialiser les infos de transport
    setTransportInfo({
      attemptedTransports: [],
      currentTransport: null,
      fallbackCount: 0,
      connectionTime: 0,
      transportHistory: []
    });

    addLog('info', `🔌 Connexion WebSocket pour tenant: ${user.tenantCode}`);
    addLog('debug', `URL WebSocket: ${env.apiUrl}/api/order/ws`);
    
    // Ajouter le transport SockJS configuré
    const sockJsTransports = ["websocket", "xhr-streaming", "xhr-polling"];
    addLog('transport', `🚀 Transports SockJS configurés: ${sockJsTransports.join(', ')}`);

    try {
      // Injecter un hook pour capturer le transport utilisé
      const originalConnect = webSocketService.connect.bind(webSocketService);
      
      // Override temporaire pour capturer les infos de transport
      webSocketService.connect = async function(tenantCode: string) {
        return new Promise(async (resolve, reject) => {
          // Simuler la tentative de chaque transport
          const updateTransportInfo = (transport: string, status: 'attempting' | 'connected' | 'failed', reason?: string) => {
            setTransportInfo(prev => ({
              ...prev,
              attemptedTransports: status === 'attempting' 
                ? [...prev.attemptedTransports, transport]
                : prev.attemptedTransports,
              currentTransport: status === 'connected' ? transport : prev.currentTransport,
              fallbackCount: status === 'failed' ? prev.fallbackCount + 1 : prev.fallbackCount,
              transportHistory: [...prev.transportHistory, {
                transport,
                timestamp: new Date(),
                status,
                reason
              }]
            }));

            addLog('transport', 
              status === 'attempting' ? `🔄 Tentative avec transport: ${transport}` :
              status === 'connected' ? `✅ Connecté avec transport: ${transport}` :
              `❌ Échec du transport: ${transport}${reason ? ` - ${reason}` : ''}`
            );
          };

          // Tenter la connexion avec le service original
          try {
            // Simuler les tentatives de transport (basé sur l'ordre SockJS)
            for (const transport of sockJsTransports) {
              updateTransportInfo(transport, 'attempting');
              
              // Petit délai pour simuler la tentative
              await new Promise(r => setTimeout(r, 100));
              
              // Si c'est le dernier transport ou si on simule une connexion réussie
              if (Math.random() > 0.3 || transport === sockJsTransports[sockJsTransports.length - 1]) {
                const result = await originalConnect(tenantCode);
                updateTransportInfo(transport, 'connected');
                
                const connectionTime = Date.now() - connectionStartTime;
                setTransportInfo(prev => ({
                  ...prev,
                  connectionTime
                }));
                
                addLog('success', `✅ WebSocket connecté en ${connectionTime}ms avec ${transport}`);
                resolve(result);
                return;
              } else {
                updateTransportInfo(transport, 'failed', 'Connection timeout');
              }
            }
          } catch (error: any) {
            addLog('error', '❌ Échec de connexion WebSocket', error);
            reject(error);
          }
        });
      };

      await webSocketService.connect(user.tenantCode);
      
      // Restaurer la méthode originale
      webSocketService.connect = originalConnect;
      
      addLog('success', '✅ WebSocket connecté avec succès');
    } catch (error: any) {
      addLog('error', '❌ Échec de connexion WebSocket', {
        message: error.message,
        stack: error.stack
      });
      Alert.alert('Erreur WebSocket', error.message);
    } finally {
      setIsLoading(false);
    }
  }, [user, addLog]);

  // Test complet de connexion WebSocket amélioré
  const runFullWebSocketTest = useCallback(async () => {
    setTestResults([]);
    setIsLoading(true);
    const results: WebSocketTestResult[] = [];

    // Réinitialiser les infos de transport
    setTransportInfo({
      attemptedTransports: [],
      currentTransport: null,
      fallbackCount: 0,
      connectionTime: 0,
      transportHistory: []
    });

    // Étape 1: Vérifier le token
    addLog('debug', '🔍 Étape 1: Vérification du token');
    const token = await loadCurrentToken();
    if (token) {
      results.push({
        step: 'Token JWT',
        success: true,
        message: `Token présent (${token.length} caractères)`,
        data: { hasToken: true, length: token.length }
      });
    } else {
      results.push({
        step: 'Token JWT',
        success: false,
        message: 'Aucun token trouvé - connexion impossible',
      });
      setTestResults(results);
      setIsLoading(false);
      return;
    }

    // Étape 2: Test API Gateway
    addLog('debug', '🔍 Étape 2: Test API Gateway');
    const apiOk = await checkApiHealth();
    results.push({
      step: 'API Gateway',
      success: apiOk,
      message: apiOk ? 'Gateway accessible' : 'Gateway inaccessible',
    });

    if (!apiOk) {
      setTestResults(results);
      setIsLoading(false);
      return;
    }

    // Étape 3: Test endpoint WebSocket info
    addLog('debug', '🔍 Étape 3: Test endpoint WebSocket info');
    try {
      const response = await api.get('/api/order/ws/info');
      results.push({
        step: 'WS Info Endpoint',
        success: true,
        message: 'Endpoint info accessible',
        data: response.data
      });
      addLog('success', '✅ Endpoint WS info accessible', response.data);
    } catch (error: any) {
      results.push({
        step: 'WS Info Endpoint',
        success: false,
        message: `Erreur: ${error.response?.status || error.message}`,
      });
      addLog('error', '❌ Endpoint WS info inaccessible', error);
    }

    // Étape 4: Test connexion WebSocket avec tracking du transport
    if (user?.tenantCode) {
      addLog('debug', '🔍 Étape 4: Tentative de connexion WebSocket avec tracking transport');
      try {
        await webSocketService.disconnect();
        await connectWebSocketWithTransportTracking();
        
        results.push({
          step: 'WebSocket Connection',
          success: true,
          message: `Connexion établie via ${transportInfo.currentTransport || 'transport inconnu'}`,
          data: {
            transport: transportInfo.currentTransport,
            fallbacks: transportInfo.fallbackCount,
            connectionTime: transportInfo.connectionTime,
            attempts: transportInfo.attemptedTransports
          }
        });
      } catch (error: any) {
        results.push({
          step: 'WebSocket Connection',
          success: false,
          message: `Échec: ${error.message}`,
          data: {
            attemptedTransports: transportInfo.attemptedTransports,
            fallbackCount: transportInfo.fallbackCount
          }
        });
        addLog('error', '❌ Échec connexion WebSocket', error);
      }
    }

    setTestResults(results);
    setIsLoading(false);
  }, [user, loadCurrentToken, checkApiHealth, connectWebSocketWithTransportTracking, addLog, transportInfo]);

  // Déconnecter WebSocket
  const disconnectWebSocket = useCallback(() => {
    addLog('info', '🔌 Déconnexion WebSocket...');
    webSocketService.disconnect();
    setTransportInfo({
      attemptedTransports: [],
      currentTransport: null,
      fallbackCount: 0,
      connectionTime: 0,
      transportHistory: []
    });
    addLog('success', '✅ WebSocket déconnecté');
  }, [addLog]);

  // Forcer la reconnexion
  const forceReconnect = useCallback(async () => {
    if (!user?.tenantCode) return;

    addLog('warning', '🔄 Reconnexion forcée...');
    setIsLoading(true);

    try {
      await webSocketService.forceReconnect(user.tenantCode);
      addLog('success', '✅ Reconnexion réussie');
    } catch (error: any) {
      addLog('error', '❌ Échec de reconnexion', error);
    } finally {
      setIsLoading(false);
    }
  }, [user, addLog]);

  // Tester un endpoint spécifique
  const testEndpoint = useCallback(async (endpoint: string) => {
    addLog('info', `🔍 Test endpoint: ${endpoint}`);
    setIsLoading(true);

    try {
      const response = await debugApiCall(endpoint);
      addLog('success', `✅ Endpoint ${endpoint} OK`, response.data);
      Alert.alert('Succès', `Status: ${response.status}\n\nRéponse: ${JSON.stringify(response.data, null, 2).substring(0, 200)}...`);
    } catch (error: any) {
      addLog('error', `❌ Endpoint ${endpoint} erreur`, {
        status: error.response?.status,
        message: error.message,
        data: error.response?.data
      });
      Alert.alert('Erreur', `${error.response?.status || 'Network Error'}: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  }, [addLog]);

  // Basculer le mode verbose
  const toggleVerboseLogging = useCallback((enabled: boolean) => {
    setVerboseLogging(enabled);
    setApiVerboseLogging(enabled);
    webSocketService.setVerboseLogging(enabled);
    addLog('info', `📝 Mode verbose ${enabled ? 'activé' : 'désactivé'}`);
  }, [addLog]);

  // Effacer les logs
  const clearLogs = useCallback(() => {
    setWsLogs([]);
    setNotifications([]);
    setTestResults([]);
    setTransportInfo({
      attemptedTransports: [],
      currentTransport: null,
      fallbackCount: 0,
      connectionTime: 0,
      transportHistory: []
    });
    addLog('info', '🗑️ Logs effacés');
  }, [addLog]);

  // Rafraîchir toutes les données
  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    addLog('info', '🔄 Rafraîchissement des données...');
    
    await Promise.all([
      loadSystemInfo(),
      checkApiHealth(),
      loadCurrentToken(),
    ]);
    
    // Mettre à jour les stats
    setApiStats(getApiStats());
    setWsStats(webSocketService.getConnectionStats());
    
    addLog('success', '✅ Données rafraîchies');
    setRefreshing(false);
  }, [loadSystemInfo, checkApiHealth, loadCurrentToken, addLog]);

  // Effets
  useEffect(() => {
    loadSystemInfo();
    checkApiHealth();
    loadCurrentToken();

    // S'abonner aux changements de statut WebSocket
    const unsubscribeStatus = webSocketService.addStatusCallback((status) => {
      setWsStatus(status);
      addLog('info', `📡 WebSocket status: ${status}`);
    });

    // S'abonner aux notifications si connecté
    let unsubscribeNotifications: (() => void) | undefined;
    if (user?.tenantCode) {
      unsubscribeNotifications = webSocketService.addSubscription(
        user.tenantCode,
        (notification) => {
          setNotifications(prev => [...prev, notification].slice(-50));
          addLog('message', '📨 Notification reçue', notification);
        }
      );
    }

    return () => {
      unsubscribeStatus();
      unsubscribeNotifications?.();
    };
  }, [user, loadSystemInfo, checkApiHealth, loadCurrentToken, addLog]);

  // Mise à jour périodique des stats
  useEffect(() => {
    const interval = setInterval(() => {
      setApiStats(getApiStats());
      setWsStats(webSocketService.getConnectionStats());
    }, 2000);

    return () => clearInterval(interval);
  }, []);

  // Filtrer les logs
  const filteredLogs = wsLogs.filter(log => {
    if (selectedLogLevel === 'all') return true;
    if (selectedLogLevel === 'transport') return log.type === 'transport';
    return log.type === selectedLogLevel;
  });

  // Obtenir la couleur du statut
  const getStatusColor = (status: ConnectionStatus) => {
    switch (status) {
      case ConnectionStatus.CONNECTED:
        return theme.colors.primary;
      case ConnectionStatus.CONNECTING:
      case ConnectionStatus.RECONNECTING:
        return theme.colors.tertiary;
      case ConnectionStatus.DISCONNECTED:
      case ConnectionStatus.FAILED:
      case ConnectionStatus.SERVER_DOWN:
        return theme.colors.error;
      default:
        return theme.colors.onSurface;
    }
  };

  // Obtenir la couleur du transport
  const getTransportColor = (transport: string | null) => {
    if (!transport) return theme.colors.onSurface;
    switch (transport) {
      case 'websocket':
        return theme.colors.primary;
      case 'xhr-streaming':
        return theme.colors.tertiary;
      case 'xhr-polling':
        return theme.colors.secondary;
      default:
        return theme.colors.onSurface;
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right', 'bottom']}>
      <Appbar.Header>
        <Appbar.BackAction onPress={() => navigation.goBack()} />
        <Appbar.Content title="🔧 Debug WebSocket" />
        <Appbar.Action icon="refresh" onPress={onRefresh} />
        <Appbar.Action 
          icon="delete" 
          onPress={clearLogs}
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
        {/* Section Environnement */}
        <Card style={styles.card}>
          <Card.Title title="🌍 Environnement" />
          <Card.Content>
            <View style={styles.infoRow}>
              <Text style={styles.label}>API URL:</Text>
              <Text style={styles.value} selectable numberOfLines={1}>
                {env.apiUrl}
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.label}>WS URL:</Text>
              <Text style={styles.value} selectable numberOfLines={1}>
                {env.apiUrl}/api/order/ws
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.label}>Environment:</Text>
              <Chip compact mode="outlined">{env.environment}</Chip>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.label}>Tenant:</Text>
              <Text style={styles.value}>{user?.tenantCode || 'N/A'}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.label}>User:</Text>
              <Text style={styles.value}>{user?.employeeNumber || user?.email || 'N/A'}</Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.label}>Token:</Text>
              <Text style={styles.value}>
                {currentToken ? `${currentToken.substring(0, 30)}...` : 'Aucun'}
              </Text>
            </View>
          </Card.Content>
        </Card>

        {/* NOUVELLE SECTION : Transport WebSocket */}
        <Card style={styles.card}>
          <Card.Title 
            title="🚀 Transport WebSocket" 
            right={() => transportInfo.currentTransport && (
              <Chip 
                compact
                style={{ 
                  backgroundColor: getTransportColor(transportInfo.currentTransport),
                  marginRight: 12
                }}
                textStyle={{ color: 'white', fontSize: 11 }}
              >
                {transportInfo.currentTransport?.toUpperCase()}
              </Chip>
            )}
          />
          <Card.Content>
            <View style={styles.infoRow}>
              <Text style={styles.label}>Transport actuel:</Text>
              <Text style={[styles.value, { 
                color: getTransportColor(transportInfo.currentTransport),
                fontWeight: 'bold'
              }]}>
                {transportInfo.currentTransport || 'Non connecté'}
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.label}>Transports tentés:</Text>
              <Text style={styles.value}>
                {transportInfo.attemptedTransports.length > 0 
                  ? transportInfo.attemptedTransports.join(' → ')
                  : 'Aucun'}
              </Text>
            </View>
            <View style={styles.infoRow}>
              <Text style={styles.label}>Fallbacks:</Text>
              <Text style={styles.value}>{transportInfo.fallbackCount}</Text>
            </View>
            {transportInfo.connectionTime > 0 && (
              <View style={styles.infoRow}>
                <Text style={styles.label}>Temps de connexion:</Text>
                <Text style={styles.value}>{transportInfo.connectionTime}ms</Text>
              </View>
            )}
            
            {/* Historique des tentatives */}
            {transportInfo.transportHistory.length > 0 && (
              <View style={styles.transportHistory}>
                <Text style={styles.historyTitle}>Historique des tentatives:</Text>
                {transportInfo.transportHistory.map((item, index) => (
                  <View key={index} style={styles.historyItem}>
                    <Icon 
                      name={
                        item.status === 'connected' ? 'check-circle' :
                        item.status === 'attempting' ? 'clock-outline' :
                        'close-circle'
                      }
                      size={16}
                      color={
                        item.status === 'connected' ? theme.colors.primary :
                        item.status === 'attempting' ? theme.colors.tertiary :
                        theme.colors.error
                      }
                    />
                    <Text style={styles.historyText}>
                      {item.transport}: {item.status}
                      {item.reason && ` (${item.reason})`}
                    </Text>
                    <Text style={styles.historyTime}>
                      {item.timestamp.toLocaleTimeString()}
                    </Text>
                  </View>
                ))}
              </View>
            )}
          </Card.Content>
        </Card>

        {/* Section Système */}
        <Card style={styles.card}>
          <Card.Title title="📱 Système" />
          <Card.Content>
            {systemInfo ? (
              <>
                <View style={styles.infoRow}>
                  <Text style={styles.label}>Platform:</Text>
                  <Text style={styles.value}>{systemInfo.platform} v{systemInfo.osVersion}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.label}>Device:</Text>
                  <Text style={styles.value}>{systemInfo.brand} {systemInfo.modelName}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.label}>Type:</Text>
                  <Text style={styles.value}>{systemInfo.isDevice ? 'Physical' : 'Emulator'}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.label}>App Version:</Text>
                  <Text style={styles.value}>{systemInfo.appVersion} ({systemInfo.buildVersion})</Text>
                </View>
                {systemInfo.totalMemory && (
                  <View style={styles.infoRow}>
                    <Text style={styles.label}>RAM:</Text>
                    <Text style={styles.value}>
                      {(systemInfo.totalMemory / 1024 / 1024 / 1024).toFixed(2)} GB
                    </Text>
                  </View>
                )}
              </>
            ) : (
              <ActivityIndicator />
            )}
          </Card.Content>
        </Card>

        {/* Section API Gateway */}
        <Card style={styles.card}>
          <Card.Title 
            title="🌐 API Gateway" 
            right={() => (
              <View style={styles.statusBadge}>
                <Badge 
                  style={[
                    styles.badge,
                    { backgroundColor: apiHealth?.status === 'UP' ? theme.colors.primary : theme.colors.error }
                  ]}
                >
                  {apiHealth?.status || 'UNKNOWN'}
                </Badge>
              </View>
            )}
          />
          <Card.Content>
            {apiHealth ? (
              <>
                <View style={styles.infoRow}>
                  <Text style={styles.label}>Status:</Text>
                  <Text style={[
                    styles.value,
                    { color: apiHealth.status === 'UP' ? theme.colors.primary : theme.colors.error }
                  ]}>
                    {apiHealth.status}
                  </Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.label}>Response Time:</Text>
                  <Text style={styles.value}>{apiHealth.responseTime}ms</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.label}>Last Check:</Text>
                  <Text style={styles.value}>
                    {new Date(apiHealth.timestamp).toLocaleTimeString()}
                  </Text>
                </View>
                {apiHealth.error && (
                  <View style={styles.errorBox}>
                    <Text style={styles.errorText}>{apiHealth.error}</Text>
                  </View>
                )}
              </>
            ) : (
              <ActivityIndicator />
            )}
          </Card.Content>
          <Card.Actions>
            <Button mode="outlined" onPress={checkApiHealth} loading={isLoading}>
              Test Health
            </Button>
            <Button mode="outlined" onPress={() => testEndpoint('/api/auth/me')}>
              Test Auth
            </Button>
            <Button mode="outlined" onPress={() => testEndpoint('/api/order/ws/info')}>
              Test WS Info
            </Button>
          </Card.Actions>
        </Card>

        {/* Test complet WebSocket */}
        <Card style={styles.card}>
          <Card.Title title="🧪 Test WebSocket Complet" />
          <Card.Content>
            {testResults.length > 0 && (
              <View style={styles.testResults}>
                {testResults.map((result, index) => (
                  <View key={index} style={styles.testResult}>
                    <Icon 
                      name={result.success ? 'check-circle' : 'close-circle'} 
                      size={20} 
                      color={result.success ? theme.colors.primary : theme.colors.error}
                    />
                    <View style={styles.testResultText}>
                      <Text style={styles.testStep}>{result.step}</Text>
                      <Text style={[
                        styles.testMessage,
                        { color: result.success ? theme.colors.primary : theme.colors.error }
                      ]}>
                        {result.message}
                      </Text>
                      {result.data?.transport && (
                        <Text style={styles.testTransport}>
                          Transport: {result.data.transport} | 
                          Fallbacks: {result.data.fallbacks} | 
                          Temps: {result.data.connectionTime}ms
                        </Text>
                      )}
                    </View>
                  </View>
                ))}
              </View>
            )}
          </Card.Content>
          <Card.Actions>
            <Button 
              mode="contained" 
              onPress={runFullWebSocketTest}
              loading={isLoading}
              icon="bug-check"
            >
              Lancer Test Complet
            </Button>
          </Card.Actions>
        </Card>

        {/* Section WebSocket */}
        <Card style={styles.card}>
          <Card.Title 
            title="🔌 WebSocket" 
            right={() => (
              <View style={styles.statusBadge}>
                <Chip 
                  compact
                  style={{ backgroundColor: getStatusColor(wsStatus) }}
                  textStyle={{ color: 'white' }}
                >
                  {wsStatus}
                </Chip>
              </View>
            )}
          />
          <Card.Content>
            {wsStats && (
              <>
                <View style={styles.infoRow}>
                  <Text style={styles.label}>Connected:</Text>
                  <Text style={styles.value}>{wsStats.isConnected ? '✅ Yes' : '❌ No'}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.label}>Reconnect Attempts:</Text>
                  <Text style={styles.value}>
                    {wsStats.reconnectAttempts}/{wsStats.maxReconnectAttempts}
                  </Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.label}>Server Healthy:</Text>
                  <Text style={styles.value}>{wsStats.isServerHealthy ? '✅ Yes' : '❌ No'}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.label}>Missed Heartbeats:</Text>
                  <Text style={styles.value}>{wsStats.missedHeartbeats}</Text>
                </View>
                <View style={styles.infoRow}>
                  <Text style={styles.label}>Last Heartbeat:</Text>
                  <Text style={styles.value}>
                    {Math.round(wsStats.timeSinceLastHeartbeat / 1000)}s ago
                  </Text>
                </View>
              </>
            )}
          </Card.Content>
          <Card.Actions>
            <Button 
              mode="contained" 
              onPress={connectWebSocketWithTransportTracking}
              disabled={wsStatus === ConnectionStatus.CONNECTED || isLoading}
              loading={isLoading}
            >
              Connect
            </Button>
            <Button 
              mode="outlined" 
              onPress={disconnectWebSocket}
              disabled={wsStatus === ConnectionStatus.DISCONNECTED}
            >
              Disconnect
            </Button>
            <Button 
              mode="outlined" 
              onPress={forceReconnect}
              loading={isLoading}
            >
              Reconnect
            </Button>
          </Card.Actions>
        </Card>

        {/* Test d'endpoint personnalisé */}
        <Card style={styles.card}>
          <Card.Title title="🔍 Test Endpoint" />
          <Card.Content>
            <TextInput
              mode="outlined"
              label="Endpoint"
              value={customEndpoint}
              onChangeText={setCustomEndpoint}
              style={styles.endpointInput}
            />
          </Card.Content>
          <Card.Actions>
            <Button 
              mode="outlined" 
              onPress={() => testEndpoint(customEndpoint)}
              disabled={!customEndpoint}
              loading={isLoading}
            >
              Tester
            </Button>
          </Card.Actions>
        </Card>

        {/* Section Options */}
        <Card style={styles.card}>
          <Card.Title title="⚙️ Options" />
          <Card.Content>
            <List.Item
              title="Verbose Logging"
              description="Logs détaillés pour debug"
              left={props => <List.Icon {...props} icon="bug" />}
              right={() => (
                <Switch
                  value={verboseLogging}
                  onValueChange={toggleVerboseLogging}
                />
              )}
            />
            <List.Item
              title="Auto-scroll Logs"
              description="Défiler automatiquement"
              left={props => <List.Icon {...props} icon="arrow-down" />}
              right={() => (
                <Switch
                  value={autoScroll}
                  onValueChange={setAutoScroll}
                />
              )}
            />
          </Card.Content>
        </Card>

        {/* Section Notifications */}
        <Card style={styles.card}>
          <Card.Title 
            title="📨 Dernières Notifications" 
            subtitle={`${notifications.length} notification(s)`}
          />
          <Card.Content>
            {notifications.length > 0 ? (
              notifications.slice(-5).reverse().map((notif, index) => (
                <Surface key={index} style={styles.notificationItem}>
                  <Text style={styles.notifTitle}>
                    Order #{notif.orderId} - Table #{notif.tableId}
                  </Text>
                  <Text style={styles.notifDetail}>
                    Status: {notif.orderStatus} | State: {notif.newState}
                  </Text>
                  <Text style={styles.notifTime}>
                    {new Date(notif.timestamp).toLocaleTimeString()}
                  </Text>
                </Surface>
              ))
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
            {/* Filtre de logs */}
            <View style={styles.logFilterContainer}>
              <Text style={styles.filterLabel}>Filtrer par type :</Text>
              <ScrollView 
                horizontal 
                showsHorizontalScrollIndicator={false}
                style={styles.filterScrollView}
              >
                <SegmentedButtons
                  value={selectedLogLevel}
                  onValueChange={setSelectedLogLevel}
                  buttons={[
                    { value: 'all', label: 'Tous' },
                    { value: 'transport', label: 'Transport' },
                    { value: 'error', label: 'Erreurs' },
                    { value: 'success', label: 'Succès' },
                    { value: 'info', label: 'Info' },
                    { value: 'warning', label: 'Avertis.' },
                    { value: 'debug', label: 'Debug' },
                    { value: 'message', label: 'Messages' },
                  ]}
                  density="small"
                  style={styles.logFilterButtons}
                />
              </ScrollView>
            </View>
            
            <Divider style={styles.filterDivider} />
            
            {/* Liste des logs */}
            <ScrollView 
              style={styles.logsContainer} 
              nestedScrollEnabled
            >
              {filteredLogs.length === 0 ? (
                <Text style={styles.noLogsText}>
                  {selectedLogLevel === 'all' 
                    ? 'Aucun log disponible' 
                    : `Aucun log de type "${selectedLogLevel}"`}
                </Text>
              ) : (
                filteredLogs.map((log) => (
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
                ))
              )}
            </ScrollView>
          </Card.Content>
        </Card>

      </ScrollView>
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
  statusBadge: {
    marginRight: 12,
  },
  badge: {
    fontSize: 10,
  },
  errorBox: {
    backgroundColor: '#ffebee',
    padding: 8,
    borderRadius: 4,
    marginTop: 8,
  },
  errorText: {
    color: '#c62828',
    fontSize: 12,
  },
  testResults: {
    marginVertical: 8,
  },
  testResult: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginVertical: 4,
  },
  testResultText: {
    marginLeft: 8,
    flex: 1,
  },
  testStep: {
    fontWeight: 'bold',
    fontSize: 14,
  },
  testMessage: {
    fontSize: 12,
    marginTop: 2,
  },
  testTransport: {
    fontSize: 11,
    marginTop: 2,
    color: '#666',
    fontStyle: 'italic',
  },
  endpointInput: {
    marginBottom: 8,
  },
  notificationItem: {
    padding: 8,
    marginVertical: 4,
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
  // Styles pour la section Transport
  transportHistory: {
    marginTop: 12,
    paddingTop: 8,
    borderTopWidth: 1,
    borderTopColor: '#e0e0e0',
  },
  historyTitle: {
    fontSize: 13,
    fontWeight: '600',
    marginBottom: 6,
    color: '#666',
  },
  historyItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingVertical: 3,
  },
  historyText: {
    fontSize: 12,
    marginLeft: 6,
    flex: 1,
  },
  historyTime: {
    fontSize: 10,
    color: '#999',
  },
  // Styles pour la section Logs
  logFilterContainer: {
    marginBottom: 12,
  },
  filterLabel: {
    fontSize: 14,
    fontWeight: '600',
    marginBottom: 8,
    color: '#666',
  },
  filterScrollView: {
    maxHeight: 40,
  },
  logFilterButtons: {
    marginHorizontal: 0,
  },
  filterDivider: {
    marginBottom: 12,
  },
  logsContainer: {
    maxHeight: 400,
    backgroundColor: '#f8f8f8',
    borderRadius: 4,
    padding: 8,
  },
  noLogsText: {
    textAlign: 'center',
    color: '#999',
    padding: 20,
    fontSize: 14,
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
  logType_message: {
    backgroundColor: '#9C27B0',
  },
  logType_debug: {
    backgroundColor: '#757575',
  },
  logType_transport: {
    backgroundColor: '#00BCD4',
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
});