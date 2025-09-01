// src/api/cashierService.ts
import api from "./apiConfig";

export interface DomainDishesStatus {
  total: number;
  ready: number;
  inProgress: number;
  served: number;
}

export interface DomainCashierOrder {
  orderId: number;
  tableId: number;
  tableName: string;
  totalAmount: number;
  paidAmount: number;
  remainingAmount: number;
  status: string;
  createdAt: string;
  dishesStatus: DomainDishesStatus;
  waitingTime: number;
}

export interface DomainCashierOrderSummary {
  date: string;
  totalOrders: number;
  totalRevenue: number;
  orders: DomainCashierOrder[];
}

export interface CashierOrderParams {
  tenantCode: string; // TenantCode obligatoire
  date?: string; // Format: YYYY-MM-DD
  searchType?: 'commande' | 'table';
  status?: string;
  searchValue?: string; // Valeur de recherche (numéro commande ou table)
}

export interface CashierOrdersByTableParams {
  tenantCode: string; // TenantCode obligatoire
  date?: string; // Format: YYYY-MM-DD
  status?: string;
}

class CashierService {
  /**
   * Récupère le résumé des commandes pour le caissier
   */
  async getCashierOrderSummary(params: CashierOrderParams): Promise<DomainCashierOrderSummary> {
    try {
      const requestParams = {
        code: params.tenantCode, // Paramètre obligatoire
        date: params.date,
        searchType: params.searchType,
        status: params.status,
        searchValue: params.searchValue
      };
      const response = await api.get('/api/order/cashier', { params: requestParams });
      return response.data;
    } catch (error) {
      console.error('Error fetching cashier order summary:', error);
      throw error;
    }
  }

  /**
   * Récupère les commandes d'une table spécifique pour le caissier
   */
  async getOrdersByTable(tableId: number, params: CashierOrdersByTableParams): Promise<DomainCashierOrder[]> {
    try {
      const requestParams = {
        code: params.tenantCode, // Paramètre obligatoire
        date: params.date,
        status: params.status
      };
      const response = await api.get(`/api/order/cashier/${tableId}/orders`, { params: requestParams });
      return response.data;
    } catch (error) {
      console.error('Error fetching orders by table:', error);
      throw error;
    }
  }

  /**
   * Recherche par valeur spécifique (numéro de commande ou table)
   */
  async searchOrders(tenantCode: string, searchValue: string, searchType: 'commande' | 'table', date?: string): Promise<DomainCashierOrderSummary> {
    return await this.getCashierOrderSummary({
      tenantCode,
      searchValue,
      searchType,
      date,
      status: 'ALL'
    });
  }

  /**
   * Recherche intelligente - détermine automatiquement le type et essaie différentes approches
   */
  async smartSearch(tenantCode: string, searchValue: string, date?: string): Promise<DomainCashierOrderSummary> {
    // Déterminer le type de recherche
    const isNumeric = /^\d+$/.test(searchValue);
    
    if (isNumeric) {
      // Essayer d'abord comme numéro de commande
      try {
        return await this.searchOrders(tenantCode, searchValue, 'commande', date);
      } catch (error) {
        // Si échec, essayer comme numéro de table
        return await this.searchOrders(tenantCode, searchValue, 'table', date);
      }
    } else {
      // Recherche textuelle (nom de table)
      return await this.searchOrders(tenantCode, searchValue, 'table', date);
    }
  }

  /**
   * Utilitaire pour formater la date au format attendu par l'API
   */
  formatDateForAPI(date: Date): string {
    return date.toISOString().split('T')[0]; // Format YYYY-MM-DD
  }

  /**
   * Utilitaire pour obtenir la couleur selon le statut de la commande
   */
  getOrderStatusColor(order: DomainCashierOrder): 'success' | 'warning' | 'error' {
    if (order.remainingAmount <= 0) {
      return 'success'; // Vert - Payée
    }
    
    if (order.waitingTime > 10) {
      return 'error'; // Rouge - Urgente (client attend > 10min)
    }
    
    return 'warning'; // Jaune - En cours
  }

  /**
   * Utilitaire pour obtenir le statut d'affichage
   */
  getOrderDisplayStatus(order: DomainCashierOrder): string {
    if (order.remainingAmount <= 0) {
      return 'PAYÉE';
    }
    
    if (order.dishesStatus.ready === order.dishesStatus.total) {
      return 'PRÊTE À PAYER';
    }
    
    if (order.dishesStatus.inProgress > 0) {
      return 'EN COURS';
    }
    
    return 'EN ATTENTE';
  }

  /**
   * Utilitaire pour obtenir le détail des plats
   */
  getDishesStatusText(dishesStatus: DomainDishesStatus): string {
    const { total, ready, inProgress, served } = dishesStatus;
    
    if (served === total) {
      return 'Tous plats servis';
    }
    
    if (ready === total) {
      return 'Tous plats prêts';
    }
    
    const parts = [];
    if (ready > 0) parts.push(`${ready} prêt${ready > 1 ? 's' : ''}`);
    if (inProgress > 0) parts.push(`${inProgress} en cours`);
    
    return parts.join(', ');
  }
}

export const cashierService = new CashierService();
export default cashierService;