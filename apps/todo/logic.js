// Pure logic — easy to test (see logic.test.js)
export function addTodo(todos, text, priority = 'normal') {
  const t = String(text).trim();
  if (!t) return todos;
  return [...todos, { id: Date.now() + Math.random(), text: t, done: false, priority }];
}
export function toggleTodo(todos, id) { return todos.map((t) => (t.id === id ? { ...t, done: !t.done } : t)); }
export function removeTodo(todos, id) { return todos.filter((t) => t.id !== id); }
export function clearDone(todos) { return todos.filter((t) => !t.done); }
export function filterTodos(todos, f) { return f === 'active' ? todos.filter((t) => !t.done) : f === 'done' ? todos.filter((t) => t.done) : todos; }
export function sortByPriority(todos) { const o = { high: 0, normal: 1, low: 2 }; return [...todos].sort((a, b) => (a.done - b.done) || (o[a.priority] - o[b.priority])); }
export function stats(todos) { const done = todos.filter((t) => t.done).length; return { total: todos.length, done, left: todos.length - done }; }
