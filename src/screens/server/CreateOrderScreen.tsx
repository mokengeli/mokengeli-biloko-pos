// src/screens/server/CreateOrderScreen.tsx
import React, { useState, useEffect, useCallback } from 'react';
import { View, StyleSheet, FlatList, Dimensions, TouchableOpacity, ScrollView, Alert } from 'react-native';
import { Appbar, Text, Card, Chip, ActivityIndicator, Surface, Divider, useTheme, Button } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import { useAuth } from '../../contexts/AuthContext';
import { useCart } from '../../contexts/CartContext';
import categoryService, { DomainCategory } from '../../api/categoryService';
import dishService, { DomainDish } from '../../api/dishService';
import { OrderCart } from '../../components/server/OrderCart';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { MainStackParamList } from '../../navigation/AppNavigator';

// Types pour la navigation
type CreateOrderScreenRouteProp = RouteProp<MainStackParamList, 'CreateOrder'>;
type CreateOrderScreenNavigationProp = StackNavigationProp<MainStackParamList, 'CreateOrder'>;

interface CreateOrderScreenProps {
  route: CreateOrderScreenRouteProp;
  navigation: CreateOrderScreenNavigationProp;
}

export const CreateOrderScreen: React.FC<CreateOrderScreenProps> = ({ route, navigation }) => {
  const { tableId, tableName } = route.params;
  const { user } = useAuth();
  const { setTableInfo, clearCart, resetCart, items } = useCart();
  const theme = useTheme();
  const windowWidth = Dimensions.get('window').width;
  const isTablet = windowWidth >= 768;
  
  // États
  const [categories, setCategories] = useState<DomainCategory[]>([]);
  const [selectedCategory, setSelectedCategory] = useState<DomainCategory | null>(null);
  const [dishes, setDishes] = useState<DomainDish[]>([]);
  const [isLoadingCategories, setIsLoadingCategories] = useState(true);
  const [isLoadingDishes, setIsLoadingDishes] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [categoriesExpanded, setCategoriesExpanded] = useState(false);
  
  // Définir les informations de la table au démarrage
  useEffect(() => {
    setTableInfo(tableId, tableName);
  }, [tableId, tableName, setTableInfo]);
  
  // Fonction pour basculer l'affichage des catégories
  const toggleCategoriesExpanded = () => {
    setCategoriesExpanded(!categoriesExpanded);
  };
  
  // Charger les catégories
  const loadCategories = useCallback(async () => {
    if (!user?.tenantCode) {
      setError('Code de restaurant non disponible');
      setIsLoadingCategories(false);
      return;
    }
    
    setIsLoadingCategories(true);
    setError(null);
    
    try {
      const response = await categoryService.getCategories(user.tenantCode);
      setCategories(response.content);
      
      // Sélectionner automatiquement la première catégorie si elle existe
      if (response.content.length > 0) {
        setSelectedCategory(response.content[0]);
        loadDishesByCategory(response.content[0].id);
      }
    } catch (err: any) {
      console.error('Error loading categories:', err);
      setError(err.message || 'Erreur lors du chargement des catégories');
    } finally {
      setIsLoadingCategories(false);
    }
  }, [user?.tenantCode]);
  
  // Charger les plats par catégorie
  const loadDishesByCategory = async (categoryId: number) => {
    setIsLoadingDishes(true);
    setError(null);
    
    try {
      const dishesData = await dishService.getDishesByCategory(categoryId);
      setDishes(dishesData);
    } catch (err: any) {
      console.error(`Error loading dishes for category ${categoryId}:`, err);
      setError(err.message || 'Erreur lors du chargement des plats');
    } finally {
      setIsLoadingDishes(false);
    }
  };
  
  // Sélectionner une catégorie
  const handleCategorySelect = (category: DomainCategory) => {
    setSelectedCategory(category);
    loadDishesByCategory(category.id);
    if (!isTablet) {
      setCategoriesExpanded(false); // Replier la liste après sélection sur mobile
    }
  };

  // Naviguer vers l'écran de personnalisation du plat
  const navigateToDishCustomization = (dish: DomainDish) => {
    navigation.navigate('DishCustomization', {
      dish,
      tableId,
      tableName
    });
  };
  
// Finaliser la commande
  const handleFinishOrder = () => {
    // Navigation vers l'écran d'accueil après finalisation de la commande ou ajout d'articles
    // Cette fonction est appelée depuis le composant OrderCart après un traitement réussi
    navigation.navigate('ServerHome');
  };
  
// Gérer l'annulation de commande
const handleCancelOrder = () => {
  // Explicitement réinitialiser le panier avant de naviguer en arrière
  // C'est une double protection au cas où l'écouteur beforeRemove ne s'activerait pas
  resetCart();
  navigation.goBack();
};
  
  // Effet pour charger les catégories au montage du composant
  useEffect(() => {
    loadCategories();
  }, [loadCategories]);
  
  // Intercepter la navigation vers l'arrière pour réinitialiser le panier et demander confirmation si nécessaire
  useEffect(() => {
    const beforeRemoveListener = navigation.addListener('beforeRemove', (e) => {
      // Vérifier si le panier contient des articles
      if (items.length > 0) {
        // Empêcher la navigation par défaut
        e.preventDefault();
        
        // Demander confirmation avant de quitter
        Alert.alert(
          'Annuler la commande?',
          'Vous avez des articles dans votre panier. Êtes-vous sûr de vouloir abandonner cette commande?',
          [
            { 
              text: 'Rester', 
              style: 'cancel',
              onPress: () => {} // Ne rien faire, rester sur l'écran actuel
            },
            {
              text: 'Abandonner', 
              style: 'destructive',
              onPress: () => {
                // Réinitialiser complètement le panier et quitter
                resetCart();
                navigation.dispatch(e.data.action);
              }
            }
          ]
        );
      } else {
        // Si le panier est vide, réinitialiser pour nettoyer le mode et autres états
        resetCart();
        // Poursuivre la navigation normalement
        navigation.dispatch(e.data.action);
      }
    });
    
    return beforeRemoveListener;
  }, [navigation, items, resetCart]);
  
  // Si les catégories sont en cours de chargement
  if (isLoadingCategories && categories.length === 0) {
    return (
      <SafeAreaView
        style={[styles.container, { backgroundColor: theme.colors.background }]}
        edges={['left', 'right']}
      >
        <Appbar.Header style={[styles.appbar, { backgroundColor: theme.colors.primary }]}>
          <Appbar.BackAction color="white" onPress={() => navigation.goBack()} />
          <Appbar.Content title={`Nouvelle commande - ${tableName}`} titleStyle={{ color: 'white' }} />
        </Appbar.Header>
        
        <View style={styles.loadingContainer}>
          <ActivityIndicator size="large" color={theme.colors.primary} />
          <Text style={styles.loadingText}>Chargement des catégories...</Text>
        </View>
      </SafeAreaView>
    );
  }
  
  return (
    <SafeAreaView
      style={[styles.container, { backgroundColor: theme.colors.background }]}
      edges={['left', 'right']}
    >
      <Appbar.Header style={[styles.appbar, { backgroundColor: theme.colors.primary }]}>
        <Appbar.BackAction color="white" onPress={() => navigation.goBack()} />
        <Appbar.Content title={`Nouvelle commande - ${tableName}`} titleStyle={{ color: 'white' }} />
      </Appbar.Header>
      
      {error ? (
        <Surface
          style={[
            styles.errorContainer,
            {
              backgroundColor: theme.colors.error + '20',
              borderRadius: theme.roundness,
            },
          ]}
        >
          <Text style={[styles.errorText, { color: theme.colors.error }]}>
            {error}
          </Text>
        </Surface>
      ) : (
        <View style={styles.content}>
          {/* Panier de commande */}
          <OrderCart 
            onFinishOrder={handleFinishOrder}
            onCancelOrder={handleCancelOrder}
          />
          
          {/* Section des catégories */}
          <Surface style={[styles.categoriesContainer, { elevation: 4, borderRadius: 8 }]}>
            <TouchableOpacity 
              style={[
                styles.categoriesHeader,
                {borderBottomWidth: categoriesExpanded ? 1 : 0, borderBottomColor: '#f0f0f0'}
              ]}
              onPress={toggleCategoriesExpanded}
              activeOpacity={0.7}
            >
              <View style={styles.categoryTitleContainer}>
                <Icon name="food-fork-drink" size={24} color={theme.colors.primary} style={{ marginRight: 8 }} />
                <Text style={[styles.sectionTitle, { color: theme.colors.primary, marginBottom: 0 }]}>
                  Catégories {selectedCategory ? `- ${selectedCategory.name}` : ''}
                </Text>
              </View>
              <Icon 
                name={categoriesExpanded ? "chevron-up" : "chevron-down"} 
                size={24} 
                color={theme.colors.primary} 
              />
            </TouchableOpacity>
            
            {categoriesExpanded && (
              <View style={styles.categoriesExpandedContainer}>
                {isTablet ? (
                  // Vue tablette: affichage horizontal des catégories avec défilement
                  <ScrollView 
                    horizontal 
                    showsHorizontalScrollIndicator={false}
                    contentContainerStyle={styles.categoriesScrollContent}
                  >
                    {categories.map(category => (
                      <Chip
                        key={category.id}
                        selected={selectedCategory?.id === category.id}
                        selectedColor="white"
                        onPress={() => handleCategorySelect(category)}
                        style={[
                          styles.categoryChip,
                          selectedCategory?.id === category.id ? 
                            { backgroundColor: theme.colors.primary } : 
                            { backgroundColor: '#f0f0f0' }
                        ]}
                        textStyle={{ 
                          color: selectedCategory?.id === category.id ? 'white' : 'black',
                          fontWeight: selectedCategory?.id === category.id ? 'bold' : 'normal'
                        }}
                      >
                        {category.name}
                      </Chip>
                    ))}
                  </ScrollView>
                ) : (
                  // Vue mobile: grille 2x2 des catégories avec défilement vertical
                  <FlatList
                    data={categories}
                    renderItem={({ item }) => {
                      const isSelected = selectedCategory?.id === item.id;
                      return (
                        <TouchableOpacity 
                          onPress={() => handleCategorySelect(item)}
                          style={[
                            styles.categoryItem,
                            isSelected ? 
                              { backgroundColor: theme.colors.primary, borderLeftWidth: 4, borderLeftColor: theme.colors.accent } : 
                              { backgroundColor: '#f9f9f9' }
                          ]}
                        >
                          <Text 
                            style={[
                              styles.categoryText,
                              isSelected ? { color: 'white', fontWeight: 'bold' } : { color: '#333' }
                            ]}
                          >
                            {item.name}
                          </Text>
                        </TouchableOpacity>
                      );
                    }}
                    keyExtractor={item => item.id.toString()}
                    contentContainerStyle={styles.categoriesList}
                    numColumns={2}
                  />
                )}
              </View>
            )}
          </Surface>
          
          {/* Section des plats */}
          <Surface style={[styles.dishesContainer, { elevation: 2, borderRadius: 8 }]}>
            <View style={styles.dishesHeader}>
              <Text style={[styles.sectionTitle, { color: theme.colors.primary }]}>
                <Icon name="silverware-variant" size={24} color={theme.colors.primary} style={{ marginRight: 8 }} />
                {selectedCategory ? `Plats - ${selectedCategory.name}` : 'Sélectionnez une catégorie'}
              </Text>
              {selectedCategory && (
                <Chip 
                  mode="outlined" 
                  style={{ borderColor: theme.colors.primary }}
                  textStyle={{ color: theme.colors.primary }}
                >
                  {dishes.length} plats
                </Chip>
              )}
            </View>
            
            {isLoadingDishes ? (
              <View style={styles.loadingDishesContainer}>
                <ActivityIndicator size="small" color={theme.colors.primary} />
                <Text>Chargement des plats...</Text>
              </View>
            ) : dishes.length > 0 ? (
              <FlatList
                data={dishes}
                renderItem={({ item }) => (
                  <Card
                    style={[styles.dishCard, { borderLeftColor: theme.colors.accent }]}
                    elevation={3}
                  >
                    <Card.Content>
                      <View style={styles.dishHeader}>
                        <Text style={styles.dishName}>{item.name}</Text>
                        <Text style={[styles.dishPrice, { color: theme.colors.accent }]}>
                          {item.price.toFixed(2)} {item.currency.code}
                        </Text>
                      </View>
                      {item.categories && item.categories.length > 0 && (
                        <View style={styles.dishCategories}>
                          {item.categories.map((cat, index) => (
                            <Chip
                              key={index}
                              style={[
                                styles.dishCategoryChip,
                                { backgroundColor: theme.colors.accent + '20' },
                              ]}
                              textStyle={{ fontSize: 10 }}
                            >
                              {cat}
                            </Chip>
                          ))}
                        </View>
                      )}
                    </Card.Content>
                    <Card.Actions style={styles.dishActions}>
                      <Button
                        mode="outlined"
                        icon="plus-circle"
                        onPress={() => navigateToDishCustomization(item)}
                        style={[styles.addButton, { borderColor: theme.colors.accent }]}
                      >
                        Ajouter
                      </Button>
                    </Card.Actions>
                  </Card>
                )}
                keyExtractor={item => item.id.toString()}
                numColumns={isTablet ? 2 : 1}
                contentContainerStyle={styles.dishesList}
              />
            ) : (
              <View style={styles.emptyDishesContainer}>
                <Icon name="food-off" size={48} color={theme.colors.primary} />
                <Text style={styles.emptyText}>
                  Aucun plat disponible dans cette catégorie
                </Text>
              </View>
            )}
          </Surface>
        </View>
      )}
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  appbar: {
    height: 56,
    paddingTop: 0,
  },
  content: {
    flex: 1,
    padding: 12,
    gap: 16, // Espacement entre les sections
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    marginTop: 16,
    fontSize: 16,
  },
  errorContainer: {
    margin: 16,
    padding: 16,
  },
  errorText: {
    textAlign: 'center',
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 12,
  },
  // Styles pour la section des catégories
  categoriesContainer: {
    padding: 0,
    backgroundColor: 'white',
    marginBottom: 8,
    overflow: 'hidden',
  },
  categoriesHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 16,
  },
  categoriesExpandedContainer: {
    maxHeight: 200, // Hauteur maximale pour le conteneur des catégories
    overflow: 'hidden',
  },
  categoryTitleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  categoriesScrollContent: {
    padding: 16,
    gap: 8,
  },
  categoriesList: {
    padding: 8,
  },
  categoryItem: {
    padding: 12,
    borderRadius: 8,
    margin: 4,
    borderLeftWidth: 0,
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  categoryText: {
    fontSize: 16,
    textAlign: 'center',
  },
  categoryChip: {
    marginRight: 8,
    marginBottom: 8,
  },
  // Styles pour la section des plats
  dishesContainer: {
    flex: 1,
    padding: 16,
    backgroundColor: 'white',
  },
  dishesHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  dishesList: {
    paddingBottom: 16,
  },
  dishCard: {
    marginBottom: 12,
    marginHorizontal: 4,
    flex: 1,
    borderLeftWidth: 3,
  },
  dishHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
    marginBottom: 8,
  },
  dishName: {
    fontSize: 16,
    fontWeight: 'bold',
    marginBottom: 4,
    flex: 1,
  },
  dishPrice: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  dishCategories: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 4,
  },
  dishCategoryChip: {
    marginRight: 4,
    marginBottom: 4,
    height: 30, // Hauteur augmentée pour éviter la troncature
    paddingHorizontal: 8, // Padding horizontal pour plus d'espace
  },
  dishActions: {
    justifyContent: 'flex-end',
    borderTopWidth: 1,
    borderTopColor: '#f0f0f0',
  },
  addButton: {
  },
  loadingDishesContainer: {
    padding: 24,
    alignItems: 'center',
  },
  emptyDishesContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 24,
  },
  emptyText: {
    marginTop: 12,
    textAlign: 'center',
    opacity: 0.7,
  },
});