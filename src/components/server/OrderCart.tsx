// src/components/server/OrderCart.tsx

import React, { useState, useCallback } from 'react';
import { View, StyleSheet, ScrollView, Alert } from 'react-native';
import { 
  Surface, 
  Text, 
  IconButton, 
  Button, 
  useTheme,
  Divider,
  Badge,
  ActivityIndicator,
  Snackbar
} from 'react-native-paper';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';
import { useCart, CartMode } from '../../contexts/CartContext';
import { useAuth } from '../../contexts/AuthContext';
import { usePrintManager } from '../../hooks/usePrintManager';
import orderService from '../../api/orderService';

interface OrderCartProps {
  onFinishOrder: () => void;
  onCancelOrder: () => void;
}

export const OrderCart: React.FC<OrderCartProps> = ({ onFinishOrder, onCancelOrder }) => {
  const theme = useTheme();
  const { user } = useAuth();
  const { 
    items, 
    tableId, 
    tableName, 
    mode, 
    currentOrderId,
    existingOrder,
    removeItem, 
    clearCart,
    resetCart,
    itemCount, 
    totalAmount, 
    currency 
  } = useCart();
  
  // Service d'impression
  const { 
    printKitchenOrder, 
    isInitialized: isPrintServiceReady,
    printers 
  } = usePrintManager();
  
  const [isExpanded, setIsExpanded] = useState(false);
  const [isProcessing, setIsProcessing] = useState(false);
  const [snackbarMessage, setSnackbarMessage] = useState('');
  const [snackbarVisible, setSnackbarVisible] = useState(false);
  
  // Basculer l'affichage du panier
  const toggleExpanded = () => {
    setIsExpanded(!isExpanded);
  };
  
  // Supprimer un article du panier
  const handleRemoveItem = (itemId: string) => {
    removeItem(itemId);
  };
  
  // Vider le panier
  const handleClearCart = () => {
    Alert.alert(
      'Vider le panier',
      'Voulez-vous vraiment vider le panier?',
      [
        { text: 'Annuler', style: 'cancel' },
        { 
          text: 'Vider', 
          style: 'destructive',
          onPress: () => {
            if (mode === CartMode.ADD) {
              // En mode ajout, on garde les infos de la commande
              clearCart({ preserveMode: true, preserveTableInfo: true, preserveOrderInfo: true });
            } else {
              clearCart();
            }
          }
        }
      ]
    );
  };
  
  // Finaliser la commande
  const handleFinishOrder = async () => {
    if (items.length === 0) {
      Alert.alert('Panier vide', 'Ajoutez des articles avant de finaliser la commande.');
      return;
    }
    
    if (!tableId) {
      Alert.alert('Table non sélectionnée', 'Veuillez sélectionner une table.');
      return;
    }
    
    setIsProcessing(true);
    
    try {
      let createdOrder;
      let newItems = [];
      
      if (mode === CartMode.CREATE) {
        // Création d'une nouvelle commande
        const orderData = {
          tableId,
          tableName: tableName || '',
          currencyId: 1, // À adapter selon votre système
          orderItems: items.map(item => ({
            dishId: item.dish.id,
            note: item.notes || '',
            count: item.quantity
          }))
        };
        
        createdOrder = await orderService.createOrder(orderData);
        newItems = createdOrder.items; // Tous les items sont nouveaux
        
        setSnackbarMessage(`Commande #${createdOrder.id} créée avec succès`);
        
      } else if (mode === CartMode.ADD && currentOrderId) {
        // Ajout à une commande existante
        const updateData = {
          orderId: currentOrderId,
          orderItems: items.map(item => ({
            dishId: item.dish.id,
            note: item.notes || '',
            count: item.quantity,
            unitPrice: item.dish.price
          }))
        };
        
        createdOrder = await orderService.addItemsToOrder(updateData);
        
        // Identifier les nouveaux items ajoutés (les derniers dans la liste)
        const previousItemCount = existingOrder?.items.length || 0;
        newItems = createdOrder.items.slice(previousItemCount);
        
        setSnackbarMessage(`Articles ajoutés à la commande #${currentOrderId}`);
      }
      
      // Impression automatique en cuisine si configurée
      if (isPrintServiceReady && createdOrder && newItems.length > 0) {
        try {
          // Vérifier s'il y a des imprimantes cuisine/bar configurées
          const kitchenPrinters = printers.filter(p => 
            p.isEnabled && (p.type === 'KITCHEN' || p.type === 'BAR')
          );
          
          if (kitchenPrinters.length > 0) {
            console.log('[OrderCart] Sending order to kitchen printers...');
            
            // Imprimer la commande en cuisine (routage automatique par catégorie)
            const printResults = await printKitchenOrder(createdOrder, newItems);
            
            const successCount = printResults.filter(r => r.success).length;
            const failCount = printResults.length - successCount;
            
            if (failCount > 0) {
              setSnackbarMessage(
                `Commande créée. ${successCount} impression(s) réussie(s), ${failCount} échec(s).`
              );
            } else if (successCount > 0) {
              console.log(`[OrderCart] ${successCount} kitchen tickets printed successfully`);
            }
          } else {
            console.log('[OrderCart] No kitchen printers configured, skipping automatic printing');
          }
        } catch (printError) {
          console.error('[OrderCart] Kitchen printing error:', printError);
          // Ne pas bloquer la commande si l'impression échoue
          setSnackbarMessage('Commande créée. Erreur d\'impression cuisine (en file d\'attente).');
        }
      }
      
      // Réinitialiser le panier
      resetCart();
      
      // Afficher le snackbar
      setSnackbarVisible(true);
      
      // Appeler le callback de fin
      setTimeout(() => {
        onFinishOrder();
      }, 500);
      
    } catch (error: any) {
      console.error('Error creating/updating order:', error);
      Alert.alert(
        'Erreur',
        error.message || 'Une erreur est survenue lors de la création de la commande.',
        [{ text: 'OK' }]
      );
    } finally {
      setIsProcessing(false);
    }
  };
  
  // Obtenir le texte du bouton selon le mode
  const getActionButtonText = () => {
    if (isProcessing) return 'Traitement...';
    if (mode === CartMode.ADD) return 'Ajouter à la commande';
    return 'Créer la commande';
  };
  
  return (
    <>
      <Surface style={styles.container}>
        {/* En-tête du panier */}
        <TouchableOpacity onPress={toggleExpanded} activeOpacity={0.7}>
          <View style={styles.header}>
            <View style={styles.headerLeft}>
              <Icon name="cart" size={24} color={theme.colors.primary} />
              <Text style={styles.title}>
                {mode === CartMode.ADD ? 'Ajout à la commande' : 'Panier'}
              </Text>
              {itemCount > 0 && (
                <Badge style={styles.badge}>{itemCount}</Badge>
              )}
            </View>
            <View style={styles.headerRight}>
              {itemCount > 0 && (
                <Text style={styles.total}>{totalAmount.toFixed(2)} {currency}</Text>
              )}
              <IconButton
                icon={isExpanded ? "chevron-up" : "chevron-down"}
                size={20}
                onPress={toggleExpanded}
              />
            </View>
          </View>
        </TouchableOpacity>
        
        {/* Contenu du panier (expandable) */}
        {isExpanded && (
          <>
            <Divider />
            
            {items.length === 0 ? (
              <View style={styles.emptyCart}>
                <Icon name="cart-off" size={32} color={theme.colors.disabled} />
                <Text style={styles.emptyText}>
                  {mode === CartMode.ADD ? 'Aucun article à ajouter' : 'Panier vide'}
                </Text>
              </View>
            ) : (
              <>
                <ScrollView style={styles.itemsList} showsVerticalScrollIndicator={true}>
                  {items.map((item) => (
                    <View key={item.id} style={styles.cartItem}>
                      <View style={styles.itemInfo}>
                        <Text style={styles.itemName}>{item.quantity}x {item.dish.name}</Text>
                        {item.notes && (
                          <Text style={styles.itemNote}>Note: {item.notes}</Text>
                        )}
                        <Text style={styles.itemPrice}>
                          {(item.dish.price * item.quantity).toFixed(2)} {item.dish.currency.code}
                        </Text>
                      </View>
                      <IconButton
                        icon="delete"
                        size={20}
                        onPress={() => handleRemoveItem(item.id)}
                        iconColor={theme.colors.error}
                      />
                    </View>
                  ))}
                </ScrollView>
                
                <Divider />
                
                {/* Actions du panier */}
                <View style={styles.actions}>
                  <Button
                    mode="text"
                    onPress={handleClearCart}
                    textColor={theme.colors.error}
                    disabled={isProcessing}
                  >
                    Vider
                  </Button>
                  
                  <View style={styles.mainActions}>
                    <Button
                      mode="outlined"
                      onPress={onCancelOrder}
                      disabled={isProcessing}
                    >
                      Annuler
                    </Button>
                    
                    <Button
                      mode="contained"
                      onPress={handleFinishOrder}
                      loading={isProcessing}
                      disabled={isProcessing || items.length === 0}
                      icon={mode === CartMode.ADD ? "plus" : "check"}
                    >
                      {getActionButtonText()}
                    </Button>
                  </View>
                </View>
              </>
            )}
          </>
        )}
        
        {/* Résumé minimal quand replié */}
        {!isExpanded && itemCount > 0 && (
          <View style={styles.summary}>
            <Text style={styles.summaryText}>
              {itemCount} article{itemCount > 1 ? 's' : ''} • {totalAmount.toFixed(2)} {currency}
            </Text>
            {mode === CartMode.ADD && (
              <Chip style={styles.modeChip} textStyle={{ fontSize: 11 }}>
                Ajout à #{currentOrderId}
              </Chip>
            )}
          </View>
        )}
      </Surface>
      
      {/* Snackbar pour les notifications */}
      <Snackbar
        visible={snackbarVisible}
        onDismiss={() => setSnackbarVisible(false)}
        duration={3000}
        style={{ backgroundColor: theme.colors.success }}
      >
        {snackbarMessage}
      </Snackbar>
    </>
  );
};

