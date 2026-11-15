const KEY = 'notes-v1';
let notes = JSON.parse(localStorage.getItem(KEY) || '[]');
let cur = notes[0]?.id;
const $ = (s) => document.querySelector(s);
const save = () => { localStorage.setItem(KEY, JSON.stringify(notes)); $('#saved').textContent = 'Saved ' + new Date().toLocaleTimeString(); };
function newNote() { const n = { id: Date.now(), title: '', body: '', at: Date.now() }; notes.unshift(n); cur = n.id; save(); render(); $('#title').focus(); }
function render() {
  const q = $('#q').value.toLowerCase();
  $('#list').innerHTML = '';
  notes.filter((n) => (n.title + n.body).toLowerCase().includes(q)).forEach((n) => {
    const li = document.createElement('li'); li.className = n.id === cur ? 'on' : '';
    li.innerHTML = '<b></b><small></small>'; li.querySelector('b').textContent = n.title || 'Untitled'; li.querySelector('small').textContent = n.body.slice(0, 60) || 'Empty note';
    li.onclick = () => { cur = n.id; render(); }; $('#list').append(li);
  });
  const n = notes.find((x) => x.id === cur);
  $('#title').value = n ? n.title : ''; $('#body').value = n ? n.body : '';
  $('#title').disabled = $('#body').disabled = !n;
}
const edit = () => { const n = notes.find((x) => x.id === cur); if (!n) return; n.title = $('#title').value; n.body = $('#body').value; n.at = Date.now(); save(); const li = $('#list .on'); if (li) { li.querySelector('b').textContent = n.title || 'Untitled'; li.querySelector('small').textContent = n.body.slice(0, 60); } };
$('#title').oninput = edit; $('#body').oninput = edit;
$('#new').onclick = newNote; $('#q').oninput = render;
$('#del').onclick = () => { if (!cur || !confirm('Delete this note?')) return; notes = notes.filter((n) => n.id !== cur); cur = notes[0]?.id; save(); render(); };
if (!notes.length) newNote(); else render();
