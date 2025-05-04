// src/components/server/TableGrid.tsx
import React from "react";
import {
  View,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Dimensions,
  RefreshControl,
  Text,
} from "react-native";
import { Surface, useTheme } from "react-native-paper";
import { DomainRefTable } from "../../api/tableService";
import Icon from "react-native-vector-icons/MaterialCommunityIcons";

// Types de statut de table possibles
export type TableStatus = "free" | "occupied" | "reserved";

// Interface pour les données de table étendues avec statut
export interface TableWithStatus {
  tableData: DomainRefTable;
  status: TableStatus;
  occupationTime?: number; // Temps d'occupation en minutes (optionnel)
  orderCount?: number; // Nombre de commandes actives (optionnel)
}

interface TableGridProps {
  tables: TableWithStatus[];
  onTablePress: (table: TableWithStatus) => void;
  isLoading?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  recentlyChangedTables?: number[]; // Pour les tables récemment modifiées
}

export const TableGrid: React.FC<TableGridProps> = ({
  tables,
  onTablePress,
  isLoading = false,
  refreshing = false,
  onRefresh,
  recentlyChangedTables = [], // Valeur par défaut: tableau vide
}) => {
  const theme = useTheme();
  const windowWidth = Dimensions.get("window").width;

  // Déterminer le nombre de colonnes en fonction de la largeur de l'écran
  const numColumns = windowWidth >= 768 ? 4 : 2; // 4 colonnes pour tablette, 2 pour téléphone

  // Obtenir la couleur de fond en fonction du statut
  const getStatusColor = (status: TableStatus) => {
    switch (status) {
      case "free":
        return "#E3F2FD"; // Bleu très clair
      case "occupied":
        return "#FFEBEE"; // Rouge très clair
      case "reserved":
        return "#FFF3E0"; // Orange très clair
      default:
        return theme.colors.surface;
    }
  };

  // Obtenir le texte du statut
  const getStatusText = (status: TableStatus) => {
    switch (status) {
      case "free":
        return "Libre";
      case "occupied":
        return "Occupée";
      case "reserved":
        return "Réservée";
      default:
        return "";
    }
  };
  // Formatter le temps d'occupation
  const formatOccupationTime = (minutes?: number) => {
    if (!minutes) return "";

    const hours = Math.floor(minutes / 60);
    const mins = minutes % 60;

    if (hours > 0) {
      return `${hours}h ${mins}m`;
    } else {
      return `${mins}m`;
    }
  };

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[theme.colors.primary]}
          />
        ) : undefined
      }
    >
      <View style={styles.grid}>
        {tables.map((table, index) => {
          // Déterminer la couleur de bordure en fonction du statut
          let borderColor;
          switch (table.status) {
            case "free":
              borderColor = theme.colors.primary;
              break;
            case "occupied":
              borderColor = theme.colors.error;
              break;
            default:
              borderColor = theme.colors.text;
          }

          // Déterminer les styles dynamiques
          const tableWidth =
            numColumns === 4 ? { width: "23%" } : { width: "46%" };
          const tableMargin =
            numColumns === 4 ? { margin: "1%" } : { margin: "2%" };

          // Vérifier si cette table a été récemment modifiée
          const isRecentlyChanged = recentlyChangedTables.includes(
            table.tableData.id
          );

          return (
            <TouchableOpacity
              key={index}
              style={[
                styles.tableItem,
                tableWidth,
                tableMargin,
                { backgroundColor: getStatusColor(table.status) },
                { borderColor: borderColor, borderWidth: 2 },
                // Appliquer un style spécial pour les tables récemment modifiées
                isRecentlyChanged && styles.recentlyChangedTable,
              ]}
              onPress={() => onTablePress(table)}
              disabled={isLoading}
            >
              <Surface style={styles.tableSurface}>
                <Text style={styles.tableName}>{table.tableData.name}</Text>
                <Text style={[styles.tableStatus, { color: borderColor }]}>
                  {getStatusText(table.status)}
                </Text>

                {table.occupationTime && table.status !== "free" ? (
                  <Text style={styles.occupationTime}>
                    {formatOccupationTime(table.occupationTime)}
                  </Text>
                ) : null}

                {table.orderCount && table.orderCount > 0 ? (
                  <View style={styles.alertIndicator}>
                    <Icon name="alert" size={16} color="#FFA500" />
                  </View>
                ) : null}
              </Surface>
            </TouchableOpacity>
          );
        })}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 8,
    flexGrow: 1,
  },
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    justifyContent: "flex-start",
    alignItems: "flex-start",
  },
  tableItem: {
    aspectRatio: 1,
    borderRadius: 8,
    overflow: "hidden",
    position: "relative",
  },
  tableSurface: {
    flex: 1,
    padding: 12,
    justifyContent: "center",
    alignItems: "center",
    elevation: 1,
    height: "100%",
    backgroundColor: "white",
  },
  tableName: {
    fontSize: 18,
    fontWeight: "bold",
    marginBottom: 4,
    color: "#333",
    textAlign: "center",
  },
  tableStatus: {
    fontSize: 14,
    fontWeight: "600",
    textAlign: "center",
  },
  occupationTime: {
    fontSize: 12,
    marginTop: 4,
    opacity: 0.8,
    textAlign: "center",
  },
  alertIndicator: {
    position: "absolute",
    top: 8,
    right: 8,
    height: 24,
    width: 24,
    justifyContent: "center",
    alignItems: "center",
  },
  // Nouveau style pour les tables récemment modifiées
  recentlyChangedTable: {
    shadowColor: "#000",
    shadowOffset: { width: 0, height: 0 },
    shadowOpacity: 0.6,
    shadowRadius: 12,
    elevation: 12,
    transform: [{ scale: 1.03 }], // Légère mise à l'échelle pour attirer l'attention
    borderWidth: 3, // Bordure plus visible
    borderColor: "#FFD700", // Couleur dorée pour attirer l'attention
  },
});
