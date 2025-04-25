// src/screens/HomeScreen.tsx
import React from 'react';
import { View, StyleSheet, ScrollView } from 'react-native';
import { Text, Surface, Button, Card, Divider, Chip } from 'react-native-paper';
import { useAuth } from '../contexts/AuthContext';
import { RolesUtils, Role } from '../utils/roles';

export const HomeScreen: React.FC = () => {
  const { user, logout, isLoading } = useAuth();

  const handleLogout = async () => {
    await logout();
  };

  // Fonction pour formater les rôles de l'utilisateur avec descriptions
  const formatRoles = (roles: string[] | undefined) => {
    if (!roles || roles.length === 0) return <Text>Aucun rôle assigné</Text>;
    
    return roles.map((role, index) => (
      <Chip 
        key={index} 
        style={styles.roleChip}
        mode="outlined"
      >
        {RolesUtils.getRoleDescription(role)}
      </Chip>
    ));
  };

  return (
    <ScrollView style={styles.container} contentContainerStyle={styles.contentContainer}>
      <Surface style={styles.surface}>
        <Text style={styles.title}>Restaurant POS</Text>
        <Text style={styles.subtitle}>Bienvenue, {user?.firstName} {user?.lastName}</Text>

        <Card style={styles.card}>
          <Card.Content>
            <Text style={styles.sectionTitle}>Informations Utilisateur</Text>
            <Divider style={styles.divider} />
            
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Nom complet:</Text>
              <Text style={styles.infoValue}>{user?.firstName} {user?.lastName}</Text>
            </View>
            
            <View style={styles.infoRow}>
              <Text style={styles.infoLabel}>Email:</Text>
              <Text style={styles.infoValue}>{user?.email || 'Non renseigné'}</Text>
            </View>
            
            <View style={[styles.infoRow, styles.rolesRow]}>
              <Text style={styles.infoLabel}>Rôle(s):</Text>
              <View style={styles.rolesContainer}>
                {formatRoles(user?.roles)}
              </View>
            </View>
            
            {user?.tenantName && (
              <View style={styles.infoRow}>
                <Text style={styles.infoLabel}>Restaurant:</Text>
                <Text style={styles.infoValue}>{user.tenantName}</Text>
              </View>
            )}
          </Card.Content>
        </Card>

        <Button 
          mode="contained" 
          onPress={handleLogout}
          style={styles.logoutButton}
          loading={isLoading}
          disabled={isLoading}
        >
          Déconnexion
        </Button>
      </Surface>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#f5f5f5',
  },
  contentContainer: {
    padding: 20,
    paddingBottom: 40,
  },
  surface: {
    padding: 20,
    borderRadius: 10,
    elevation: 4,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    textAlign: 'center',
    marginBottom: 10,
    color: '#0066CC',
  },
  subtitle: {
    fontSize: 18,
    textAlign: 'center',
    marginBottom: 20,
  },
  card: {
    marginVertical: 16,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  divider: {
    marginBottom: 16,
  },
  infoRow: {
    flexDirection: 'row',
    marginBottom: 12,
    flexWrap: 'wrap',
  },
  rolesRow: {
    alignItems: 'flex-start',
  },
  infoLabel: {
    fontWeight: 'bold',
    minWidth: 100,
    marginRight: 8,
  },
  infoValue: {
    flex: 1,
  },
  rolesContainer: {
    flex: 1,
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  roleChip: {
    marginBottom: 4,
  },
  logoutButton: {
    marginTop: 10,
  },
});