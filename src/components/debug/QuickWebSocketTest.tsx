// src/components/debug/QuickWebSocketTest.tsx
// Version simplifiée pour tests rapides

import React, { useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Card, Button, Text, Chip, ActivityIndicator } from 'react-native-paper';
import { webSocketService, ConnectionStatus } from '../../services/WebSocketService';
import { useAuth } from '../../contexts/AuthContext';

export const QuickWebSocketTest: React.FC = () => {
  const { user } = useAuth();
  const [status, setStatus] = useState<ConnectionStatus>(ConnectionStatus.DISCONNECTED);
  const [loading, setLoading] = useState(false);
  const [lastMessage, setLastMessage] = useState<string>('');
  const [messageCount, setMessageCount] = useState(0);

  React.useEffect(() => {
    // S'abonner au statut
    const unsubStatus = webSocketService.addStatusCallback(setStatus);
    
    // S'abonner aux messages
    if (user?.tenantCode) {
      const unsubMessages = webSocketService.addSubscription(
        user.tenantCode,
        (notification) => {
          setMessageCount(prev => prev + 1);
          setLastMessage(`Order #${notification.orderId} - ${notification.newState}`);
        }
      );
      
      return () => {
        unsubStatus();
        unsubMessages();
      };
    }
    
    return unsubStatus;
  }, [user]);

  const handleConnect = async () => {
    if (!user?.tenantCode) return;
    
    setLoading(true);
    try {
      await webSocketService.connect(user.tenantCode);
    } catch (error) {
      console.error('Connection error:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDisconnect = () => {
    webSocketService.disconnect();
    setMessageCount(0);
    setLastMessage('');
  };

  const getStatusColor = () => {
    switch (status) {
      case ConnectionStatus.CONNECTED:
        return '#4CAF50';
      case ConnectionStatus.CONNECTING:
      case ConnectionStatus.RECONNECTING:
        return '#FF9800';
      default:
        return '#f44336';
    }
  };

  return (
    <Card style={styles.card}>
      <Card.Title 
        title="🔌 Test WebSocket Rapide"
        right={() => (
          <Chip 
            compact
            style={{ backgroundColor: getStatusColor() }}
            textStyle={{ color: 'white' }}
          >
            {status}
          </Chip>
        )}
      />
      <Card.Content>
        <View style={styles.info}>
          <Text>Tenant: {user?.tenantCode || 'N/A'}</Text>
          <Text>Messages reçus: {messageCount}</Text>
          {lastMessage ? (
            <Text style={styles.lastMessage}>Dernier: {lastMessage}</Text>
          ) : null}
        </View>
      </Card.Content>
      <Card.Actions>
        {status === ConnectionStatus.DISCONNECTED ? (
          <Button 
            mode="contained" 
            onPress={handleConnect}
            loading={loading}
            disabled={!user?.tenantCode}
          >
            Connecter
          </Button>
        ) : (
          <Button 
            mode="outlined" 
            onPress={handleDisconnect}
            disabled={loading}
          >
            Déconnecter
          </Button>
        )}
        {loading && <ActivityIndicator size="small" />}
      </Card.Actions>
    </Card>
  );
};

const styles = StyleSheet.create({
  card: {
    margin: 12,
  },
  info: {
    gap: 4,
  },
  lastMessage: {
    fontSize: 12,
    color: '#666',
    marginTop: 4,
  },
});