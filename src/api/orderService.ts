// src/api/orderService.ts
import api from "./apiConfig";

export interface DomainOrderItem {
  id: number;
  dishId: number;
  dishName: string;
  note: string;
  count: number;
  state:
    | "PENDING"
    | "READY"
    | "IN_PREPARATION"
    | "REJECTED"
    | "RETURNED"
    | "COOKED"
    | "SERVED"
    | "PAID";
  unitPrice: number;
  orderItemDate: string;
  categories?: string[]; // Catégories du plat
}

export interface DomainCurrency {
  id: number;
  label: string;
  code: string;
}

export interface DomainPaymentTransaction {
  id: number;
  amount: number;
  paymentMethod: string;
  createdAt: string;
  employeeNumber: string;
  notes?: string;
  discountAmount?: number;
  refund: boolean;
}

export interface DomainOrder {
  id: number;
  tenantCode: string;
  tableName: string;     
  tableId: number;      
  employeeNumber: string; // Correspond à waiterIdentifier du nouveau contrat
  waiterIdentifier?: string; // Nouveau champ (redondant avec employeeNumber)
  waiterName?: string; // Nouveau champ principal pour affichage
  items: DomainOrderItem[];
  totalPrice: number;
  currency: DomainCurrency;
  orderDate: string;
  paymentStatus?: 'UNPAID' | 'PARTIALLY_PAID' | 'FULLY_PAID' | 'PAID_WITH_DISCOUNT' | 'PAID_WITH_REJECTED_ITEM';
  paidAmount?: number;
  remainingAmount?: number;
  payments?: DomainPaymentTransaction[];
}

// Interface pour la création d'un élément de commande
export interface CreateOrderItemRequest {
  dishId: number;
  note: string;
  count: number;
}

// Interface pour la création d'une commande
export interface CreateOrderRequest {
  tableName: string;
  tableId: string;
  currencyId: number;
  orderItems: CreateOrderItemRequest[];
}

// Interface pour ajouter des éléments à une commande existante
export interface UpdateOrderRequest {
  orderId: number;
  orderItems: CreateOrderItemRequest[];
}

// Interface pour la requête de paiement
export interface PaymentRequest {
  orderId: number;
  amount: number;
  paymentMethod: string;
  notes?: string;
  discountAmount?: number;
}

export interface CloseWithDebtRequest {
  orderId: number;
  reason: string;
  validationType: 'IMMEDIATE' | 'REMOTE';
  validationCode?: string; // PIN pour validation immédiate
  amount: number;
}

export interface DebtValidationRequest {
  id: number;
  orderId: number;
  tableName: string;
  tableId: number;
  amount: number;
  currency: string;
  reason: string;
  serverName: string;
  serverId: number;
  createdAt: string;
  status: 'PENDING' | 'APPROVED' | 'REJECTED';
}

export interface ValidateDebtRequest {
  debtValidationId: number;
  validationCode?: string; // PIN pour approbation
  approved: boolean;
  rejectionReason?: string; // Si refusé
}

