// src/screens/server/DishCustomizationScreen.tsx
import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, Alert, TouchableOpacity } from 'react-native';
import { Appbar, Text, Card, Chip, Button, TextInput, Divider, Surface, useTheme, IconButton, Badge, Portal, Modal, ActivityIndicator } from 'react-native-paper';
import { SafeAreaView } from 'react-native-safe-area-context';
import { RouteProp } from '@react-navigation/native';
import { StackNavigationProp } from '@react-navigation/stack';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { DomainDish, DomainDishProduct } from '../../api/dishService';
import dishService from '../../api/dishService';
import { useCart } from '../../contexts/CartContext';

// Types pour la navigation
export type DishCustomizationParamList = {
  DishCustomization: {
    dish: DomainDish;
    tableId: number;
    tableName: string;
    orderItems?: any[]; // Pour contenir des éléments de commande existants
  };
};

type DishCustomizationScreenRouteProp = RouteProp<DishCustomizationParamList, 'DishCustomization'>;
type DishCustomizationScreenNavigationProp = StackNavigationProp<DishCustomizationParamList, 'DishCustomization'>;

interface DishCustomizationScreenProps {
  route: DishCustomizationScreenRouteProp;
  navigation: DishCustomizationScreenNavigationProp;
}

// Type pour les plats personnalisés individuellement
interface CustomizedDish {
  id: number;
  notes: string;
  removedIngredients: string[];
}

