// src/components/server/OrderCart.tsx
import React, { useState, useEffect } from 'react';
import { View, StyleSheet, ScrollView, TouchableOpacity, Alert } from 'react-native';
import { Surface, Text, Card, Title, Paragraph, Button, IconButton, Badge, Divider, Chip, Portal, Modal, TextInput, useTheme, ActivityIndicator } from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useCart, CartItem, CartItemCustomization, CartMode } from '../../contexts/CartContext';import orderService, { CreateOrderItemRequest, CreateOrderRequest, UpdateOrderRequest } from '../../api/orderService';
import currencyService from '../../api/currencyService';
import { useAuth } from '../../contexts/AuthContext';

interface OrderCartProps {
  onFinishOrder: () => void;
  onCancelOrder: () => void;
}

export const OrderCart: React.FC<OrderCartProps> = ({ onFinishOrder, onCancelOrder }) => {
  const theme = useTheme();
  const { user } = useAuth();
  const { 
    items, 
    itemCount, 
    totalAmount, 
    currency, 
    removeItem, 
    updateItem, 
    clearCart, 
    resetCart,
    tableName, 
    tableId,
    mode,
    currentOrderId,
    existingOrder
  } = useCart();
  
  // États locaux
  const [expanded, setExpanded] = useState(false);
  const [editingItem, setEditingItem] = useState<CartItem | null>(null);
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editNotes, setEditNotes] = useState('');
  const [editQuantity, setEditQuantity] = useState(1);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  
  // Basculer l'expansion du panier
  const toggleExpanded = () => {
    setExpanded(!expanded);
  };
  
  // Ouvrir le modal d'édition pour un élément
  const openEditModal = (item: CartItem) => {
    setEditingItem(item);
    setEditNotes(item.notes);
    setEditQuantity(item.quantity);
    setEditModalVisible(true);
  };
  
  // Fermer le modal d'édition
  const closeEditModal = () => {
    setEditingItem(null);
    setEditModalVisible(false);
  };
  
  // Enregistrer les modifications d'un élément
  const saveItemChanges = () => {
    if (editingItem) {
      updateItem(editingItem.id, {
        notes: editNotes,
        quantity: editQuantity
      });
      closeEditModal();
    }
  };
  
  // Confirmation de suppression d'un élément
  const confirmRemoveItem = (item: CartItem) => {
    Alert.alert(
      "Supprimer l'article",
      `Êtes-vous sûr de vouloir supprimer ${item.quantity}x ${item.dish.name} du panier ?`,
      [
        { text: "Annuler", style: "cancel" },
        { text: "Supprimer", style: "destructive", onPress: () => removeItem(item.id) }
      ]
    );
  };
  
  // Confirmation de vider le panier
  const confirmClearCart = () => {
    if (items.length === 0) return;
    
    // Message adapté selon le mode
    const message = mode === CartMode.CREATE 
      ? "Êtes-vous sûr de vouloir vider le panier ? Cette action ne peut pas être annulée."
      : "Êtes-vous sûr de vouloir vider les nouveaux articles ? Les articles existants de la commande ne seront pas affectés.";
    
    Alert.alert(
      "Vider le panier",
      message,
      [
        { text: "Annuler", style: "cancel" },
        { 
          text: "Vider", 
          style: "destructive", 
          onPress: () => {
            // En mode ADD, on préserve les informations de commande et de table
            if (mode === CartMode.ADD) {
              clearCart({ 
                preserveMode: true, 
                preserveTableInfo: true, 
                preserveOrderInfo: true 
              });
            } else {
              clearCart(); // Comportement par défaut en mode CREATE
            }
          }
        }
      ]
    );
  };
  
  // Finaliser la commande ou ajouter des articles à une commande existante
  const finalizeOrder = async () => {
    if (items.length === 0) {
      Alert.alert("Erreur", "Votre panier est vide. Veuillez ajouter des articles.");
      return;
    }
    
    if (!tableId) {
      Alert.alert("Erreur", "Aucune table sélectionnée pour cette commande.");
      return;
    }
    
    setIsSubmitting(true);
    setError(null);
    
    try {
      // Préparer les éléments de la commande
      const orderItems: CreateOrderItemRequest[] = items.map(item => ({
        dishId: item.dish.id,
        note: item.notes,
        count: item.quantity
      }));
      
      let result;
      
      if (mode === CartMode.CREATE) {
        // Mode création: créer une nouvelle commande
        
        // Récupérer une devise par défaut si nécessaire
        let currencyId: number;
        if (items.length > 0 && items[0].dish.currency && items[0].dish.currency.id) {
          currencyId = items[0].dish.currency.id;
        } else {
          const defaultCurrency = await currencyService.getDefaultCurrency();
          if (!defaultCurrency) {
            throw new Error("Impossible de déterminer la devise pour cette commande.");
          }
          currencyId = defaultCurrency.id;
        }
        
        // Créer l'objet de demande de commande
        const orderRequest: CreateOrderRequest = {
          tableName: tableName,
          tableId: tableId,
          currencyId,
          orderItems
        };
        
        // Envoyer la commande à l'API
        result = await orderService.createOrder(orderRequest);
        
        // Message de succès
        Alert.alert(
          "Commande créée",
          `Commande #${result.id} créée avec succès.`,
          [
            {
              text: "OK",
              onPress: () => {
                resetCart(); // Réinitialisation complète du panier
                onFinishOrder(); // Retourner à l'écran d'accueil
              }
            }
          ]
        );
      } else if (mode === CartMode.ADD && currentOrderId) {
        // Mode ajout: ajouter des articles à une commande existante
        
        // Créer l'objet de demande de mise à jour
        const updateRequest: UpdateOrderRequest = {
          orderId: currentOrderId,
          orderItems
        };
        
        // Envoyer la mise à jour à l'API
        result = await orderService.addItemsToOrder(updateRequest);
        
        // Message de succès
        Alert.alert(
          "Articles ajoutés",
          `Articles ajoutés avec succès à la commande #${currentOrderId}.`,
          [
            {
              text: "OK",
              onPress: () => {
                resetCart(); // Réinitialisation complète du panier
                onFinishOrder(); // Cette fonction doit nous rediriger vers l'écran d'accueil
              }
            }
          ]
        );
      }
      
      setIsSubmitting(false);
    } catch (err: any) {
      setIsSubmitting(false);
      setError(err.message || "Une erreur s'est produite. Veuillez réessayer.");
      
      Alert.alert(
        "Erreur",
        err.message || "Une erreur s'est produite. Veuillez réessayer.",
        [{ text: "OK" }]
      );
    }
  };
  
  // Confirmation d'annulation de commande
  const confirmCancelOrder = () => {
    if (items.length === 0) {
      // Si le panier est vide, on réinitialise quand même complètement pour sortir du mode ADD
      resetCart();
      onCancelOrder();
      return;
    }
    
    Alert.alert(
      "Annuler la commande",
      `Vous avez des articles dans votre panier. Êtes-vous sûr de vouloir ${mode === CartMode.CREATE ? "annuler cette commande" : "annuler l'ajout d'articles"} ?`,
      [
        { text: "Non", style: "cancel" },
        { text: "Oui, annuler", style: "destructive", onPress: () => {
          resetCart(); // Réinitialisation complète du panier quelle que soit la situation
          onCancelOrder();
        }}
      ]
    );
  };
  
  // Fonction pour formater le prix
  const formatPrice = (price: number) => {
    return `${price.toFixed(2)} ${currency}`;
  };

  // Fonction pour obtenir le titre du panier en fonction du mode
  const getCartTitle = () => {
    if (mode === CartMode.CREATE) {
      return "Panier";
    } else if (mode === CartMode.ADD && currentOrderId) {
      return `Ajout à la commande #${currentOrderId}`;
    }
    return "Panier";
  };

  // Fonction pour obtenir le texte du bouton de finalisation
  const getFinalizeButtonText = () => {
    if (isSubmitting) {
      return mode === CartMode.CREATE ? 'Création en cours...' : 'Ajout en cours...';
    }
    return mode === CartMode.CREATE ? 'Finaliser la commande' : 'Ajouter à la commande';
  };

  return (
    <Surface style={styles.container}>
      {/* En-tête du panier */}
      <TouchableOpacity 
        style={styles.header}
        onPress={toggleExpanded}
        activeOpacity={0.7}
      >
        <View style={styles.headerContent}>
          <View style={styles.titleContainer}>
            <Icon 
              name={mode === CartMode.CREATE ? "cart-outline" : "cart-plus"} 
              size={24} 
              color={theme.colors.primary} 
              style={styles.cartIcon} 
            />
            <Text style={styles.title}>{getCartTitle()}</Text>
            {itemCount > 0 && (
              <Badge style={styles.badge}>{itemCount}</Badge>
            )}
          </View>
          
          <View style={styles.summaryContainer}>
            <Text style={styles.tableText}>
              {tableName ? `Table: ${tableName}` : 'Aucune table sélectionnée'}
            </Text>
            <Text style={styles.totalText}>
              Total: {formatPrice(totalAmount)}
            </Text>
          </View>
        </View>
        
        <Icon 
          name={expanded ? "chevron-up" : "chevron-down"} 
          size={24} 
          color={theme.colors.primary} 
        />
      </TouchableOpacity>
      
      {/* Contenu du panier (affiché uniquement si développé) */}
      {expanded && (
        <View style={styles.content}>
          {/* Affichage des informations de la commande existante en mode ajout */}
          {mode === CartMode.ADD && existingOrder && (
            <Card style={styles.existingOrderCard}>
              <Card.Content>
                <View style={styles.existingOrderHeader}>
                  <Text style={styles.existingOrderTitle}>Commande #{existingOrder.id}</Text>
                  <Text style={styles.existingOrderPrice}>
                    {existingOrder.totalPrice.toFixed(2)} {existingOrder.currency.code}
                  </Text>
                </View>
                <Text style={styles.existingOrderInfo}>
                  {existingOrder.items.length} articles • {new Date(existingOrder.orderDate).toLocaleString()}
                </Text>
                <View style={styles.chipContainer}>
                  {existingOrder.items.slice(0, 3).map((item, index) => (
                    <Chip 
                      key={index}
                      style={styles.orderItemChip}
                    >
                      {item.count}x {item.dishName}
                    </Chip>
                  ))}
                  {existingOrder.items.length > 3 && (
                    <Chip style={styles.orderItemChip}>
                      +{existingOrder.items.length - 3} autres
                    </Chip>
                  )}
                </View>
              </Card.Content>
            </Card>
          )}
          
          {items.length === 0 ? (
            <View style={styles.emptyCart}>
              <Icon name="cart-off" size={48} color="#999" />
              <Text style={styles.emptyText}>
                Votre panier est vide
              </Text>
              <Text style={styles.emptySubtext}>
                {mode === CartMode.CREATE 
                  ? "Ajoutez des plats pour créer une commande" 
                  : "Ajoutez des plats à la commande existante"}
              </Text>
            </View>
          ) : (
            <>
              <ScrollView style={styles.itemsList}>
                {items.map((item) => (
                  <Card key={item.id} style={styles.itemCard}>
                    <Card.Content style={styles.itemContent}>
                      <View style={styles.itemHeader}>
                        <View style={styles.itemTitleContainer}>
                          <Text style={styles.itemTitle}>
                            {item.quantity}x {item.dish.name}
                          </Text>
                          <Text style={styles.itemPrice}>
                            {formatPrice(item.dish.price * item.quantity)}
                          </Text>
                        </View>
                        
                        <View style={styles.itemActions}>
                          <IconButton
                            icon="pencil"
                            size={20}
                            onPress={() => openEditModal(item)}
                            style={styles.actionButton}
                          />
                          <IconButton
                            icon="delete"
                            size={20}
                            onPress={() => confirmRemoveItem(item)}
                            style={styles.actionButton}
                          />
                        </View>
                      </View>
                      
                      {item.notes && (
                        <View style={styles.notesContainer}>
                          <Text style={styles.notesLabel}>Note:</Text>
                          <Text style={styles.notesText}>{item.notes}</Text>
                        </View>
                      )}
                      
                      {item.removedIngredients.length > 0 && (
                        <View style={styles.removedContainer}>
                          <Text style={styles.removedLabel}>Sans:</Text>
                          <View style={styles.chipContainer}>
                            {item.removedIngredients.map((ingredient, index) => (
                              <Chip 
                                key={index} 
                                style={styles.ingredientChip}
                                textStyle={styles.chipText}
                              >
                                {ingredient}
                              </Chip>
                            ))}
                          </View>
                        </View>
                      )}
                      
                      {item.individualItems && item.individualItems.length > 0 && (
                        <View style={styles.individualContainer}>
                          <Text style={styles.individualLabel}>
                            Personnalisations individuelles:
                          </Text>
                          {item.individualItems.map((custom, index) => (
                            <View key={index} style={styles.individualItem}>
                              <Text style={styles.individualTitle}>
                                {item.dish.name} #{index + 1}:
                              </Text>
                              {custom.notes && (
                                <Text style={styles.individualNotes}>
                                  Note: {custom.notes}
                                </Text>
                              )}
                              {custom.removedIngredients.length > 0 && (
                                <View style={styles.individualRemoved}>
                                  <Text style={styles.individualRemovedLabel}>Sans:</Text>
                                  <View style={styles.chipContainer}>
                                    {custom.removedIngredients.map((ing, idx) => (
                                      <Chip 
                                        key={idx} 
                                        style={styles.ingredientChip}
                                        textStyle={styles.chipText}
                                      >
                                        {ing}
                                      </Chip>
                                    ))}
                                  </View>
                                </View>
                              )}
                            </View>
                          ))}
                        </View>
                      )}
                    </Card.Content>
                  </Card>
                ))}
              </ScrollView>
              
              <Divider style={styles.divider} />
              
              <View style={styles.summary}>
                <View style={styles.summaryRow}>
                  <Text style={styles.summaryLabel}>Sous-total:</Text>
                  <Text style={styles.summaryValue}>{formatPrice(totalAmount)}</Text>
                </View>
                {/* D'autres lignes de récapitulatif pourraient être ajoutées ici (taxes, remises, etc.) */}
                <View style={styles.summaryRow}>
                  <Text style={styles.totalLabel}>Total:</Text>
                  <Text style={styles.totalValue}>{formatPrice(totalAmount)}</Text>
                </View>
              </View>
              
              <View style={styles.buttonsContainer}>
                <Button 
                  mode="outlined" 
                  onPress={confirmClearCart}
                  style={styles.clearButton}
                  disabled={isSubmitting}
                >
                  Vider le panier
                </Button>
                <Button 
                  mode="contained" 
                  onPress={finalizeOrder}
                  style={styles.orderButton}
                  icon={mode === CartMode.CREATE ? "check" : "plus"}
                  loading={isSubmitting}
                  disabled={isSubmitting}
                >
                  {getFinalizeButtonText()}
                </Button>
              </View>
              
              {error && (
                <View style={styles.errorContainer}>
                  <Icon name="alert-circle" size={20} color={theme.colors.error} />
                  <Text style={styles.errorText}>{error}</Text>
                </View>
              )}
            </>
          )}
          
          <Button 
            mode="text" 
            onPress={confirmCancelOrder}
            style={styles.cancelButton}
            icon="close"
            disabled={isSubmitting}
          >
            Annuler
          </Button>
        </View>
      )}
      
      {/* Modal d'édition d'un élément */}
      <Portal>
        <Modal
          visible={editModalVisible}
          onDismiss={closeEditModal}
          contentContainerStyle={styles.modal}
        >
          {editingItem && (
            <>
              <Title style={styles.modalTitle}>Modifier l'article</Title>
              <Divider style={styles.modalDivider} />
              
              <View style={styles.modalContent}>
                <Text style={styles.dishName}>{editingItem.dish.name}</Text>
                
                <View style={styles.quantityContainer}>
                  <Text style={styles.quantityLabel}>Quantité:</Text>
                  <View style={styles.quantityControls}>
                    <IconButton
                      icon="minus"
                      size={20}
                      mode="contained"
                      onPress={() => setEditQuantity(prev => Math.max(1, prev - 1))}
                      disabled={editQuantity <= 1}
                    />
                    <Text style={styles.quantityValue}>{editQuantity}</Text>
                    <IconButton
                      icon="plus"
                      size={20}
                      mode="contained"
                      onPress={() => setEditQuantity(prev => prev + 1)}
                    />
                  </View>
                </View>
                
                <TextInput
                  label="Notes"
                  value={editNotes}
                  onChangeText={setEditNotes}
                  mode="outlined"
                  multiline
                  numberOfLines={3}
                  style={styles.notesInput}
                />
                
                {editingItem.individualItems && editingItem.individualItems.length > 0 && (
                  <View style={styles.warningContainer}>
                    <Icon name="alert-circle-outline" size={20} color="#FF9800" />
                    <Text style={styles.warningText}>
                      Cet article contient des personnalisations individuelles qui ne peuvent pas être modifiées ici.
                    </Text>
                  </View>
                )}
                
                <View style={styles.modalActions}>
                  <Button onPress={closeEditModal} style={styles.modalButton}>
                    Annuler
                  </Button>
                  <Button mode="contained" onPress={saveItemChanges} style={styles.modalButton}>
                    Enregistrer
                  </Button>
                </View>
              </View>
            </>
          )}
        </Modal>
      </Portal>
    </Surface>
  );
};

