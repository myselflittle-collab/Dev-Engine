import { winner, bestMove } from './logic.js';

describe('tic tac toe', () => {
  test('detects rows, diagonals and draws', () => {
    expect(winner(['X', 'X', 'X', null, null, null, null, null, null]).player).toBe('X');
    expect(winner(['O', null, null, null, 'O', null, null, null, 'O']).line).toEqual([0, 4, 8]);
    expect(winner(['X', 'O', 'X', 'X', 'O', 'O', 'O', 'X', 'X']).player).toBe('draw');
    expect(winner(Array(9).fill(null))).toBeNull();
  });
  test('computer wins when it can and blocks when it must', () => {
    expect(bestMove(['O', 'O', null, 'X', 'X', null, null, null, null])).toBe(2);
    expect(bestMove(['X', 'X', null, null, 'O', null, null, null, null])).toBe(2);
  });
});
