import { addTodo, toggleTodo, removeTodo, filterTodos, stats, sortByPriority, clearDone } from './logic.js';

const KEY = 'todos-v1';
let todos = JSON.parse(localStorage.getItem(KEY) || '[]');
let filter = 'all';
const $ = (s) => document.querySelector(s);

function save() { localStorage.setItem(KEY, JSON.stringify(todos)); }
function render() {
  const list = $('#list');
  list.innerHTML = '';
  const items = sortByPriority(filterTodos(todos, filter));
  if (!items.length) list.innerHTML = '<li class="empty">Nothing here 🎉</li>';
  for (const t of items) {
    const li = document.createElement('li');
    li.className = t.done ? 'done' : '';
    li.innerHTML = '<input type="checkbox"><span class="t"></span><span class="tag"></span><button class="del" title="Delete">✕</button>';
    li.querySelector('input').checked = t.done;
    li.querySelector('.t').textContent = t.text;
    const tag = li.querySelector('.tag'); tag.textContent = t.priority; tag.classList.add(t.priority);
    li.querySelector('input').onchange = () => { todos = toggleTodo(todos, t.id); save(); render(); };
    li.querySelector('.del').onclick = () => { todos = removeTodo(todos, t.id); save(); render(); };
    list.append(li);
  }
  const s = stats(todos);
  $('#stats').textContent = s.total ? `${s.left} left · ${s.done} done` : 'Plan your day';
}
$('#form').onsubmit = (e) => { e.preventDefault(); todos = addTodo(todos, $('#text').value, $('#prio').value); $('#text').value = ''; save(); render(); };
document.querySelectorAll('[data-f]').forEach((b) => { b.onclick = () => { filter = b.dataset.f; document.querySelectorAll('[data-f]').forEach((x) => x.classList.toggle('on', x === b)); render(); }; });
$('#clear').onclick = () => { todos = clearDone(todos); save(); render(); };
render();
