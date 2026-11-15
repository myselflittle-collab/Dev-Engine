const c = document.getElementById('c'); const ctx = c.getContext('2d');
const N = 20; const S = c.width / N;
let snake, dir, next, food, score, best = +(localStorage.getItem('snake-best') || 0), timer, paused = false, speed;
const $ = (s) => document.querySelector(s);
function reset() { snake = [{ x: 8, y: 10 }, { x: 7, y: 10 }, { x: 6, y: 10 }]; dir = next = { x: 1, y: 0 }; score = 0; speed = 130; placeFood(); loop(); }
function placeFood() { do { food = { x: Math.floor(Math.random() * N), y: Math.floor(Math.random() * N) }; } while (snake.some((p) => p.x === food.x && p.y === food.y)); }
function loop() { clearTimeout(timer); timer = setTimeout(step, speed); }
function step() {
  if (paused) return loop();
  dir = next;
  const head = { x: (snake[0].x + dir.x + N) % N, y: (snake[0].y + dir.y + N) % N };
  if (snake.some((p) => p.x === head.x && p.y === head.y)) return gameOver();
  snake.unshift(head);
  if (head.x === food.x && head.y === food.y) { score++; speed = Math.max(60, speed - 3); placeFood(); if (navigator.vibrate) navigator.vibrate(30); } else snake.pop();
  draw(); loop();
}
function draw() {
  ctx.clearRect(0, 0, c.width, c.height);
  ctx.fillStyle = '#ef4444'; ctx.beginPath(); ctx.arc(food.x * S + S / 2, food.y * S + S / 2, S / 2.4, 0, 7); ctx.fill();
  snake.forEach((p, i) => { ctx.fillStyle = i === 0 ? '#a5b4fc' : `hsl(${240 - i * 3},80%,${65 - Math.min(i, 20)}%)`; ctx.beginPath(); ctx.roundRect(p.x * S + 1, p.y * S + 1, S - 2, S - 2, 5); ctx.fill(); });
  $('#score').textContent = 'Score ' + score; $('#best').textContent = 'Best ' + best;
}
function gameOver() {
  if (score > best) { best = score; localStorage.setItem('snake-best', best); }
  draw(); ctx.fillStyle = 'rgba(0,0,0,.6)'; ctx.fillRect(0, 0, c.width, c.height);
  ctx.fillStyle = '#fff'; ctx.font = 'bold 32px system-ui'; ctx.textAlign = 'center'; ctx.fillText('Game over', 200, 190); ctx.font = '18px system-ui'; ctx.fillText('Tap to play again', 200, 225);
  c.onclick = () => { c.onclick = null; reset(); };
}
const turn = (d) => { const m = { up: { x: 0, y: -1 }, down: { x: 0, y: 1 }, left: { x: -1, y: 0 }, right: { x: 1, y: 0 } }[d]; if (m && (m.x !== -dir.x || m.y !== -dir.y)) next = m; };
document.addEventListener('keydown', (e) => { const k = { ArrowUp: 'up', ArrowDown: 'down', ArrowLeft: 'left', ArrowRight: 'right', w: 'up', s: 'down', a: 'left', d: 'right' }[e.key]; if (k) { e.preventDefault(); turn(k); } if (e.key === ' ') paused = !paused; });
document.querySelectorAll('[data-d]').forEach((b) => { b.onclick = () => turn(b.dataset.d); });
$('#pause').onclick = () => { paused = !paused; };
let t0; c.addEventListener('touchstart', (e) => { t0 = e.touches[0]; }, { passive: true });
c.addEventListener('touchend', (e) => { if (!t0) return; const t = e.changedTouches[0]; const dx = t.clientX - t0.clientX; const dy = t.clientY - t0.clientY; if (Math.max(Math.abs(dx), Math.abs(dy)) > 20) turn(Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'right' : 'left') : (dy > 0 ? 'down' : 'up')); });
reset();
