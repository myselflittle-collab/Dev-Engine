// Safe expression evaluator (no eval): + - * / % ^ and parentheses, with operator precedence.
export function tokenize(src) {
  const out = []; let i = 0;
  const s = String(src).replace(/×/g, '*').replace(/÷/g, '/').replace(/−/g, '-');
  while (i < s.length) {
    const c = s[i];
    if (/\s/.test(c)) { i++; continue; }
    if (/[0-9.]/.test(c)) { let n = ''; while (i < s.length && /[0-9.]/.test(s[i])) n += s[i++]; if ((n.match(/\./g) || []).length > 1) throw new Error('Bad number'); out.push({ t: 'n', v: parseFloat(n) }); continue; }
    if ('+-*/%^()'.includes(c)) { out.push({ t: c }); i++; continue; }
    throw new Error(`Unexpected "${c}"`);
  }
  return out;
}
export function evaluate(src) {
  const tk = tokenize(src); let p = 0;
  const peek = () => tk[p] && tk[p].t;
  function primary() {
    const x = tk[p++];
    if (!x) throw new Error('Incomplete expression');
    if (x.t === 'n') return x.v;
    if (x.t === '-') return -factor();
    if (x.t === '+') return factor();
    if (x.t === '(') { const v = expr(); if (peek() !== ')') throw new Error('Missing )'); p++; return v; }
    throw new Error('Unexpected ' + x.t);
  }
  function factor() { let v = primary(); while (peek() === '%') { p++; v = v / 100; } if (peek() === '^') { p++; v = Math.pow(v, factor()); } return v; }
  function term() { let v = factor(); while (peek() === '*' || peek() === '/') { const op = tk[p++].t; const r = factor(); if (op === '/' && r === 0) throw new Error('Cannot divide by zero'); v = op === '*' ? v * r : v / r; } return v; }
  function expr() { let v = term(); while (peek() === '+' || peek() === '-') { const op = tk[p++].t; const r = term(); v = op === '+' ? v + r : v - r; } return v; }
  const v = expr();
  if (p < tk.length) throw new Error('Unexpected ' + tk[p].t);
  return Math.round(v * 1e12) / 1e12;
}
