import { addTodo, toggleTodo, removeTodo, filterTodos, stats, sortByPriority, clearDone } from './logic.js';

describe('todo logic', () => {
  test('adds trimmed todos and ignores empty ones', () => {
    let t = addTodo([], '  Buy milk ');
    expect(t).toHaveLength(1);
    expect(t[0].text).toBe('Buy milk');
    expect(addTodo(t, '   ')).toHaveLength(1);
  });
  test('toggles, filters, clears and counts', () => {
    let t = addTodo(addTodo([], 'A'), 'B');
    t = toggleTodo(t, t[0].id);
    expect(filterTodos(t, 'done')).toHaveLength(1);
    expect(filterTodos(t, 'active')[0].text).toBe('B');
    expect(stats(t)).toEqual({ total: 2, done: 1, left: 1 });
    expect(clearDone(t)).toHaveLength(1);
    expect(removeTodo(t, t[1].id)).toHaveLength(1);
  });
  test('sorts high priority first', () => {
    const t = addTodo(addTodo([], 'low', 'low'), 'urgent', 'high');
    expect(sortByPriority(t)[0].text).toBe('urgent');
  });
});
