const $ = (s) => document.querySelector(s);
const SETS = { up: 'ABCDEFGHJKLMNPQRSTUVWXYZ', lo: 'abcdefghijkmnopqrstuvwxyz', num: '23456789', sym: '!@#$%^&*()-_=+[]{};:,.?' };
function rand(n) { const a = new Uint32Array(1); crypto.getRandomValues(a); return a[0] % n; }
function generate() {
  const sets = Object.keys(SETS).filter((k) => $('#' + k).checked).map((k) => SETS[k]);
  if (!sets.length) { $('#out').value = 'Pick at least one option'; return; }
  const len = +$('#len').value; const all = sets.join('');
  const chars = sets.map((s) => s[rand(s.length)]);
  while (chars.length < len) chars.push(all[rand(all.length)]);
  for (let i = chars.length - 1; i > 0; i--) { const j = rand(i + 1); [chars[i], chars[j]] = [chars[j], chars[i]]; }
  $('#out').value = chars.join('');
  const bits = Math.round(len * Math.log2(all.length));
  const lvl = bits < 40 ? ['Weak', '#ef4444', 25] : bits < 60 ? ['OK', '#f59e0b', 50] : bits < 90 ? ['Strong', '#22c55e', 75] : ['Very strong', '#10b981', 100];
  $('#strength').textContent = `${lvl[0]} · ~${bits} bits of entropy`; $('#m').style.width = lvl[2] + '%'; $('#m').style.background = lvl[1];
}
$('#len').oninput = () => { $('#lenv').textContent = $('#len').value; generate(); };
document.querySelectorAll('input[type=checkbox]').forEach((c) => { c.onchange = generate; });
$('#gen').onclick = generate;
$('#copy').onclick = async () => { try { await navigator.clipboard.writeText($('#out').value); $('#copy').textContent = 'Copied ✓'; } catch { $('#out').select(); } setTimeout(() => { $('#copy').textContent = 'Copy'; }, 1500); };
generate();
