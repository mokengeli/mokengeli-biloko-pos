// src/api/tableService.ts
import api from './apiConfig';

export interface DomainRefTable {
  id: number;  // ID désormais disponible
  name: string;
  tenantCode: string;
  createdAt: string;
  updatedAt: string;
}

export interface PageDomainRefTable {
  content: DomainRefTable[];
  totalPages: number;
  totalElements: number;
  size: number;
  number: number;
  first: boolean;
  last: boolean;
  numberOfElements: number;
}

const tableService = {
  async getTables(tenantCode: string, page = 0, size = 20): Promise<PageDomainRefTable> {
    try {
      const response = await api.get('/api/order/table', {
        params: {
          code: tenantCode,
          page,
          size
        }
      });
      return response.data;
    } catch (error) {
      console.error('Error fetching tables:', error);
      throw error;
    }
  },

  async getTablesByName(tenantCode: string, name: string): Promise<DomainRefTable[]> {
    try {
      const response = await api.get('/api/order/table/name', {
        params: {
          code: tenantCode,
          name
        }
      });
      return response.data;
    } catch (error) {
      console.error('Error searching tables by name:', error);
      throw error;
    }
  },
  
  // Ajout d'une méthode pour créer une table (pour référence future)
  async createTable(table: DomainRefTable): Promise<DomainRefTable> {
    try {
      const response = await api.post('/api/order/table', table);
      return response.data;
    } catch (error) {
      console.error('Error creating table:', error);
      throw error;
    }
  }
};

export default tableService;