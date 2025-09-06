// src/components/server/TableGrid.tsx
import React from "react";
import {
  View,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  Dimensions,
  RefreshControl,
  Text,
} from "react-native";
import { Surface, useTheme, ActivityIndicator } from "react-native-paper";
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
  pendingValidation?: boolean;
}

interface TableGridProps {
  tables: TableWithStatus[];
  onTablePress: (table: TableWithStatus) => void;
  isLoading?: boolean;
  refreshing?: boolean;
  onRefresh?: () => void;
  recentlyChangedTables?: number[]; // Pour les tables récemment modifiées
  onLoadMore?: () => void; // Fonction pour charger plus de données
  hasMoreData?: boolean; // Indique s'il y a plus de données à charger
  loadingMore?: boolean; // Indique si le chargement de nouvelles données est en cours
}

export const TableGrid: React.FC<TableGridProps> = ({
  tables,
  onTablePress,
  isLoading = false,
  refreshing = false,
  onRefresh,
  recentlyChangedTables = [], // Valeur par défaut: tableau vide
  onLoadMore,
  hasMoreData = false,
  loadingMore = false,
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

  // Fonction pour rendre un item de table
  const renderTableItem = ({ item: table, index }: { item: TableWithStatus; index: number }) => {
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
          {table.pendingValidation && (
            <View style={styles.validationIndicator}>
              <Icon name="clock-alert" size={16} color="#FF9800" />
            </View>
          )}
        </Surface>
      </TouchableOpacity>
    );
  };

  // Footer pour le chargement de nouvelles données
  const renderFooter = () => {
    if (!loadingMore) return null;
    return (
      <View style={styles.footer}>
        <ActivityIndicator size="small" color={theme.colors.primary} />
        <Text style={styles.loadingText}>Chargement...</Text>
      </View>
    );
  };

  // Gérer l'événement onEndReached
  const handleLoadMore = () => {
    if (hasMoreData && !loadingMore && onLoadMore) {
      onLoadMore();
    }
  };

  return (
    <FlatList
      data={tables}
      renderItem={renderTableItem}
      keyExtractor={(item, index) => `table-${item.tableData.id}-${index}`}
      numColumns={numColumns}
      contentContainerStyle={styles.container}
      columnWrapperStyle={numColumns > 1 ? styles.row : undefined}
      refreshControl={
        onRefresh ? (
          <RefreshControl
            refreshing={refreshing}
            onRefresh={onRefresh}
            colors={[theme.colors.primary]}
          />
        ) : undefined
      }
      onEndReached={handleLoadMore}
      onEndReachedThreshold={0.1}
      ListFooterComponent={renderFooter}
      showsVerticalScrollIndicator={true}
      removeClippedSubviews={true}
      maxToRenderPerBatch={20}
      updateCellsBatchingPeriod={50}
      initialNumToRender={20}
    />
  );
};

const styles = StyleSheet.create({
  container: {
    padding: 8,
  },
  row: {
    justifyContent: "space-around",
  },
  footer: {
    padding: 20,
    alignItems: "center",
    justifyContent: "center",
  },
  loadingText: {
    marginTop: 8,
    fontSize: 14,
    opacity: 0.7,
  },
  tableItem: {
    aspectRatio: 1,
    borderRadius: 8,
    overflow: "hidden",
    position: "relative",
    flex: 1,
    maxWidth: "48%",
    marginHorizontal: "1%",
    marginVertical: 4,
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
  validationIndicator: {
    position: "absolute",
    top: 8,
    left: 8,
    height: 24,
    width: 24,
    justifyContent: "center",
    alignItems: "center",
    backgroundColor: "white",
    borderRadius: 12,
    elevation: 2,
  },
});
