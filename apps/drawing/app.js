const c = document.getElementById('c'); const ctx = c.getContext('2d');
const $ = (s) => document.querySelector(s);
let drawing = false; let eraser = false; let last; const history = [];
function resize() { const img = c.width ? ctx.getImageData(0, 0, c.width, c.height) : null; const r = c.getBoundingClientRect(); c.width = r.width * devicePixelRatio; c.height = r.height * devicePixelRatio; ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); if (img) ctx.putImageData(img, 0, 0); }
const pos = (e) => { const r = c.getBoundingClientRect(); return { x: (e.clientX - r.left) * devicePixelRatio, y: (e.clientY - r.top) * devicePixelRatio, p: e.pressure || 0.5 }; };
c.addEventListener('pointerdown', (e) => { drawing = true; last = pos(e); history.push(ctx.getImageData(0, 0, c.width, c.height)); if (history.length > 30) history.shift(); c.setPointerCapture(e.pointerId); });
c.addEventListener('pointermove', (e) => {
  if (!drawing) return; const p = pos(e);
  ctx.strokeStyle = eraser ? '#fff' : $('#color').value; ctx.lineCap = ctx.lineJoin = 'round';
  ctx.lineWidth = +$('#size').value * devicePixelRatio * (e.pointerType === 'pen' ? p.p * 2 : 1);
  ctx.beginPath(); ctx.moveTo(last.x, last.y); ctx.lineTo(p.x, p.y); ctx.stroke(); last = p;
});
addEventListener('pointerup', () => { drawing = false; });
$('#eraser').onclick = () => { eraser = !eraser; $('#eraser').classList.toggle('on', eraser); };
$('#undo').onclick = () => { const h = history.pop(); if (h) ctx.putImageData(h, 0, 0); };
$('#clear').onclick = () => { history.push(ctx.getImageData(0, 0, c.width, c.height)); ctx.fillStyle = '#fff'; ctx.fillRect(0, 0, c.width, c.height); };
$('#save').onclick = () => { const a = document.createElement('a'); a.download = 'drawing.png'; a.href = c.toDataURL('image/png'); a.click(); };
resize(); addEventListener('resize', resize);
