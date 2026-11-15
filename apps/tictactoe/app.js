import { winner, bestMove } from './logic.js';
const $ = (s) => document.querySelector(s);
let board = Array(9).fill(null); let turn = 'X'; let over = false; const score = { X: 0, O: 0, draw: 0 };
const cells = [...Array(9)].map((_, i) => { const b = document.createElement('button'); b.onclick = () => play(i); $('#board').append(b); return b; });
function play(i) {
  if (over || board[i]) return;
  board[i] = turn; turn = turn === 'X' ? 'O' : 'X'; draw();
  if (!over && $('#mode').value === 'ai' && turn === 'O') { $('#status').textContent = 'Computer is thinking…'; setTimeout(() => play(bestMove(board)), 350); }
}
function draw() {
  cells.forEach((c, i) => { c.textContent = board[i] || ''; c.className = (board[i] || '').toLowerCase(); });
  const w = winner(board);
  if (w) {
    over = true; score[w.player]++;
    w.line.forEach((i) => cells[i].classList.add('win'));
    $('#status').textContent = w.player === 'draw' ? "It's a draw 🤝" : `${w.player} wins! 🎉`;
    $('#score').textContent = `X ${score.X} · O ${score.O} · Draw ${score.draw}`;
  } else $('#status').textContent = `${turn === 'X' ? 'Your' : $('#mode').value === 'ai' ? "Computer's" : "O's"} turn (${turn})`;
}
$('#reset').onclick = () => { board = Array(9).fill(null); turn = 'X'; over = false; draw(); };
$('#mode').onchange = () => $('#reset').click();
draw();
