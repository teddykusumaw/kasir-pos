/**
 * Helper perhitungan laporan keuangan (SME / POS)
 */

export interface FinanceOpening {
  opening_cash: number;
  opening_equity: number;
  as_of: string | null;
}

export const DEFAULT_FINANCE: FinanceOpening = {
  opening_cash: 0,
  opening_equity: 0,
  as_of: null,
};

export interface PeriodSalesAgg {
  /** DPP / subtotal sebelum PPN */
  revenue: number;
  tax: number;
  grandTotal: number;
  /** HPP = sum(cost * qty) */
  cogs: number;
  count: number;
  /** per metode bayar (grand total) */
  byMethod: Record<string, number>;
}

export interface ExpenseRow {
  id: string;
  expense_date: string;
  category: string;
  description: string;
  amount: number;
  payment_method: string;
}

export function emptySalesAgg(): PeriodSalesAgg {
  return {
    revenue: 0,
    tax: 0,
    grandTotal: 0,
    cogs: 0,
    count: 0,
    byMethod: { cash: 0, qris: 0, transfer: 0, card: 0, tempo: 0 },
  };
}

export function calcPnL(
  sales: PeriodSalesAgg,
  expensesTotal: number
) {
  const grossProfit = sales.revenue - sales.cogs;
  const netProfit = grossProfit - expensesTotal;
  return {
    revenue: sales.revenue,
    cogs: sales.cogs,
    grossProfit,
    expenses: expensesTotal,
    netProfit,
    taxCollected: sales.tax,
    grandTotal: sales.grandTotal,
    marginGross: sales.revenue > 0 ? (grossProfit / sales.revenue) * 100 : 0,
    marginNet: sales.revenue > 0 ? (netProfit / sales.revenue) * 100 : 0,
  };
}

export function calcCashReport(
  sales: PeriodSalesAgg,
  expenses: ExpenseRow[],
  openingCash: number
) {
  const cashIn = { ...sales.byMethod };
  const cashOut: Record<string, number> = {
    cash: 0,
    transfer: 0,
    qris: 0,
    card: 0,
    other: 0,
  };
  for (const e of expenses) {
    const m = e.payment_method || "other";
    cashOut[m] = (cashOut[m] || 0) + Number(e.amount);
  }
  const totalIn = Object.values(cashIn).reduce((a, b) => a + b, 0);
  const totalOut = Object.values(cashOut).reduce((a, b) => a + b, 0);
  // Kas fisik: opening + tunai masuk - tunai keluar
  const physicalCash =
    openingCash + (cashIn.cash || 0) - (cashOut.cash || 0);
  return { cashIn, cashOut, totalIn, totalOut, physicalCash, openingCash };
}

export function calcCashFlow(
  sales: PeriodSalesAgg,
  expensesTotal: number
) {
  // Tempo belum menjadi kas sampai piutang dilunasi
  const tempo = sales.byMethod["tempo"] || 0;
  const operatingIn = Math.max(0, sales.grandTotal - tempo);
  const operatingOut = expensesTotal;
  const netOperating = operatingIn - operatingOut;
  return {
    operatingIn,
    operatingOut,
    netOperating,
    investing: 0,
    financing: 0,
    netChange: netOperating,
  };
}

export function calcBalanceSheet(params: {
  inventoryValue: number;
  cashBalance: number;
  openingEquity: number;
  /** Laba bersih kumulatif (dari awal atau dari as_of) */
  retainedEarnings: number;
}) {
  const totalAssets = params.cashBalance + params.inventoryValue;
  const equity = params.openingEquity + params.retainedEarnings;
  const liabilities = 0;
  const totalLiabEquity = liabilities + equity;
  return {
    assets: {
      cash: params.cashBalance,
      inventory: params.inventoryValue,
      total: totalAssets,
    },
    liabilities: {
      total: liabilities,
    },
    equity: {
      capital: params.openingEquity,
      retained: params.retainedEarnings,
      total: equity,
    },
    totalLiabEquity,
    balanced: Math.abs(totalAssets - totalLiabEquity) < 1,
  };
}
