// src/contexts/CartContext.tsx
import React, { createContext, useState, useContext, useEffect, ReactNode } from 'react';
import { DomainDish } from '../api/dishService';
import { DomainOrder, DomainOrderItem } from '../api/orderService';

// Définir les types pour les éléments du panier
export interface CartItem {
  id: string; // ID unique pour cet élément de panier
  dish: DomainDish;
  quantity: number;
  notes: string;
  removedIngredients: string[];
  individualItems?: CartItemCustomization[]; // Pour les commandes avec personnalisations individuelles
}

export interface CartItemCustomization {
  id: string;
  notes: string;
  removedIngredients: string[];
}

// Modes du panier
export enum CartMode {
  CREATE = 'create', // Création d'une nouvelle commande
  ADD = 'add'        // Ajout à une commande existante
}

// Interface pour le contexte du panier
interface CartContextType {
  items: CartItem[];
  tableId: number | null;
  tableName: string | null;
  mode: CartMode;
  currentOrderId: number | null;
  existingOrder: DomainOrder | null;
  
  setTableInfo: (tableId: number, tableName: string) => void;
  setEditMode: (orderId: number, order: DomainOrder) => void;
  setCreateMode: () => void;
  
  addItem: (item: Omit<CartItem, 'id'>) => void;
  updateItem: (id: string, updates: Partial<Omit<CartItem, 'id' | 'dish'>>) => void;
  removeItem: (id: string) => void;
  clearCart: () => void;
  
  itemCount: number;
  totalAmount: number;
  currency: string;
}

// Créer le contexte
const CartContext = createContext<CartContextType | undefined>(undefined);

// Hook personnalisé pour utiliser le contexte
export const useCart = () => {
  const context = useContext(CartContext);
  if (context === undefined) {
    throw new Error('useCart must be used within a CartProvider');
  }
  return context;
};

// Props pour le fournisseur
interface CartProviderProps {
  children: ReactNode;
}

// Composant fournisseur
export const CartProvider: React.FC<CartProviderProps> = ({ children }) => {
  // États du panier
  const [items, setItems] = useState<CartItem[]>([]);
  const [tableId, setTableId] = useState<number | null>(null);
  const [tableName, setTableName] = useState<string | null>(null);
  const [mode, setMode] = useState<CartMode>(CartMode.CREATE);
  const [currentOrderId, setCurrentOrderId] = useState<number | null>(null);
  const [existingOrder, setExistingOrder] = useState<DomainOrder | null>(null);
  
  // Calcul du nombre total d'articles
  const itemCount = items.reduce((count, item) => count + item.quantity, 0);
  
  // Calcul du montant total
  const totalAmount = items.reduce((total, item) => {
    return total + (item.dish.price * item.quantity);
  }, 0);
  
  // Devise (prend la devise du premier article, sinon "")
  const currency = items.length > 0 ? items[0].dish.currency.code : 
                 (existingOrder && existingOrder.currency ? existingOrder.currency.code : "");

  // Définir les informations de la table
  const setTableInfo = (id: number, name: string) => {
    setTableId(id);
    setTableName(name);
  };
  
  // Passer en mode édition d'une commande existante
  const setEditMode = (orderId: number, order: DomainOrder) => {
    setMode(CartMode.ADD);
    setCurrentOrderId(orderId);
    setExistingOrder(order);
    // On ne pré-remplit pas le panier avec les éléments existants
    // car on veut seulement ajouter de nouveaux éléments
    setItems([]);
  };
  
  // Passer en mode création de commande
  const setCreateMode = () => {
    setMode(CartMode.CREATE);
    setCurrentOrderId(null);
    setExistingOrder(null);
    setItems([]);
  };

  // Ajouter un élément au panier
  const addItem = (item: Omit<CartItem, 'id'>) => {
    const newItem: CartItem = {
      ...item,
      id: generateUniqueId(),
    };
    setItems(prev => [...prev, newItem]);
  };

  // Mettre à jour un élément existant
  const updateItem = (id: string, updates: Partial<Omit<CartItem, 'id' | 'dish'>>) => {
    setItems(prev => 
      prev.map(item => 
        item.id === id ? { ...item, ...updates } : item
      )
    );
  };

  // Supprimer un élément
  const removeItem = (id: string) => {
    setItems(prev => prev.filter(item => item.id !== id));
  };

  // Vider le panier
  const clearCart = () => {
    setItems([]);
    if (mode === CartMode.CREATE) {
      setTableId(null);
      setTableName(null);
    }
    // En mode ADD, on garde les infos de table et de commande
  };

  // Générer un ID unique
  const generateUniqueId = () => {
    return Math.random().toString(36).substring(2) + Date.now().toString(36);
  };

  // Fournir le contexte
  const value = {
    items,
    tableId,
    tableName,
    mode,
    currentOrderId,
    existingOrder,
    setTableInfo,
    setEditMode,
    setCreateMode,
    addItem,
    updateItem,
    removeItem,
    clearCart,
    itemCount,
    totalAmount,
    currency,
  };

  return <CartContext.Provider value={value}>{children}</CartContext.Provider>;
};