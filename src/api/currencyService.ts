// src/api/currencyService.ts
import api from './apiConfig';
import { DomainCurrency } from './orderService';

const currencyService = {
  // Récupérer toutes les devises disponibles
  async getAllCurrencies(): Promise<DomainCurrency[]> {
    try {
      const response = await api.get('/api/order/currency/all');
      return response.data;
    } catch (error) {
      console.error('Error fetching currencies:', error);
      throw error;
    }
  },

  // Récupérer une devise par défaut (la première disponible)
  async getDefaultCurrency(): Promise<DomainCurrency | null> {
    try {
      const currencies = await this.getAllCurrencies();
      return currencies.length > 0 ? currencies[0] : null;
    } catch (error) {
      console.error('Error fetching default currency:', error);
      return null;
    }
  }
};

export default currencyService;