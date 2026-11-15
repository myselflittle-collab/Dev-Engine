import { evaluate } from './logic.js';

describe('calculator', () => {
  test('respects operator precedence', () => { expect(evaluate('2+3*4')).toBe(14); expect(evaluate('(2+3)*4')).toBe(20); });
  test('handles decimals, negatives, percent and power', () => {
    expect(evaluate('0.1+0.2')).toBe(0.3);
    expect(evaluate('-5+2')).toBe(-3);
    expect(evaluate('50%')).toBe(0.5);
    expect(evaluate('2^10')).toBe(1024);
    expect(evaluate('10 ÷ 4 × 2')).toBe(5);
  });
  test('reports errors', () => {
    expect(() => evaluate('1/0')).toThrow('divide by zero');
    expect(() => evaluate('2+')).toThrow();
    expect(() => evaluate('alert(1)')).toThrow();
  });
});
