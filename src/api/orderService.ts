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
    | "COOKED"
    | "SERVED"
    | "PAID";
  unitPrice: number;
  orderItemDate: string;
}

export interface DomainCurrency {
  id: number;
  label: string;
  code: string;
}

export interface DomainOrder {
  id: number;
  tenantCode: string;
  refTable: string;
  employeeNumber: string;
  items: DomainOrderItem[];
  totalPrice: number;
  currency: DomainCurrency;
  orderDate: string;
}

// Interface pour la création d'un élément de commande
export interface CreateOrderItemRequest {
  dishId: number;
  note: string;
  count: number;
}

// Interface pour la création d'une commande
export interface CreateOrderRequest {
  refTable: string;
  currencyId: number;
  orderItems: CreateOrderItemRequest[];
}

// Interface pour ajouter des éléments à une commande existante
export interface UpdateOrderRequest {
  orderId: number;
  orderItems: CreateOrderItemRequest[];
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
  // Méthode pour marquer un plat comme prêt
  async prepareOrderItem(itemId: number): Promise<void> {
    try {
      await api.put(`/api/order/dish/ready`, null, {
        params: {
          id: itemId,
        },
      });
    } catch (error) {
      console.error("Error marking dish as ready:", error);
      throw error;
    }
  },
  // Méthode pour rejeter un plat
  async rejectDish(itemId: number): Promise<void> {
    try {
      await api.put(`/api/order/dish/reject`, null, {
        params: {
          id: itemId,
        },
      });
    } catch (error) {
      console.error("Error rejecting dish:", error);
      throw error;
    }
  },
};

export default orderService;
