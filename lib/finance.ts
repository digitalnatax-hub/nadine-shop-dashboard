const PETTY_CASH_INFLOW_TYPES = new Set([
  'cash_in',
  'owner_contribution',
  'customer_payment',
  'other_income',
  'bank_transfer_in',
  'cash_transfer_in',
])

export function getPettyCashBalance(entries: { amount?: number; type?: string; paymentMethod?: string }[]) {
  return entries.reduce((balance, entry) => balance + getPettyCashBalanceChange(entry), 0)
}

export function getPettyCashBalanceChange(entry: { amount?: number; type?: string; paymentMethod?: string }) {
  if (entry.type === 'owner_drawing' && entry.paymentMethod && entry.paymentMethod !== 'petty_cash') return 0
  const amount = Number(entry.amount ?? 0)
  return PETTY_CASH_INFLOW_TYPES.has(entry.type ?? '') ? amount : -amount
}
