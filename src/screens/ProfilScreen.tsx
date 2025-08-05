// src/screens/ProfilScreen.tsx
import React from "react";
import { View, StyleSheet, ScrollView } from "react-native";
import {
  Text,
  Surface,
  Button,
  Card,
  Divider,
  Chip,
  Appbar,
  List,
  Switch,
  useTheme,
} from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../contexts/AuthContext";
import { RolesUtils } from "../utils/roles";
import { useNavigation } from "@react-navigation/native";
import { useThemeToggle } from "../contexts/ThemeContext";

export const ProfilScreen: React.FC = () => {
  const { user, logout, isLoading } = useAuth();
  const navigation = useNavigation();
  const { isDarkMode, toggleTheme } = useThemeToggle();
  const theme = useTheme();

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
        icon="account-group"
      >
        {RolesUtils.getRoleDescription(role)}
      </Chip>
    ));
  };

  // Fonction pour formater le nom complet
  const getFullName = () => {
    if (!user?.firstName && !user?.lastName) return "Utilisateur";
    return `${user?.firstName || ""} ${user?.lastName || ""}`.trim();
  };

  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      edges={["left", "right"]}
    >
      <Appbar.Header>
        <Appbar.BackAction onPress={() => navigation.goBack()} />
        <Appbar.Content title="Mon profil" />
        <Appbar.Action icon="logout" onPress={handleLogout} />
      </Appbar.Header>

      <ScrollView
        style={styles.scrollView}
        contentContainerStyle={styles.contentContainer}
      >
        {/* En-tête du profil */}
        <Surface
          style={[styles.profileHeader, { backgroundColor: theme.colors.surface }]}
          elevation={2}
        >
          <View style={styles.avatarContainer}>
            <View style={[styles.avatar, { backgroundColor: theme.colors.primary }]}> 
              <Text style={styles.avatarText}>
                {getFullName().charAt(0).toUpperCase()}
              </Text>
            </View>
          </View>
          <Text style={styles.userName}>{getFullName()}</Text>
          {user?.email && <Text style={styles.userEmail}>{user.email}</Text>}
        </Surface>

        {/* Préférences */}
        <Card style={styles.card}>
          <Card.Content>
            <Text style={styles.sectionTitle}>Préférences</Text>
            <Divider style={styles.divider} />
            <List.Section>
              <List.Item
                title="Mode sombre"
                left={(props) => <List.Icon {...props} icon="theme-light-dark" />}
                right={() => (
                  <Switch value={isDarkMode} onValueChange={toggleTheme} />
                )}
                titleStyle={styles.listItemTitle}
              />
            </List.Section>
          </Card.Content>
        </Card>

        {/* Informations personnelles */}
        <Card style={styles.card}>
          <Card.Content>
            <Text style={styles.sectionTitle}>Informations personnelles</Text>
            <Divider style={styles.divider} />

            <List.Section>
              <List.Item
                title="Prénom"
                description={user?.firstName || "Non renseigné"}
                left={(props) => <List.Icon {...props} icon="account" />}
                titleStyle={styles.listItemTitle}
              />
              <List.Item
                title="Nom"
                description={user?.lastName || "Non renseigné"}
                left={(props) => <List.Icon {...props} icon="account" />}
                titleStyle={styles.listItemTitle}
              />
              <List.Item
                title="Email"
                description={user?.email || "Non renseigné"}
                left={(props) => <List.Icon {...props} icon="email" />}
                titleStyle={styles.listItemTitle}
              />
            </List.Section>
          </Card.Content>
        </Card>

        {/* Rôles et permissions */}
        <Card style={styles.card}>
          <Card.Content>
            <Text style={styles.sectionTitle}>Rôles et permissions</Text>
            <Divider style={styles.divider} />

            <View style={styles.rolesContainer}>
              {formatRoles(user?.roles)}
            </View>
          </Card.Content>
        </Card>

        {/* Informations du restaurant */}
        {user?.tenantName && (
          <Card style={styles.card}>
            <Card.Content>
              <Text style={styles.sectionTitle}>Restaurant</Text>
              <Divider style={styles.divider} />

              <List.Section>
                <List.Item
                  title="Nom du restaurant"
                  description={user.tenantName}
                  left={(props) => <List.Icon {...props} icon="store" />}
                  titleStyle={styles.listItemTitle}
                />
                {user.tenantCode && (
                  <List.Item
                    title="Code"
                    description={user.tenantCode}
                    left={(props) => <List.Icon {...props} icon="barcode" />}
                    titleStyle={styles.listItemTitle}
                  />
                )}
              </List.Section>
            </Card.Content>
          </Card>
        )}

        {/* Bouton de déconnexion */}
        <Button
          mode="contained"
          onPress={handleLogout}
          style={styles.logoutButton}
          loading={isLoading}
          disabled={isLoading}
          icon="logout"
        >
          Déconnexion
        </Button>
      </ScrollView>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  scrollView: {
    flex: 1,
  },
  contentContainer: {
    padding: 16,
    paddingBottom: 40,
  },
  profileHeader: {
    borderRadius: 12,
    padding: 24,
    alignItems: "center",
    marginBottom: 24,
  },
  avatarContainer: {
    marginBottom: 16,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    justifyContent: "center",
    alignItems: "center",
  },
  avatarText: {
    fontSize: 32,
    fontWeight: "bold",
    color: "white",
  },
  userName: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 4,
  },
  userEmail: {
    fontSize: 16,
    opacity: 0.7,
  },
  card: {
    marginBottom: 16,
    borderRadius: 12,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 12,
  },
  divider: {
    marginBottom: 16,
  },
  listItemTitle: {
    fontWeight: "600",
  },
  rolesContainer: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  roleChip: {
    marginRight: 8,
    marginBottom: 8,
  },
  logoutButton: {
    marginTop: 24,
    paddingVertical: 4,
  },
});
