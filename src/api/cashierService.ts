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
  searchType?: 'ORDER' | 'TABLE'; // Valeurs API : ORDER ou TABLE
  status?: string;
  search?: string; // Valeur de recherche (paramètre API : search)
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
        search: params.search,   // Paramètre API : search
        status: params.status
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
   * Recherche par valeur et type spécifique
   */
  async searchOrders(tenantCode: string, searchValue: string, searchType: 'ORDER' | 'TABLE', date?: string): Promise<DomainCashierOrderSummary> {
    return await this.getCashierOrderSummary({
      tenantCode,
      search: searchValue,  // Utiliser le paramètre 'search' de l'API
      searchType,
      date,
      status: 'ALL'
    });
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