const COLS = ['📝 To do', '🚧 Doing', '✅ Done'];
let cards = JSON.parse(localStorage.getItem('kanban-v1') || 'null') || [{ id: 1, text: 'Plan the project', col: 0 }, { id: 2, text: 'Design the UI', col: 1 }, { id: 3, text: 'Set up the repo', col: 2 }];
const save = () => { localStorage.setItem('kanban-v1', JSON.stringify(cards)); render(); };
function render() {
  const b = document.getElementById('board'); b.innerHTML = '';
  COLS.forEach((name, ci) => {
    const col = document.createElement('section'); col.className = 'card col';
    const list = cards.filter((c) => c.col === ci);
    col.innerHTML = `<h2>${name} <span>${list.length}</span></h2><div class="cards"></div><form><input placeholder="Add a card…"><button>＋</button></form>`;
    for (const c of list) {
      const k = document.createElement('div'); k.className = 'k';
      k.innerHTML = '<div class="t"></div><div class="a"></div>'; k.querySelector('.t').textContent = c.text;
      const a = k.querySelector('.a');
      const btn = (l, f) => { const x = document.createElement('button'); x.textContent = l; x.onclick = f; a.append(x); };
      if (ci > 0) btn('◀', () => { c.col--; save(); });
      if (ci < COLS.length - 1) btn('▶', () => { c.col++; save(); });
      btn('✕', () => { cards = cards.filter((x) => x !== c); save(); });
      col.querySelector('.cards').append(k);
    }
    col.querySelector('form').onsubmit = (e) => { e.preventDefault(); const v = e.target[0].value.trim(); if (v) { cards.push({ id: Date.now(), text: v, col: ci }); save(); } };
    b.append(col);
  });
}
render();