const styles = StyleSheet.create({
  container: {
    margin: 16,
    borderRadius: 8,
    overflow: 'hidden',
    elevation: 4,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    padding: 16,
    backgroundColor: '#F5F5F5',
  },
  headerContent: {
    flex: 1,
  },
  titleContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  cartIcon: {
    marginRight: 8,
  },
  title: {
    fontSize: 18,
    fontWeight: 'bold',
  },
  badge: {
    marginLeft: 8,
  },
  summaryContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: 4,
  },
  tableText: {
    fontSize: 14,
    opacity: 0.7,
  },
  totalText: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  content: {
    padding: 16,
    backgroundColor: 'white',
  },
  existingOrderCard: {
    marginBottom: 16,
    backgroundColor: '#F9FAFE',
  },
  existingOrderHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 4,
  },
  existingOrderTitle: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  existingOrderPrice: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#4CAF50',
  },
  existingOrderInfo: {
    fontSize: 14,
    opacity: 0.7,
    marginBottom: 8,
  },
  orderItemChip: {
    marginRight: 4,
    marginBottom: 4,
    backgroundColor: '#E3F2FD',
  },
  emptyCart: {
    alignItems: 'center',
    padding: 24,
  },
  emptyText: {
    fontSize: 16,
    fontWeight: 'bold',
    marginTop: 16,
  },
  emptySubtext: {
    fontSize: 14,
    opacity: 0.7,
    marginTop: 8,
    textAlign: 'center',
  },
  itemsList: {
    maxHeight: 300,
  },
  itemCard: {
    marginBottom: 12,
  },
  itemContent: {
    padding: 8,
  },
  itemHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'flex-start',
  },
  itemTitleContainer: {
    flex: 1,
  },
  itemTitle: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  itemPrice: {
    fontSize: 14,
    fontWeight: 'bold',
    marginTop: 4,
  },
  itemActions: {
    flexDirection: 'row',
  },
  actionButton: {
    margin: 0,
  },
  notesContainer: {
    marginTop: 8,
  },
  notesLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    opacity: 0.7,
  },
  notesText: {
    fontSize: 14,
    fontStyle: 'italic',
  },
  removedContainer: {
    marginTop: 8,
  },
  removedLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    opacity: 0.7,
  },
  chipContainer: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    marginTop: 4,
  },
  ingredientChip: {
    marginRight: 4,
    marginBottom: 4,
    height: 28,
  },
  chipText: {
    fontSize: 12,
  },
  individualContainer: {
    marginTop: 12,
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
    paddingTop: 8,
  },
  individualLabel: {
    fontSize: 14,
    fontWeight: 'bold',
    marginBottom: 8,
  },
  individualItem: {
    backgroundColor: '#F9F9F9',
    borderRadius: 4,
    padding: 8,
    marginBottom: 8,
  },
  individualTitle: {
    fontSize: 14,
    fontWeight: 'bold',
  },
  individualNotes: {
    fontSize: 12,
    fontStyle: 'italic',
    marginTop: 4,
  },
  individualRemoved: {
    marginTop: 4,
  },
  individualRemovedLabel: {
    fontSize: 12,
    fontWeight: 'bold',
    opacity: 0.7,
  },
  divider: {
    marginVertical: 12,
  },
  summary: {
    marginBottom: 16,
  },
  summaryRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 8,
  },
  summaryLabel: {
    fontSize: 14,
  },
  summaryValue: {
    fontSize: 14,
  },
  totalLabel: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  totalValue: {
    fontSize: 16,
    fontWeight: 'bold',
  },
  buttonsContainer: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  clearButton: {
    flex: 1,
    marginRight: 8,
  },
  orderButton: {
    flex: 2,
  },
  cancelButton: {
    alignSelf: 'center',
  },
  errorContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#FFEBEE',
    padding: 12,
    borderRadius: 4,
    marginBottom: 12,
  },
  errorText: {
    flex: 1,
    marginLeft: 8,
    fontSize: 14,
    color: '#D32F2F',
  },
  // Styles pour le modal
  modal: {
    backgroundColor: 'white',
    margin: 20,
    borderRadius: 8,
    padding: 0,
    overflow: 'hidden',
  },
  modalTitle: {
    textAlign: 'center',
    padding: 16,
  },
  modalDivider: {
    height: 1,
  },
  modalContent: {
    padding: 16,
  },
  dishName: {
    fontSize: 18,
    fontWeight: 'bold',
    marginBottom: 16,
  },
  quantityContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: 16,
  },
  quantityLabel: {
    fontSize: 16,
  },
  quantityControls: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  quantityValue: {
    fontSize: 18,
    fontWeight: 'bold',
    marginHorizontal: 16,
    minWidth: 24,
    textAlign: 'center',
  },
  notesInput: {
    marginBottom: 16,
  },
  warningContainer: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    backgroundColor: '#FFF8E1',
    padding: 12,
    borderRadius: 4,
    marginBottom: 16,
  },
  warningText: {
    flex: 1,
    marginLeft: 8,
    fontSize: 14,
    color: '#F57C00',
  },
  modalActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
  },
  modalButton: {
    marginLeft: 8,
  },
});