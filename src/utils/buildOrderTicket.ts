import { DomainOrder } from '../api/orderService';

export const buildOrderTicket = (order: DomainOrder): string => {
  const lines: string[] = [];
  lines.push(`[C]<BOLD>COMMANDE #${order.id}</BOLD>`);
  lines.push(`[L]Table: ${order.tableName}`);
  lines.push(`[L]Date: ${new Date(order.orderDate).toLocaleString()}`);
  lines.push('[L]------------------------------');

  order.items.forEach((item) => {
    lines.push(`[L]${item.count} x ${item.dishName}`);
  });

  lines.push('[L]------------------------------');
  lines.push(
    `[R]TOTAL: ${order.totalPrice.toFixed(2)} ${order.currency.code}`
  );
  lines.push('[C]Merci!');

  return lines.join('\n');
};