const styles = StyleSheet.create({
  container: {
    margin: 12,
    borderRadius: 8,
    elevation: 4,
    backgroundColor: 'white',
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
  },
  headerLeft: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  headerRight: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  title: {
    fontSize: 16,
    fontWeight: 'bold',
    marginLeft: 8,
  },
  badge: {
    marginLeft: 8,
    backgroundColor: '#FF5722',
  },
  total: {
    fontSize: 16,
    fontWeight: 'bold',
    marginRight: 4,
  },
  emptyCart: {
    padding: 24,
    alignItems: 'center',
  },
  emptyText: {
    marginTop: 8,
    opacity: 0.7,
  },
  itemsList: {
    maxHeight: 200,
    padding: 12,
  },
  cartItem: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingVertical: 8,
    borderBottomWidth: 1,
    borderBottomColor: '#f0f0f0',
  },
  itemInfo: {
    flex: 1,
  },
  itemName: {
    fontSize: 14,
    fontWeight: '500',
  },
  itemNote: {
    fontSize: 12,
    fontStyle: 'italic',
    opacity: 0.7,
    marginTop: 2,
  },
  itemPrice: {
    fontSize: 14,
    marginTop: 2,
    color: '#4CAF50',
  },
  actions: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: 12,
  },
  mainActions: {
    flexDirection: 'row',
    gap: 8,
  },
  summary: {
    padding: 8,
    paddingTop: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  summaryText: {
    fontSize: 14,
    opacity: 0.8,
  },
  modeChip: {
    backgroundColor: '#E3F2FD',
    height: 24,
  },
  TouchableOpacity: {
    // Styles pour le TouchableOpacity
  }
});