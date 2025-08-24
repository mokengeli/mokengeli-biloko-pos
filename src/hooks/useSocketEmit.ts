// ============================================================================
// src/hooks/useSocketEmit.ts
// ============================================================================

import { useCallback } from 'react';
import { socketIOService } from '../services/SocketIOService';

/**
 * Hook pour émettre des événements Socket.io
 */
export function useSocketEmit() {
  const emit = useCallback((event: string, data: any): Promise<any> => {
    return new Promise((resolve, reject) => {
      socketIOService.emit(event, data, (response: any) => {
        if (response?.error) {
          reject(new Error(response.error));
        } else {
          resolve(response);
        }
      });
    });
  }, []);
  
  const emitAsync = useCallback(async (event: string, data: any): Promise<any> => {
    return emit(event, data);
  }, [emit]);
  
  return {
    emit,
    emitAsync
  };
}