const orderService = {
  async getOrdersByState(state: string): Promise<DomainOrder[]> {
    try {
      const response = await api.get("/api/order", {
        params: {
          state,
        },
      });
      return response.data;
    } catch (error) {
      console.error("Error fetching orders by state:", error);
      throw error;
    }
  },

  // Méthode pour récupérer les commandes actives pour une table spécifique
  async getActiveOrdersByTable(tableId: number): Promise<DomainOrder[]> {
    try {
      const response = await api.get("/api/order/active", {
        params: {
          tableId,
        },
      });
      return response.data;
    } catch (error) {
      console.error("Error fetching active orders by table:", error);
      throw error;
    }
  },

  // Méthode pour créer une nouvelle commande
  async createOrder(orderData: CreateOrderRequest): Promise<DomainOrder> {
    try {
      const response = await api.post("/api/order", orderData);
      return response.data;
    } catch (error) {
      console.error("Error creating order:", error);
      throw error;
    }
  },

  // Méthode pour ajouter des éléments à une commande existante
  async addItemsToOrder(updateData: UpdateOrderRequest): Promise<DomainOrder> {
    try {
      const response = await api.put("/api/order/addItems", updateData);
      return response.data;
    } catch (error) {
      console.error("Error adding items to order:", error);
      throw error;
    }
  },

  // Méthode pour marquer un plat comme servi
  async markDishAsServed(itemId: number): Promise<void> {
    try {
      await api.put(`/api/order/dish/served`, null, {
        params: {
          id: itemId,
        },
      });
    } catch (error) {
      console.error("Error marking dish as served:", error);
      throw error;
    }
  },

  // Méthode pour imprimer un ticket de commande
  async printOrderTicket(orderId: number): Promise<boolean> {
    try {
      // Cet endpoint n'existe pas encore, à implémenter côté serveur
      // Pour l'instant, simulons une impression réussie
      console.log(`Printing order ticket for order #${orderId}`);
      return true;
    } catch (error) {
      console.error("Error printing order ticket:", error);
      throw error;
    }
  },

  // Méthode améliorée pour marquer un plat comme prêt
  async prepareOrderItem(itemId: number): Promise<void> {
    try {
      await api.put(`/api/order/dish/ready`, null, {
        params: {
          id: itemId,
        },
      });
    } catch (error) {
      console.error("Error marking dish as ready:", error);
      throw error; // Laisser l'erreur se propager pour être traitée par le composant
    }
  },

  // Méthode améliorée pour rejeter un plat
  async rejectDish(itemId: number): Promise<void> {
    try {
      await api.put(`/api/order/dish/reject`, null, {
        params: {
          id: itemId,
        },
      });
    } catch (error) {
      console.error("Error rejecting dish:", error);
      throw error; // Laisser l'erreur se propager pour être traitée par le composant
    }
  },

  // Méthode pour retourner un plat
  async returnDish(itemId: number): Promise<void> {
    try {
      await api.put(`/api/order/dish/return`, null, {
        params: {
          id: itemId,
        },
      });
    } catch (error) {
      console.error("Error returning dish:", error);
      throw error;
    }
  },

  // Méthode pour forcer la fermeture d'une commande
  async forceCloseOrder(orderId: number): Promise<void> {
    try {
      await api.put('/api/order/force-close', null, {
        params: {
          id: orderId,
        },
      });
    } catch (error) {
      console.error('Error force closing order:', error);
      throw error;
    }
  },
  // Méthode pour récupérer une commande par son ID
  async getOrderById(orderId: number): Promise<DomainOrder> {
    try {
      const response = await api.get(`/api/order/${orderId}`);
      
      // Si le backend ne fournit pas paidAmount ou remainingAmount, les calculer localement
      const order = response.data;
      
      if (order.payments && order.payments.length > 0 && order.totalPrice) {
        // Calculer le montant total payé si non fourni par l'API
        if (order.paidAmount === undefined) {
          order.paidAmount = order.payments.reduce((total, payment) => 
            total + (payment.refund ? -payment.amount : payment.amount), 0);
        }
        
        // Calculer le montant restant à payer si non fourni par l'API
        if (order.remainingAmount === undefined) {
          order.remainingAmount = Math.max(0, order.totalPrice - (order.paidAmount || 0));
        }
      } else {
        // Si pas de paiements ou données incomplètes
        if (order.paidAmount === undefined) order.paidAmount = 0;
        if (order.remainingAmount === undefined) order.remainingAmount = order.totalPrice;
      }
      
      return order;
    } catch (error) {
      console.error(`Error fetching order with ID ${orderId}:`, error);
      throw error;
    }
  },
  // Méthode pour marquer un plat comme payé
  async markDishAsPaid(itemId: number): Promise<void> {
    try {
      await api.put(`/api/order/dish/paid`, null, {
        params: {
          id: itemId,
        },
      });
    } catch (error) {
      console.error("Error marking dish as paid:", error);
      throw error;
    }
  },

  // Méthode pour enregistrer un paiement
  async recordPayment(request: PaymentRequest): Promise<DomainOrder> {
    try {
      const response = await api.post('/api/order/payment', request);
      return response.data;
    } catch (error) {
      console.error('Error recording payment:', error);
      throw error;
    }
  },
  
  // Méthode pour récupérer l'historique des paiements
  async getPaymentHistory(orderId: number): Promise<DomainPaymentTransaction[]> {
    try {
      const response = await api.get(`/api/order/payment/${orderId}/history`);
      return response.data;
    } catch (error) {
      console.error('Error getting payment history:', error);
      throw error;
    }
  },
  
  // Méthode pour récupérer les commandes nécessitant un paiement
  async getOrdersRequiringPayment(): Promise<DomainOrder[]> {
    try {
      const response = await api.get('/api/order/payment/requiring-payment');
      return response.data;
    } catch (error) {
      console.error('Error getting orders requiring payment:', error);
      throw error;
    }
  },
  
  // Méthode pour récupérer les commandes par statut de paiement
  async getOrdersByPaymentStatus(status: string): Promise<DomainOrder[]> {
    try {
      const response = await api.get(`/api/order/payment/status/${status}`);
      return response.data;
    } catch (error) {
      console.error(`Error fetching orders with payment status ${status}:`, error);
      throw error;
    }
  },
   // Clôturer une commande avec impayé
  async closeWithDebt(request: CloseWithDebtRequest): Promise<void> {
    try {
      await api.post('/api/order/close-with-debt', request);
    } catch (error) {
      console.error('Error closing order with debt:', error);
      throw error;
    }
  },

  // Récupérer les validations en attente (pour managers)
  async getPendingDebtValidations(tenantCode: string): Promise<DebtValidationRequest[]> {
    try {
      const response = await api.get('/api/order/debt-validations/pending', {
        params: { tenantCode }
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching pending debt validations:', error);
      throw error;
    }
  },

  // Valider ou refuser une demande
  async validateDebtRequest(request: ValidateDebtRequest): Promise<void> {
    try {
      await api.post('/api/order/debt-validations/validate', request);
    } catch (error) {
      console.error('Error validating debt request:', error);
      throw error;
    }
  }
};

export default orderService;