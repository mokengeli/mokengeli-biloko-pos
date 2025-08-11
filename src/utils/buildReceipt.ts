interface ReceiptParams {
  orderId: number;
  tableName?: string;
  totalAmount: number;
  paidAmount: number;
  paymentAmount: number;
  receivedAmount: number;
  change: number;
  currency: string;
}

export const buildReceipt = ({
  orderId,
  tableName,
  totalAmount,
  paidAmount,
  paymentAmount,
  receivedAmount,
  change,
  currency,
}: ReceiptParams): string => {
  const lines = [
    '[C]<BOLD>RESTAURANT XYZ</BOLD>',
    '[C]--------------------------------',
    `[L]Table: ${tableName || 'N/A'}`,
    `[L]Commande #${orderId}`,
    `[L]Date: ${new Date().toLocaleString()}`,
    '[L]--------------------------------',
    `[L]Montant total: ${totalAmount.toFixed(2)} ${currency}`,
    `[L]Montant payé précédemment: ${paidAmount.toFixed(2)} ${currency}`,
    `[L]Montant de ce paiement: ${paymentAmount.toFixed(2)} ${currency}`,
    `[L]Montant reçu: ${receivedAmount.toFixed(2)} ${currency}`,
    `[L]Monnaie rendue: ${change.toFixed(2)} ${currency}`,
    `[L]Reste à payer: ${Math.max(0, totalAmount - (paidAmount + paymentAmount)).toFixed(2)} ${currency}`,
    '[C]--------------------------------',
    '[C]Merci de votre visite!',
  ];

  return lines.join('\n');
};
