export interface Printer {
  id: string;
  type: 'net' | 'ble';
  name: string;
  host?: string;
  port?: number;
  macAddress?: string;
}
