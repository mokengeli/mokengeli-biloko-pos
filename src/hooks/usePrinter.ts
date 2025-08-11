import { useState, useCallback } from 'react';
import { Printer } from '../types/printer';

let NetPrinter: any = null;
let BLEPrinter: any = null;
try {
  // eslint-disable-next-line @typescript-eslint/no-var-requires
  const Printers = require('react-native-thermal-receipt-printer');
  NetPrinter = Printers.NetPrinter;
  BLEPrinter = Printers.BLEPrinter;
} catch (e) {
  // Library not installed; hook will fail gracefully
  console.warn('Printer library not available', e);
}

interface PrinterHookState {
  connectedPrinter: Printer | null;
  isLoading: boolean;
  error: string | null;
}

export interface PrintOptions {
  copies?: number;
}

export const usePrinter = () => {
  const [state, setState] = useState<PrinterHookState>({
    connectedPrinter: null,
    isLoading: false,
    error: null,
  });

  const scanPrinters = useCallback(async (): Promise<Printer[]> => {
    const devices: Printer[] = [];
    try {
      if (NetPrinter?.scan) {
        const nets = await NetPrinter.scan();
        nets.forEach((d: any) =>
          devices.push({
            id: d.ip || d.host,
            type: 'net',
            host: d.ip || d.host,
            port: d.port || 9100,
            name: d.device_name || d.host || d.ip,
          })
        );
      }
      if (BLEPrinter?.scan) {
        const bles = await BLEPrinter.scan();
        bles.forEach((d: any) =>
          devices.push({
            id: d.macAddress || d.address,
            type: 'ble',
            macAddress: d.macAddress || d.address,
            name: d.deviceName || d.name,
          })
        );
      }
    } catch (err: any) {
      setState(prev => ({ ...prev, error: err.message }));
    }
    return devices;
  }, []);

  const connectPrinter = useCallback(async (printer: Printer) => {
    setState(prev => ({ ...prev, isLoading: true, error: null }));
    try {
      if (printer.type === 'net' && NetPrinter) {
        await NetPrinter.connectPrinter(printer.host, printer.port || 9100);
      } else if (printer.type === 'ble' && BLEPrinter) {
        await BLEPrinter.connectPrinter(printer.macAddress);
      } else {
        throw new Error('Unsupported printer type');
      }
      setState({ connectedPrinter: printer, isLoading: false, error: null });
      return true;
    } catch (err: any) {
      setState(prev => ({ ...prev, isLoading: false, error: err.message }));
      return false;
    }
  }, []);

  const disconnectPrinter = useCallback(async () => {
    const { connectedPrinter } = state;
    if (!connectedPrinter) return;
    try {
      if (connectedPrinter.type === 'net' && NetPrinter?.disconnectPrinter) {
        await NetPrinter.disconnectPrinter();
      } else if (
        connectedPrinter.type === 'ble' &&
        BLEPrinter?.disconnectPrinter
      ) {
        await BLEPrinter.disconnectPrinter();
      }
    } catch (err: any) {
      setState(prev => ({ ...prev, error: err.message }));
    } finally {
      setState({ connectedPrinter: null, isLoading: false, error: null });
    }
  }, [state.connectedPrinter]);

  const print = useCallback(
    async (text: string, _options?: PrintOptions) => {
      if (!state.connectedPrinter) {
        setState(prev => ({ ...prev, error: 'Aucune imprimante connectée' }));
        return false;
      }
      try {
        if (state.connectedPrinter.type === 'net' && NetPrinter?.printText) {
          await NetPrinter.printText(text);
        } else if (
          state.connectedPrinter.type === 'ble' &&
          BLEPrinter?.printText
        ) {
          await BLEPrinter.printText(text);
        } else {
          throw new Error('Fonction d\'impression non disponible');
        }
        return true;
      } catch (err: any) {
        setState(prev => ({ ...prev, error: err.message }));
        return false;
      }
    },
    [state.connectedPrinter]
  );

  return {
    connectedPrinter: state.connectedPrinter,
    isConnected: !!state.connectedPrinter,
    isLoading: state.isLoading,
    error: state.error,
    scanPrinters,
    connectPrinter,
    disconnectPrinter,
    print,
  };
};
