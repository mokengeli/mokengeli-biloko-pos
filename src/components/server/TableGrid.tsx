// src/components/server/TableGrid.tsx
import React from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Dimensions, RefreshControl } from 'react-native';
import { Surface, Text, useTheme, Badge } from 'react-native-paper';
import { DomainRefTable } from '../../api/tableService';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';


// Types de statut de table possibles
export type TableStatus = 'free' | 'occupied';

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
}

export const TableGrid: React.FC<TableGridProps> = ({ 
  tables, 
  onTablePress,
  isLoading = false,
  refreshing = false,
  onRefresh
}) => {
  const theme = useTheme();
  const windowWidth = Dimensions.get('window').width;
  
  // Déterminer le nombre de colonnes en fonction de la largeur de l'écran
  const calculateColumns = () => {
    if (windowWidth >= 768) return 4; // Tablette
    return 2; // Téléphone
  };

  const numColumns = calculateColumns();
  
  // Obtenir la couleur de fond en fonction du statut
  const getStatusColor = (status: TableStatus) => {
    switch (status) {
      case 'free':
        return '#E3F2FD'; // Bleu très clair
      case 'occupied':
        return '#FFEBEE'; // Rouge très clair
      default:
        return theme.colors.surface;
    }
  };
  
  // Obtenir le texte du statut
  const getStatusText = (status: TableStatus) => {
    switch (status) {
      case 'free':
        return 'Libre';
      case 'occupied':
        return 'Occupée';
      default:
        return '';
    }
  };
  // Formatter le temps d'occupation
  const formatOccupationTime = (minutes?: number) => {
    if (!minutes) return '';
    
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
          const borderColor = (() => {
            switch (table.status) {
              case 'free': return theme.colors.primary;
              case 'occupied': return theme.colors.error;
              default: return theme.colors.text;
            }
          })();
          
          return (
            <TouchableOpacity
              key={`${table.tableData.name}-${index}`}
              style={[
                styles.tableItem,
                { width: `${100 / numColumns - 4}%` },
                { backgroundColor: getStatusColor(table.status) },
                { borderColor, borderWidth: 2 }
              ]}
              onPress={() => onTablePress(table)}
              disabled={isLoading}
            >
              <Surface style={styles.tableSurface}>
                <Text style={styles.tableName}>{table.tableData.name}</Text>
                <Text style={[styles.tableStatus, { color: borderColor }]}>
                  {getStatusText(table.status)}
                </Text>
                
                {table.occupationTime && table.status !== 'free' && (
                  <Text style={styles.occupationTime}>
                    {formatOccupationTime(table.occupationTime)}
                  </Text>
                )}
                
                {(table.orderCount && table.orderCount > 0) && (
                  <View style={styles.alertIndicator}>
                    <Icon name="alert" size={16} color="#FFA500" />
                  </View>
                )}
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
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-start',
  },
  tableItem: {
    margin: '2%',
    aspectRatio: 1, // Cela garantit que les éléments sont carrés
    borderRadius: 8,
    overflow: 'hidden',
    position: 'relative',
  },
  tableSurface: {
    flex: 1,
    padding: 12,
    justifyContent: 'center',
    alignItems: 'center',
    elevation: 1, // Elevation réduite car nous utilisons déjà des bordures colorées
    height: '100%',
    backgroundColor: 'white', // Fond blanc pour plus de contraste
  },
  tableName: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 4,
    color: '#333', // Couleur de texte plus sombre pour plus de lisibilité
  },
  tableStatus: {
    fontSize: 14,
    fontWeight: '600', // Plus visible
  },
  occupationTime: {
    fontSize: 12,
    marginTop: 4,
    opacity: 0.8, // Plus visible
  },
  alertIndicator: {
    position: 'absolute',
    top: 8,
    right: 8,
    height: 24,
    width: 24,
    justifyContent: 'center',
    alignItems: 'center',
  },
});