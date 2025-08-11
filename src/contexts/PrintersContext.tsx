import React, { createContext, useContext, useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { Printer } from '../types/printer';

interface PrintersContextValue {
  printers: Printer[];
  kitchenPrinterId: string | null;
  receiptPrinterId: string | null;
  addPrinter: (p: Printer) => void;
  removePrinter: (id: string) => void;
  setDefaultPrinter: (type: 'kitchen' | 'receipt', id: string) => void;
}

const PrintersContext = createContext<PrintersContextValue | undefined>(undefined);

export const usePrinters = () => {
  const ctx = useContext(PrintersContext);
  if (!ctx) {
    throw new Error('usePrinters must be used within a PrintersProvider');
  }
  return ctx;
};

interface ProviderProps {
  children: React.ReactNode;
}

const STORAGE_KEY = 'printers-config';

export const PrintersProvider: React.FC<ProviderProps> = ({ children }) => {
  const [printers, setPrinters] = useState<Printer[]>([]);
  const [kitchenPrinterId, setKitchenPrinterId] = useState<string | null>(null);
  const [receiptPrinterId, setReceiptPrinterId] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const raw = await AsyncStorage.getItem(STORAGE_KEY);
        if (raw) {
          const parsed = JSON.parse(raw);
          setPrinters(parsed.printers || []);
          setKitchenPrinterId(parsed.kitchenPrinterId || null);
          setReceiptPrinterId(parsed.receiptPrinterId || null);
        }
      } catch (e) {
        console.warn('Failed to load printers configuration', e);
      }
    })();
  }, []);

  useEffect(() => {
    const save = async () => {
      try {
        await AsyncStorage.setItem(
          STORAGE_KEY,
          JSON.stringify({ printers, kitchenPrinterId, receiptPrinterId })
        );
      } catch (e) {
        console.warn('Failed to save printers configuration', e);
      }
    };
    save();
  }, [printers, kitchenPrinterId, receiptPrinterId]);

  const addPrinter = (p: Printer) => {
    setPrinters(prev => [...prev.filter(pr => pr.id !== p.id), p]);
  };

  const removePrinter = (id: string) => {
    setPrinters(prev => prev.filter(pr => pr.id !== id));
    if (kitchenPrinterId === id) setKitchenPrinterId(null);
    if (receiptPrinterId === id) setReceiptPrinterId(null);
  };

  const setDefaultPrinter = (type: 'kitchen' | 'receipt', id: string) => {
    if (type === 'kitchen') {
      setKitchenPrinterId(id);
    } else {
      setReceiptPrinterId(id);
    }
  };

  const value: PrintersContextValue = {
    printers,
    kitchenPrinterId,
    receiptPrinterId,
    addPrinter,
    removePrinter,
    setDefaultPrinter,
  };

  return <PrintersContext.Provider value={value}>{children}</PrintersContext.Provider>;
};
