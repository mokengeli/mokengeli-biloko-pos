// ============================================================================
// src/hooks/useSocketEvent.ts
// ============================================================================

import { useEffect, useRef } from 'react';
import { socketIOService } from '../services/SocketIOService';

/**
 * Hook pour écouter un événement Socket.io spécifique
 */
export function useSocketEvent<T = any>(
  eventName: string,
  callback: (data: T) => void,
  deps: any[] = []
) {
  const callbackRef = useRef(callback);
  
  // Mettre à jour la référence du callback
  useEffect(() => {
    callbackRef.current = callback;
  }, [callback]);
  
  useEffect(() => {
    const unsubscribe = socketIOService.on(eventName, (data: T) => {
      callbackRef.current(data);
    });
    
    return unsubscribe;
  }, [eventName, ...deps]);
}