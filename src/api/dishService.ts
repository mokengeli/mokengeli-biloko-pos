// src/api/dishService.ts
import api from './apiConfig';

export interface DomainCurrency {
  id: number;
  label: string;
  code: string;
}

export interface DomainDishProduct {
  dish: any; // Référence circulaire
  productId: number;
  productName: string;
  unitOfMeasure: string;
  quantity: number;
  removable: boolean;
}

export interface DomainDish {
  id: number;
  name: string;
  price: number;
  currency: DomainCurrency;
  tenantCode: string;
  categories: string[];
  dishProducts: DomainDishProduct[];
}

export interface PageDomainDish {
  content: DomainDish[];
  totalPages: number;
  totalElements: number;
  size: number;
  number: number;
  first: boolean;
  last: boolean;
  numberOfElements: number;
}

const dishService = {
  async getAllDishes(tenantCode: string, page = 0, size = 50): Promise<PageDomainDish> {
    try {
      const response = await api.get('/api/order/dish', {
        params: {
          code: tenantCode,
          page,
          size
        }
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching dishes:', error);
      throw error;
    }
  },
  
  async getDishById(dishId: number): Promise<DomainDish> {
    try {
      const response = await api.get(`/api/order/dish/${dishId}`);
      return response.data;
    } catch (error) {
      console.error(`Error fetching dish with ID ${dishId}:`, error);
      throw error;
    }
  },

  async getDishesByName(tenantCode: string, name: string): Promise<DomainDish[]> {
    try {
      const response = await api.get('/api/order/dish/name', {
        params: {
          code: tenantCode,
          name
        }
      });
      return response.data;
    } catch (error) {
      console.error('Error searching dishes by name:', error);
      throw error;
    }
  },
  
  async getDishesByCategory(categoryId: number): Promise<DomainDish[]> {
    try {
      const response = await api.get('/api/order/dish/category', {
        params: {
          categoryId
        }
      });
      return response.data;
    } catch (error) {
      console.error(`Error fetching dishes for category ID ${categoryId}:`, error);
      throw error;
    }
  }
};

export default dishService;