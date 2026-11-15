import { summary, formatMoney } from './logic.js';
const KEY = 'expenses-v1';
let items = JSON.parse(localStorage.getItem(KEY) || '[]');
const $ = (s) => document.querySelector(s);
function render() {
  const s = summary(items);
  $('#inc').textContent = formatMoney(s.income); $('#exp').textContent = formatMoney(s.expense);
  $('#bal').textContent = formatMoney(s.balance); $('#bal').className = s.balance < 0 ? 'minus' : 'plus';
  const max = Math.max(1, ...Object.values(s.byCat));
  $('#bars').innerHTML = Object.keys(s.byCat).length ? '' : '<p class="muted small">No expenses yet.</p>';
  for (const [cat, v] of Object.entries(s.byCat).sort((a, b) => b[1] - a[1])) {
    const d = document.createElement('div'); d.className = 'bar';
    d.innerHTML = `<span></span><div class="track"><div class="fill" style="width:0"></div></div>`;
    d.querySelector('span').textContent = `${cat} — ${formatMoney(v)}`;
    $('#bars').append(d);
    requestAnimationFrame(() => { d.querySelector('.fill').style.width = (v / max) * 100 + '%'; });
  }
  $('#list').innerHTML = '';
  for (const it of [...items].reverse()) {
    const li = document.createElement('li');
    li.innerHTML = '<span class="d"><span class="t"></span><span class="c"></span></span><b></b><button title="Delete">✕</button>';
    li.querySelector('.t').textContent = it.desc;
    li.querySelector('.c').textContent = `${it.category} · ${new Date(it.at).toLocaleDateString()}`;
    const b = li.querySelector('b'); b.textContent = (it.type === 'income' ? '+' : '−') + formatMoney(+it.amount); b.className = it.type === 'income' ? 'plus' : 'minus';
    li.querySelector('button').onclick = () => { items = items.filter((x) => x !== it); save(); };
    $('#list').append(li);
  }
}
function save() { localStorage.setItem(KEY, JSON.stringify(items)); render(); }
$('#form').onsubmit = (e) => { e.preventDefault(); items.push({ desc: $('#desc').value.trim(), amount: +$('#amt').value, type: $('#type').value, category: $('#type').value === 'income' ? 'Salary' : $('#cat').value, at: Date.now() }); e.target.reset(); save(); };
render();
