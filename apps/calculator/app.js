import { evaluate } from './logic.js';
const keys = ['C', '(', ')', '÷', '7', '8', '9', '×', '4', '5', '6', '−', '1', '2', '3', '+', '%', '0', '.', '='];
let expr = '';
const $ = (s) => document.querySelector(s);
const pad = $('#keys');
for (const k of keys) {
  const b = document.createElement('button');
  b.textContent = k;
  b.className = k === '=' ? 'eq' : '÷×−+'.includes(k) ? 'op' : 'C()%'.includes(k) ? 'fn' : '';
  b.onclick = () => press(k);
  pad.append(b);
}
function press(k) {
  if (k === 'C') expr = '';
  else if (k === '=') {
    try { const r = evaluate(expr); $('#history').innerHTML = `${expr} = <b>${r}</b><br>` + $('#history').innerHTML; expr = String(r); }
    catch (e) { $('#out').textContent = e.message; return; }
  } else expr += k;
  $('#expr').textContent = expr;
  try { $('#out').textContent = expr ? evaluate(expr) : 0; } catch { /* incomplete */ }
}
document.addEventListener('keydown', (e) => {
  const map = { '*': '×', '/': '÷', '-': '−', Enter: '=', Escape: 'C', Backspace: 'BS' };
  const k = map[e.key] || e.key;
  if (k === 'BS') { expr = expr.slice(0, -1); $('#expr').textContent = expr; return; }
  if (keys.includes(k)) press(k);
});