export const DishCustomizationScreen: React.FC<DishCustomizationScreenProps> = ({ route, navigation }) => {
  const { dish: initialDish, tableId, tableName } = route.params;
  const theme = useTheme();
  const { addItem } = useCart();

  // États
  const [dish, setDish] = useState<DomainDish>(initialDish);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [quantity, setQuantity] = useState(1);
  const [commonNote, setCommonNote] = useState('');
  const [individualMode, setIndividualMode] = useState(false);
  const [customizedDishes, setCustomizedDishes] = useState<CustomizedDish[]>([]);
  const [selectedCustomDishIndex, setSelectedCustomDishIndex] = useState<number | null>(null);
  const [isIngredientModalVisible, setIsIngredientModalVisible] = useState(false);

  // Charger les détails complets du plat depuis l'API
  useEffect(() => {
    const fetchDishDetails = async () => {
      setIsLoading(true);
      setError(null);
      
      try {
        const dishDetails = await dishService.getDishById(initialDish.id);
        setDish(dishDetails);
      } catch (err: any) {
        console.error('Error fetching dish details:', err);
        setError(err.message || 'Erreur lors du chargement des détails du plat');
      } finally {
        setIsLoading(false);
      }
    };
    
    fetchDishDetails();
  }, [initialDish.id]);

  // Initialiser les plats personnalisés au chargement
  useEffect(() => {
    if (individualMode) {
      const dishes: CustomizedDish[] = Array.from({ length: quantity }, (_, i) => ({
        id: i + 1,
        notes: commonNote, // Copie la note commune
        removedIngredients: [], // Aucun ingrédient retiré par défaut
      }));
      setCustomizedDishes(dishes);
    }
  }, [individualMode, quantity, commonNote]);

  // Gérer le changement de quantité
  const handleQuantityChange = (newQuantity: number) => {
    if (newQuantity < 1) return; // Minimum 1
    
    setQuantity(newQuantity);
    
    if (individualMode) {
      // Ajouter ou supprimer des plats personnalisés selon la nouvelle quantité
      if (newQuantity > customizedDishes.length) {
        // Ajouter des nouveaux plats
        const newDishes = [...customizedDishes];
        for (let i = customizedDishes.length; i < newQuantity; i++) {
          newDishes.push({
            id: i + 1,
            notes: '',
            removedIngredients: [],
          });
        }
        setCustomizedDishes(newDishes);
      } else if (newQuantity < customizedDishes.length) {
        // Supprimer les derniers plats
        setCustomizedDishes(prev => prev.slice(0, newQuantity));
        
        // Ajuster l'index sélectionné si nécessaire
        if (selectedCustomDishIndex !== null && selectedCustomDishIndex >= newQuantity) {
          setSelectedCustomDishIndex(newQuantity - 1);
        }
      }
    }
  };

  // Basculer en mode personnalisation individuelle
  const toggleIndividualMode = () => {
    if (!individualMode) {
      // Passer en mode individuel
      setIndividualMode(true);
    } else {
      // Revenir au mode commun - demander confirmation si personnalisations présentes
      const hasCustomizations = customizedDishes.some(dish => 
        dish.notes.trim() !== '' || dish.removedIngredients.length > 0
      );
      
      if (hasCustomizations) {
        Alert.alert(
          "Perdre les personnalisations?",
          "En désactivant ce mode, toutes les personnalisations individuelles seront perdues.",
          [
            { text: "Annuler", style: "cancel" },
            { 
              text: "Continuer", 
              onPress: () => {
                setIndividualMode(false);
                setSelectedCustomDishIndex(null);
              }
            }
          ]
        );
      } else {
        setIndividualMode(false);
        setSelectedCustomDishIndex(null);
      }
    }
  };

  // Sélectionner un plat personnalisé pour édition
  const selectCustomDish = (index: number) => {
    setSelectedCustomDishIndex(index);
  };

  // Mettre à jour la note d'un plat personnalisé
  const updateCustomDishNote = (index: number, note: string) => {
    const updatedDishes = [...customizedDishes];
    updatedDishes[index].notes = note;
    setCustomizedDishes(updatedDishes);
  };

  // Basculer un ingrédient retiré pour un plat spécifique
  const toggleRemovedIngredient = (index: number, ingredient: string) => {
    const updatedDishes = [...customizedDishes];
    const dish = updatedDishes[index];
    
    if (dish.removedIngredients.includes(ingredient)) {
      dish.removedIngredients = dish.removedIngredients.filter(ing => ing !== ingredient);
    } else {
      dish.removedIngredients.push(ingredient);
    }
    
    setCustomizedDishes(updatedDishes);
  };

  // Obtenir le résumé de la commande
  const getOrderSummary = () => {
    if (individualMode) {
      return customizedDishes.map(dish => ({
        dishId: route.params.dish.id,
        note: dish.notes,
        removedIngredients: dish.removedIngredients,
        count: 1
      }));
    } else {
      return [{
        dishId: route.params.dish.id,
        note: commonNote,
        removedIngredients: [],
        count: quantity
      }];
    }
  };

  // Ajouter à la commande et retourner à l'écran précédent
  const addToOrder = () => {
    if (individualMode) {
      // Mode de personnalisation individuelle
      // Pour chaque plat personnalisé, créer un élément distinct avec quantité=1
      customizedDishes.forEach(customDish => {
        addItem({
          dish: dish,
          quantity: 1,
          notes: customDish.notes,
          removedIngredients: customDish.removedIngredients
        });
      });
    } else {
      // Mode de personnalisation commune
      // Ajouter un seul élément avec la quantité spécifiée
      addItem({
        dish: dish,
        quantity: quantity,
        notes: commonNote,
        removedIngredients: []
      });
    }
    
    // Afficher confirmation et retourner à l'écran précédent
    Alert.alert(
      "Plat ajouté",
      `${quantity} ${dish.name} ${quantity > 1 ? 'ont été ajoutés' : 'a été ajouté'} au panier.`,
      [
        { 
          text: "OK", 
          onPress: () => navigation.goBack()
        }
      ]
    );
  };

  // Rendu de la section des ingrédients
  const renderIngredientsList = () => {
    if (isLoading) {
      return (
        <Card style={styles.ingredientsCard}>
          <Card.Content style={styles.loadingContainer}>
            <ActivityIndicator size="large" color={theme.colors.primary} />
            <Text style={styles.loadingText}>Chargement des ingrédients...</Text>
          </Card.Content>
        </Card>
      );
    }
    
    if (error) {
      return (
        <Card style={styles.ingredientsCard}>
          <Card.Content>
            <View style={styles.errorContainer}>
              <Icon name="alert-circle-outline" size={24} color={theme.colors.error} />
              <Text style={styles.errorText}>
                Erreur lors du chargement des ingrédients. Veuillez réessayer.
              </Text>
            </View>
          </Card.Content>
        </Card>
      );
    }
    
    if (!dish.dishProducts || dish.dishProducts.length === 0) {
      return (
        <Card style={styles.ingredientsCard}>
          <Card.Content>
            <Text style={styles.noIngredientsText}>
              Aucun ingrédient disponible
            </Text>
          </Card.Content>
        </Card>
      );
    }

    return (
      <Card style={styles.ingredientsCard}>
        <Card.Content>
          <Text style={styles.ingredientsTitle}>Ingrédients:</Text>
          <View style={styles.ingredientsList}>
            {dish.dishProducts.map((product, index) => (
              <Chip
                key={`${product.productId}-${index}`}
                style={styles.ingredientChip}
                icon={product.removable ? "minus-circle-outline" : "check-circle-outline"}
                mode="outlined"
                onPress={() => {
                  if (individualMode && selectedCustomDishIndex !== null && product.removable) {
                    toggleRemovedIngredient(selectedCustomDishIndex, product.productName);
                  } else if (!individualMode && product.removable) {
                    // En mode commun, afficher un message d'information
                    Alert.alert(
                      "Personnalisation individuelle nécessaire",
                      "Pour retirer des ingrédients, activez le mode de personnalisation individuelle.",
                      [{ text: "OK" }]
                    );
                  }
                }}
              >
                {product.productName} {product.quantity > 0 ? `(${product.quantity} ${product.unitOfMeasure})` : ''}
              </Chip>
            ))}
          </View>
          {individualMode && selectedCustomDishIndex !== null && (
            <View style={styles.removedIngredientsSection}>
              <Text style={styles.removedIngredientsTitle}>Ingrédients retirés:</Text>
              {customizedDishes[selectedCustomDishIndex].removedIngredients.length > 0 ? (
                <View style={styles.removedIngredientsList}>
                  {customizedDishes[selectedCustomDishIndex].removedIngredients.map((ingredient, index) => (
                    <Chip
                      key={index}
                      style={styles.removedIngredientChip}
                      icon="close"
                      mode="outlined"
                      onClose={() => toggleRemovedIngredient(selectedCustomDishIndex, ingredient)}
                    >
                      {ingredient}
                    </Chip>
                  ))}
                </View>
              ) : (
                <Text style={styles.noRemovedIngredientsText}>Aucun ingrédient retiré</Text>
              )}
            </View>
          )}
        </Card.Content>
      </Card>
    );
  };

  // Rendu de la section de personnalisation individuelle
  const renderIndividualCustomization = () => {
    if (!individualMode) return null;

    return (
      <Card style={styles.individualCard}>
        <Card.Content>
          <Text style={styles.individualTitle}>Personnalisation individuelle</Text>
          
          <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.dishSelector}>
            {customizedDishes.map((customDish, index) => {
              const isSelected = selectedCustomDishIndex === index;
              const hasCustomization = customDish.notes.trim() !== '' || customDish.removedIngredients.length > 0;
              
              return (
                <TouchableOpacity
                  key={index}
                  style={[
                    styles.dishSelectorItem,
                    isSelected ? styles.selectedDishSelectorItem : null
                  ]}
                  onPress={() => selectCustomDish(index)}
                >
                  <Text style={[styles.dishSelectorText, isSelected ? styles.selectedDishSelectorText : null]}>
                    {dish.name} #{customDish.id}
                  </Text>
                  {hasCustomization && (
                    <Badge size={16} style={styles.customizationBadge} />
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>
          
          {selectedCustomDishIndex !== null && (
            <View style={styles.individualNoteContainer}>
              <Text style={styles.individualNoteLabel}>
                Note pour {dish.name} #{customizedDishes[selectedCustomDishIndex].id}:
              </Text>
              <TextInput
                mode="outlined"
                multiline
                numberOfLines={2}
                placeholder="Ex: Sans sauce, cuisson à point..."
                value={customizedDishes[selectedCustomDishIndex].notes}
                onChangeText={(text) => updateCustomDishNote(selectedCustomDishIndex, text)}
                style={styles.individualNoteInput}
              />
              <Button 
                mode="outlined" 
                icon="pot-mix-outline" 
                onPress={() => setIsIngredientModalVisible(true)}
                style={styles.ingredientsButton}
              >
                Modifier les ingrédients
              </Button>
            </View>
          )}
        </Card.Content>
      </Card>
    );
  };

  return (
    <SafeAreaView style={styles.container} edges={['left', 'right']}>
      <Appbar.Header style={styles.appbar}>
        <Appbar.BackAction onPress={() => navigation.goBack()} />
        <Appbar.Content title={`Commander: ${dish.name}`} subtitle={`Table: ${tableName}`} />
      </Appbar.Header>
      
      <ScrollView style={styles.scrollView} contentContainerStyle={styles.scrollContent}>
        {/* Carte du plat avec détails */}
        <Card style={styles.dishCard}>
          <Card.Content>
            <View style={styles.dishHeader}>
              <View style={styles.dishTitleContainer}>
                <Text style={styles.dishTitle}>{dish.name}</Text>
                {dish.categories && dish.categories.length > 0 && (
                  <View style={styles.categoryContainer}>
                    {dish.categories.map((category, index) => (
                      <Chip 
                        key={index}
                        style={styles.categoryChip}
                        mode="outlined"
                      >
                        {category}
                      </Chip>
                    ))}
                  </View>
                )}
              </View>
              <Text style={styles.dishPrice}>
                {dish.price.toFixed(2)} {dish.currency.code}
              </Text>
            </View>
            
            <Divider style={styles.divider} />
            
            {/* Sélecteur de quantité */}
            <View style={styles.quantityContainer}>
              <Text style={styles.quantityLabel}>Quantité:</Text>
              <View style={styles.quantityControls}>
                <IconButton
                  icon="minus"
                  size={20}
                  mode="contained"
                  onPress={() => handleQuantityChange(quantity - 1)}
                  disabled={quantity <= 1}
                  style={styles.quantityButton}
                />
                <Text style={styles.quantityValue}>{quantity}</Text>
                <IconButton
                  icon="plus"
                  size={20}
                  mode="contained"
                  onPress={() => handleQuantityChange(quantity + 1)}
                  style={styles.quantityButton}
                />
              </View>
            </View>
            
            {/* Mode de personnalisation */}
            <View style={styles.customizationModeContainer}>
              <Text style={styles.customizationModeLabel}>Mode de personnalisation:</Text>
              <View style={styles.customizationModeButtons}>
                <Button
                  mode={!individualMode ? "contained" : "outlined"}
                  onPress={() => setIndividualMode(false)}
                  style={styles.modeButton}
                >
                  Commune
                </Button>
                <Button
                  mode={individualMode ? "contained" : "outlined"}
                  onPress={toggleIndividualMode}
                  style={styles.modeButton}
                >
                  Individuelle
                </Button>
              </View>
            </View>
          </Card.Content>
        </Card>
        
        {/* Note commune (visible uniquement en mode commun) */}
        {!individualMode && (
          <Card style={styles.noteCard}>
            <Card.Content>
              <Text style={styles.noteTitle}>Note pour tous les {quantity} plats:</Text>
              <TextInput
                mode="outlined"
                multiline
                numberOfLines={3}
                placeholder="Ex: Sans sauce, cuisson à point..."
                value={commonNote}
                onChangeText={setCommonNote}
                style={styles.noteInput}
              />
              {quantity > 1 && commonNote.trim() !== '' && (
                <View style={styles.warningContainer}>
                  <Icon name="alert-circle-outline" size={18} color={theme.colors.error} style={styles.warningIcon} />
                  <Text style={styles.warningText}>
                    Cette note s'appliquera aux {quantity} exemplaires de ce plat.
                  </Text>
                </View>
              )}
            </Card.Content>
          </Card>
        )}
        
        {/* Personnalisation individuelle (visible uniquement en mode individuel) */}
        {renderIndividualCustomization()}
        
        {/* Liste des ingrédients */}
        {renderIngredientsList()}
        
        {/* Résumé et boutons d'action */}
        <Surface style={styles.summaryContainer}>
          <View style={styles.totalContainer}>
            <Text style={styles.totalLabel}>Total:</Text>
            <Text style={styles.totalValue}>
              {(dish.price * quantity).toFixed(2)} {dish.currency.code}
            </Text>
          </View>
          
          <Button
            mode="contained"
            icon="cart-plus"
            onPress={addToOrder}
            style={styles.addButton}
            contentStyle={styles.addButtonContent}
            labelStyle={styles.addButtonLabel}
          >
            Ajouter à la commande
          </Button>
        </Surface>
      </ScrollView>
      
      {/* Modal de gestion des ingrédients */}
      <Portal>
        <Modal
          visible={isIngredientModalVisible}
          onDismiss={() => setIsIngredientModalVisible(false)}
          contentContainerStyle={styles.ingredientModal}
        >
          <Text style={styles.modalTitle}>Modifier les ingrédients</Text>
          <Divider style={styles.modalDivider} />
          
          {isLoading ? (
            <View style={styles.modalLoadingContainer}>
              <ActivityIndicator size="large" color={theme.colors.primary} />
              <Text style={styles.loadingText}>Chargement des ingrédients...</Text>
            </View>
          ) : dish.dishProducts && selectedCustomDishIndex !== null ? (
            <>
              {dish.dishProducts.filter(product => product.removable).length === 0 ? (
                <View style={styles.modalEmptyContainer}>
                  <Icon name="information-outline" size={32} color={theme.colors.primary} />
                  <Text style={styles.modalEmptyText}>
                    Aucun ingrédient modifiable disponible pour ce plat.
                  </Text>
                </View>
              ) : (
                <>
                  <ScrollView style={styles.modalScrollView}>
                    {dish.dishProducts
                      .filter(product => product.removable)
                      .map((product, index) => {
                        const isRemoved = customizedDishes[selectedCustomDishIndex].removedIngredients.includes(product.productName);
                        return (
                          <TouchableOpacity 
                            key={index}
                            style={[
                              styles.ingredientItem,
                              isRemoved ? styles.removedIngredientItem : null
                            ]}
                            onPress={() => toggleRemovedIngredient(selectedCustomDishIndex, product.productName)}
                          >
                            <View style={styles.ingredientItemContent}>
                              <Text style={[
                                styles.ingredientName,
                                isRemoved ? styles.removedIngredientText : null
                              ]}>
                                {product.productName}
                              </Text>
                              {product.quantity > 0 && (
                                <Text style={styles.ingredientQuantity}>
                                  {product.quantity} {product.unitOfMeasure}
                                </Text>
                              )}
                            </View>
                            <IconButton
                              icon={isRemoved ? "plus" : "minus"}
                              size={20}
                              iconColor={isRemoved ? theme.colors.primary : theme.colors.error}
                              onPress={() => toggleRemovedIngredient(selectedCustomDishIndex, product.productName)}
                            />
                          </TouchableOpacity>
                        );
                      })}
                  </ScrollView>
                  
                  <Divider style={styles.modalDivider} />
                </>
              )}
              
              <View style={styles.modalActions}>
                <Button 
                  mode="outlined" 
                  onPress={() => setIsIngredientModalVisible(false)}
                >
                  Fermer
                </Button>
              </View>
            </>
          ) : (
            <View style={styles.modalEmptyContainer}>
              <Icon name="alert-circle-outline" size={32} color={theme.colors.error} />
              <Text style={styles.modalErrorText}>
                Une erreur s'est produite lors du chargement des ingrédients.
              </Text>
            </View>
          )}
        </Modal>
      </Portal>
    </SafeAreaView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: '#F5F7FA',
  },
  appbar: {
    elevation: 4,
  },
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    padding: 16,
    paddingBottom: 32,
  },
  loadingContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  loadingText: {
    marginTop: 12,
    fontSize: 16,
    color: '#666',
  },
  errorContainer: {
    alignItems: 'center',
    padding: 16,
    backgroundColor: '#FFEBEE',
    borderRadius: 8,
  },
  errorText: {
    marginTop: 8,
    color: '#D32F2F',
    textAlign: 'center',
  },
  
  // Carte du plat
  dishCard: {
    marginBottom: 16,
    elevation: 2,
  },
  dishHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  dishTitleContainer: {
    flex: 1,
  },
  dishTitle: {
    fontSize: 20,
    fontWeight: 'bold',
    marginBottom: 4,
  },
  categoryContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 4,
  },
  categoryChip: {
    marginRight: 8,
    marginBottom: 8,
    height: 30,
  },
  dishPrice: {
    fontSize: 18,
    fontWeight: 'bold',
    color: '#4CAF50',
  },
  divider: {
    marginVertical: 12,
  },
  
  // Sélecteur de quantité
  quantityContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 16,
  },
  quantityLabel: {
    fontSize: 16,
    fontWeight: '600',
    marginRight: 16,
  },
  quantityControls: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  quantityButton: {
    margin: 0,
  },
  quantityValue: {
    fontSize: 18,
    fontWeight: 'bold',
    marginHorizontal: 12,
    minWidth: 24,
    textAlign: 'center',
  },
  
  // Mode de personnalisation
  customizationModeContainer: {
    marginBottom: 8,
  },
  customizationModeLabel: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  customizationModeButtons: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  modeButton: {
    flex: 1,
    marginHorizontal: 4,
  },
  
  // Note commune
  noteCard: {
    marginBottom: 16,
    elevation: 2,
  },
  noteTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 8,
  },
  noteInput: {
    marginBottom: 8,
  },
  warningContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFF8E1',
    borderRadius: 8,
    padding: 8,
    marginTop: 8,
  },
  warningIcon: {
    marginRight: 8,
  },
  warningText: {
    flex: 1,
    fontSize: 14,
    color: '#FF8F00',
  },
  
  // Personnalisation individuelle
  individualCard: {
    marginBottom: 16,
    elevation: 2,
  },
  individualTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  dishSelector: {
    flexDirection: 'row',
    marginBottom: 12,
  },
  dishSelectorItem: {
    paddingVertical: 10,
    paddingHorizontal: 16,
    borderRadius: 8,
    marginRight: 8,
    backgroundColor: '#F5F5F5',
    minWidth: 120,
    justifyContent: 'center',
    alignItems: 'center',
    position: 'relative',
  },
  selectedDishSelectorItem: {
    backgroundColor: '#E3F2FD',
    borderWidth: 2,
    borderColor: '#2196F3',
  },
  dishSelectorText: {
    fontWeight: '500',
  },
  selectedDishSelectorText: {
    fontWeight: 'bold',
    color: '#2196F3',
  },
  customizationBadge: {
    position: 'absolute',
    top: -5,
    right: -5,
    backgroundColor: '#FF9800',
  },
  individualNoteContainer: {
    marginTop: 8,
  },
  individualNoteLabel: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 8,
  },
  individualNoteInput: {
    marginBottom: 12,
  },
  ingredientsButton: {
    marginTop: 4,
  },
  
  // Ingrédients
  ingredientsCard: {
    marginBottom: 16,
    elevation: 2,
  },
  ingredientsTitle: {
    fontSize: 16,
    fontWeight: '600',
    marginBottom: 12,
  },
  ingredientsList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  ingredientChip: {
    marginRight: 8,
    marginBottom: 8,
    height: 36,
  },
  noIngredientsText: {
    fontStyle: 'italic',
    opacity: 0.7,
    textAlign: 'center',
    marginVertical: 12,
  },
  removedIngredientsSection: {
    marginTop: 16,
    paddingTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#E0E0E0',
  },
  removedIngredientsTitle: {
    fontSize: 14,
    fontWeight: '500',
    marginBottom: 8,
    color: '#D32F2F',
  },
  removedIngredientsList: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  removedIngredientChip: {
    marginRight: 8,
    marginBottom: 8,
    backgroundColor: '#FFEBEE',
    borderColor: '#FFCDD2',
  },
  noRemovedIngredientsText: {
    fontStyle: 'italic',
    opacity: 0.7,
  },
  
  // Résumé et boutons d'action
  summaryContainer: {
    padding: 16,
    borderRadius: 8,
    elevation: 4,
  },
  totalContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 16,
  },
  totalLabel: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  totalValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#4CAF50',
  },
  addButton: {
    height: 50,
    justifyContent: 'center',
  },
  addButtonContent: {
    height: 50,
  },
  addButtonLabel: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  
  // Modal d'ingrédients
  ingredientModal: {
    backgroundColor: 'white',
    borderRadius: 12,
    margin: 20,
    padding: 0,
    overflow: 'hidden',
    maxHeight: '80%',
  },
  modalTitle: {
    fontSize: 18,
    fontWeight: 'bold',
    padding: 16,
    textAlign: 'center',
  },
  modalDivider: {
    height: 1,
  },
  modalScrollView: {
    maxHeight: 400,
  },
  ingredientItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
  },
  ingredientItemContent: {
    flex: 1,
  },
  ingredientName: {
    fontSize: 16,
  },
  ingredientQuantity: {
    fontSize: 14,
    opacity: 0.7,
    marginTop: 2,
  },
  removedIngredientItem: {
    backgroundColor: '#FFEBEE',
  },
  removedIngredientText: {
    textDecorationLine: 'line-through',
    color: '#D32F2F',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'center',
    padding: 16,
  },
  modalEmptyText: {
    textAlign: 'center',
    padding: 8,
    fontStyle: 'italic',
    opacity: 0.7,
  },
  modalErrorText: {
    textAlign: 'center',
    padding: 8,
    color: '#D32F2F',
  },
  modalLoadingContainer: {
    padding: 32,
    alignItems: 'center',
  },
  modalEmptyContainer: {
    padding: 24,
    alignItems: 'center',
  },
});