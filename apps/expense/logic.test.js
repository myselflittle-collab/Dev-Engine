import { summary, formatMoney } from './logic.js';

test('summarises income, expenses and categories', () => {
  const s = summary([
    { type: 'income', amount: 50000, category: 'Salary' },
    { type: 'expense', amount: 1200.5, category: 'Food' },
    { type: 'expense', amount: 300, category: 'Food' },
    { type: 'expense', amount: 999.5, category: 'Bills' },
  ]);
  expect(s.income).toBe(50000);
  expect(s.expense).toBe(2500);
  expect(s.balance).toBe(47500);
  expect(s.byCat).toEqual({ Food: 1500.5, Bills: 999.5 });
});
test('formats money', () => {
  expect(formatMoney(1234567)).toBe('₹12,34,567');
  expect(formatMoney(-50)).toBe('-₹50');
});
