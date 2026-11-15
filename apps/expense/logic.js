export function summary(items) {
  let income = 0; let expense = 0; const byCat = {};
  for (const it of items) {
    const a = Number(it.amount) || 0;
    if (it.type === 'income') income += a;
    else { expense += a; byCat[it.category] = (byCat[it.category] || 0) + a; }
  }
  const round = (x) => Math.round(x * 100) / 100;
  return { income: round(income), expense: round(expense), balance: round(income - expense), byCat };
}
export function formatMoney(n, symbol = '₹') {
  const sign = n < 0 ? '-' : '';
  return sign + symbol + Math.abs(n).toLocaleString('en-IN', { maximumFractionDigits: 2 });
}
