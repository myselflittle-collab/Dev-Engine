export const LINES = [[0, 1, 2], [3, 4, 5], [6, 7, 8], [0, 3, 6], [1, 4, 7], [2, 5, 8], [0, 4, 8], [2, 4, 6]];
export function winner(b) {
  for (const [a, c, d] of LINES) if (b[a] && b[a] === b[c] && b[a] === b[d]) return { player: b[a], line: [a, c, d] };
  return b.every(Boolean) ? { player: 'draw', line: [] } : null;
}
/** Unbeatable computer move (minimax). */
export function bestMove(b, me = 'O') {
  const them = me === 'O' ? 'X' : 'O';
  function score(board, turn, depth) {
    const w = winner(board);
    if (w) return w.player === me ? 10 - depth : w.player === them ? depth - 10 : 0;
    const scores = board.map((v, i) => { if (v) return null; board[i] = turn; const s = score(board, turn === me ? them : me, depth + 1); board[i] = null; return s; }).filter((s) => s !== null);
    return turn === me ? Math.max(...scores) : Math.min(...scores);
  }
  let best = -Infinity; let move = -1;
  b.forEach((v, i) => { if (v) return; b[i] = me; const s = score(b, them, 1); b[i] = null; if (s > best) { best = s; move = i; } });
  return move;
}
