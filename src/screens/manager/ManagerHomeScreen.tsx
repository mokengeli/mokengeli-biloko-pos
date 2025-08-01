// src/screens/manager/ManagerHomeScreen.tsx
import React, { useState } from "react";
import { View, StyleSheet } from "react-native";
import {
  Appbar,
  SegmentedButtons,
  Surface,
  Text,
  useTheme,
  Portal,
  Modal,
  List,
  Divider,
} from "react-native-paper";
import { SafeAreaView } from "react-native-safe-area-context";
import { useAuth } from "../../contexts/AuthContext";
import { useNavigation } from "@react-navigation/native";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";
import { HeaderMenu } from "../../components/common/HeaderMenu";

type ViewMode = "overview" | "server" | "kitchen";

export const ManagerHomeScreen: React.FC = () => {
  const { user } = useAuth();
  const theme = useTheme();
  const navigation = useNavigation();
  const [viewMode, setViewMode] = useState<ViewMode>("overview");
  const [menuVisible, setMenuVisible] = useState(false);

  // Naviguer vers les différentes vues
  const handleViewChange = (mode: ViewMode) => {
    setViewMode(mode);
    switch (mode) {
      case "server":
        navigation.navigate("ServerHome" as never);
        break;
      case "kitchen":
        navigation.navigate("KitchenHome" as never);
        break;
      case "overview":
        // Rester sur cette vue
        break;
    }
  };

  return (
    <SafeAreaView style={styles.container} edges={["left", "right"]}>
      <Appbar.Header>
        <Appbar.Content
          title="Mokengeli Biloko POS - Manager"
          subtitle={`${user?.firstName || ""} ${user?.lastName || ""}`}
        />
        <HeaderMenu />
      </Appbar.Header>

      <Surface style={styles.content}>
        {/* Sélecteur de vue */}
        <View style={styles.viewSelector}>
          <Text style={styles.sectionTitle}>Mode de vue</Text>
          <SegmentedButtons
            value={viewMode}
            onValueChange={(value) => handleViewChange(value as ViewMode)}
            buttons={[
              {
                value: "overview",
                label: "Supervision",
                icon: "monitor-dashboard",
              },
              {
                value: "server",
                label: "Service",
                icon: "room-service",
              },
              {
                value: "kitchen",
                label: "Cuisine",
                icon: "chef-hat",
              },
            ]}
            style={styles.segmentedButtons}
          />
        </View>

        {/* Vue Supervision */}
        {viewMode === "overview" && (
          <View style={styles.overviewContainer}>
            <Surface style={styles.quickAccessCard}>
              <Text style={styles.cardTitle}>Accès rapide</Text>
              <Divider style={styles.divider} />

              <List.Item
                title="Vue Service"
                description="Gérer les tables et commandes"
                left={(props) => <List.Icon {...props} icon="room-service" />}
                right={(props) => <List.Icon {...props} icon="chevron-right" />}
                onPress={() => handleViewChange("server")}
              />

              <List.Item
                title="Vue Cuisine"
                description="Superviser la préparation"
                left={(props) => <List.Icon {...props} icon="chef-hat" />}
                right={(props) => <List.Icon {...props} icon="chevron-right" />}
                onPress={() => handleViewChange("kitchen")}
              />
              <List.Item
                title="Validations en attente"
                description="Gérer les pertes et impayés"
                left={(props) => <List.Icon {...props} icon="alert-circle" />}
                right={(props) => <List.Icon {...props} icon="chevron-right" />}
                onPress={() => navigation.navigate("PendingValidations")}
              />

              <List.Item
                title="Rapports"
                description="Disponibles sur l'application web"
                left={(props) => <List.Icon {...props} icon="chart-line" />}
                right={(props) => <List.Icon {...props} icon="open-in-new" />}
                disabled
              />
            </Surface>

            <Surface style={styles.infoCard}>
              <Icon name="information" size={24} color={theme.colors.primary} />
              <Text style={styles.infoText}>
                En tant que manager, vous pouvez accéder aux vues Service et
                Cuisine pour superviser les opérations en temps réel.
              </Text>
            </Surface>
          </View>
        )}
      </Surface>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: "#f5f5f5",
  },
  content: {
    flex: 1,
    padding: 16,
  },
  viewSelector: {
    marginBottom: 24,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 12,
  },
  segmentedButtons: {
    marginTop: 8,
  },
  overviewContainer: {
    flex: 1,
  },
  quickAccessCard: {
    padding: 16,
    borderRadius: 12,
    marginBottom: 16,
  },
  cardTitle: {
    fontSize: 16,
    fontWeight: "bold",
    marginBottom: 12,
  },
  divider: {
    marginBottom: 12,
  },
  infoCard: {
    padding: 16,
    borderRadius: 12,
    flexDirection: "row",
    alignItems: "center",
    backgroundColor: "#E3F2FD",
  },
  infoText: {
    flex: 1,
    marginLeft: 12,
    fontSize: 14,
    lineHeight: 20,
  },
  modalContainer: {
    padding: 20,
  },
  modalContent: {
    borderRadius: 12,
    padding: 0,
    overflow: "hidden",
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: "bold",
    padding: 16,
    textAlign: "center",
  },
  modalDivider: {
    marginBottom: 8,
  },
});
