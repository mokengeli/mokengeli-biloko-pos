// src/components/server/UrgentTasks.tsx
import React, { useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Animated, FlatList, Dimensions } from 'react-native';
import { Text, Card, Badge, Divider, Surface, useTheme } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

export interface UrgentTask {
  id: string;
  type: 'dish_ready' | 'bill_requested' | 'kitchen_message';
  title: string;
  description: string;
  tableId?: string;
  tableName?: string;
  timestamp: string;
  priority: 'high' | 'medium' | 'low';
}

interface UrgentTasksProps {
  tasks: UrgentTask[];
  onTaskPress: (task: UrgentTask) => void;
  isLoading?: boolean;
}

export const UrgentTasks: React.FC<UrgentTasksProps> = ({
  tasks,
  onTaskPress,
  isLoading = false,
}) => {
  const theme = useTheme();
  const [expanded, setExpanded] = useState(false);
  const [animation] = useState(new Animated.Value(expanded ? 1 : 0));
  const windowWidth = Dimensions.get('window').width;
  const isTablet = windowWidth >= 768;

  // Fonction pour basculer l'état d'expansion
  const toggleExpanded = () => {
    const newExpanded = !expanded;
    setExpanded(newExpanded);

    Animated.timing(animation, {
      toValue: newExpanded ? 1 : 0,
      duration: 300,
      useNativeDriver: false,
    }).start();
  };

  // Animation de rotation pour l'icône
  const iconRotation = animation.interpolate({
    inputRange: [0, 1],
    outputRange: ['0deg', '180deg'],
  });

  // Obtenir l'icône en fonction du type de tâche
  const getTaskIcon = (type: UrgentTask['type']) => {
    switch (type) {
      case 'dish_ready':
        return 'food-variant';
      case 'bill_requested':
        return 'receipt';
      case 'kitchen_message':
        return 'message-alert';
      default:
        return 'alert-circle';
    }
  };

  // Obtenir la couleur en fonction de la priorité
  const getPriorityColor = (priority: UrgentTask['priority']) => {
    switch (priority) {
      case 'high':
        return theme.colors.error;
      case 'medium':
        return theme.colors.warning || '#FFA500';
      case 'low':
        return theme.colors.primary;
      default:
        return theme.colors.text;
    }
  };

  // Formatter la date pour l'affichage
  const formatTimestamp = (timestamp: string) => {
    try {
      const date = new Date(timestamp);
      return date.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
    } catch (error) {
      return '';
    }
  };

  // Rendu d'une tâche individuelle
  const renderTask = ({ item }: { item: UrgentTask }) => (
    <TouchableOpacity 
      onPress={() => onTaskPress(item)}
      disabled={isLoading}
      style={styles.taskCardContainer}
    >
      <View style={styles.taskCardWrapper}>
        <Card style={styles.taskCard}>
          <View style={styles.taskHeader}>
            <View style={styles.titleContainer}>
              <Icon 
                name={getTaskIcon(item.type)} 
                size={20} 
                color={getPriorityColor(item.priority)} 
                style={styles.taskIcon} 
              />
              <Text style={styles.taskTitle}>{item.title}</Text>
            </View>
            <Text style={styles.taskTime}>{formatTimestamp(item.timestamp)}</Text>
          </View>
          
          <Card.Content>
            <Text style={styles.taskDescription}>{item.description}</Text>
            
            {item.tableName && (
              <View style={styles.tableInfo}>
                <Icon name="table-furniture" size={16} color={theme.colors.primary} />
                <Text style={styles.tableName}>{item.tableName}</Text>
              </View>
            )}
          </Card.Content>
          
          <View style={[styles.priorityIndicator, { backgroundColor: getPriorityColor(item.priority) }]} />
        </Card>
      </View>
    </TouchableOpacity>
  );

  return (
    <View style={styles.outerContainer}>
      <Surface style={styles.surface}>
        <View style={styles.container}>
          {/* En-tête de l'accordéon avec indicateur d'expansion */}
          <TouchableOpacity 
            style={styles.headerContainer}
            onPress={toggleExpanded}
            activeOpacity={0.7}
          >
            <View style={styles.headerContent}>
              <Text style={styles.header}>Tâches urgentes</Text>
              <Badge 
                style={[styles.countBadge, { backgroundColor: theme.colors.error }]} 
                size={24}
              >
                {tasks.length}
              </Badge>
            </View>
            
            <Animated.View style={{ transform: [{ rotate: iconRotation }] }}>
              <Icon 
                name="chevron-down" 
                size={24} 
                color={theme.colors.primary} 
              />
            </Animated.View>
          </TouchableOpacity>
          
          <Divider style={styles.divider} />
          
          {/* Contenu de l'accordéon */}
          {expanded && (
            <View style={styles.contentContainer}>
              {tasks.length === 0 ? (
                <View style={styles.emptyContainer}>
                  <Icon name="check-circle" size={40} color={theme.colors.primary} />
                  <Text style={styles.emptyText}>Aucune tâche urgente</Text>
                </View>
              ) : (
                <FlatList
                  data={tasks}
                  renderItem={renderTask}
                  keyExtractor={item => item.id}
                  contentContainerStyle={styles.listContent}
                  showsVerticalScrollIndicator={true}
                  style={styles.taskList}
                  horizontal={isTablet} // Mode horizontal sur tablette
                  showsHorizontalScrollIndicator={isTablet}
                  ItemSeparatorComponent={() => <View style={styles.separator} />}
                  initialNumToRender={5}
                  maxToRenderPerBatch={10}
                  windowSize={10}
                />
              )}
            </View>
          )}
        </View>
      </Surface>
    </View>
  );
};

const styles = StyleSheet.create({
  outerContainer: {
    marginTop: 8, // Réduit de 16 à 8
    marginBottom: 8, // Réduit de 16 à 8
    marginHorizontal: 12,
  },
  surface: {
    elevation: 2,
    borderRadius: 8,
  },
  container: {
    borderRadius: 8,
    overflow: 'hidden',
  },
  headerContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 16,
    paddingVertical: 12,
  },
  headerContent: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  header: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  countBadge: {
    marginLeft: 8,
  },
  divider: {
    height: 1,
  },
  contentContainer: {
    paddingBottom: 8,
    maxHeight: 400, // Augmenté de 300 à 400 pour donner plus d'espace quand déplié
  },
  emptyContainer: {
    padding: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emptyText: {
    marginTop: 8,
    fontSize: 16,
    opacity: 0.7,
  },
  taskList: {
    maxHeight: 400, // Aussi augmenté pour correspondre
  },
  listContent: {
    padding: 8,
  },
  separator: {
    height: 8, // Espace entre les éléments
  },
  taskCardContainer: {
    marginBottom: 0, // Géré par le séparateur de FlatList
  },
  taskCardWrapper: {
    borderRadius: 8,
    position: 'relative',
  },
  taskCard: {
    borderRadius: 8,
  },
  taskHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingTop: 12,
    paddingBottom: 4,
  },
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  taskIcon: {
    marginRight: 8,
  },
  taskTitle: {
    fontSize: 16,
    fontWeight: '600',
  },
  taskTime: {
    fontSize: 12,
    opacity: 0.7,
  },
  taskDescription: {
    fontSize: 14,
    marginTop: 4,
  },
  tableInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 8,
  },
  tableName: {
    fontSize: 14,
    marginLeft: 4,
    opacity: 0.8,
  },
  priorityIndicator: {
    position: 'absolute',
    top: 0,
    bottom: 0,
    left: 0,
    width: 4,
  },
});