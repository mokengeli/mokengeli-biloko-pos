// src/api/categoryService.ts
import api from './apiConfig';

export interface DomainCategory {
  id: number;
  name: string;
}

export interface PageDomainCategory {
  content: DomainCategory[];
  totalPages: number;
  totalElements: number;
  size: number;
  number: number;
  first: boolean;
  last: boolean;
  numberOfElements: number;
}

const categoryService = {
  async getCategories(tenantCode: string, page = 0, size = 50): Promise<PageDomainCategory> {
    try {
      const response = await api.get('/api/order/category', {
        params: {
          code: tenantCode,
          page,
          size
        }
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching categories:', error);
      throw error;
    }
  },
  
  async getAllCategories(page = 0, size = 50): Promise<PageDomainCategory> {
    try {
      const response = await api.get('/api/order/category/all', {
        params: {
          page,
          size
        }
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching all categories:', error);
      throw error;
    }
  },
  
  async getCategory(categoryId: number): Promise<DomainCategory> {
    try {
      const response = await api.get(`/api/order/category/${categoryId}`);
      return response.data;
    } catch (error) {
      console.error(`Error fetching category with ID ${categoryId}:`, error);
      throw error;
    }
  }
};

export default categoryService;