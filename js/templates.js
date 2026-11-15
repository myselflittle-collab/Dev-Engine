// Starter templates — mirrors Replit's "Create Repl" templates.
// `runtime` decides how the Run button executes the project:
//   web    -> HTML/CSS/JS live webview
//   node   -> JavaScript/TypeScript program with console (in-browser Node-like runtime)
//   python -> Python via Pyodide (in-browser CPython/WebAssembly)
//   server -> needs the optional Dev Engine backend (C, C++, Java, Go, Rust, Bash…)

export const TEMPLATES = [
  {
    id: 'html', name: 'HTML, CSS, JS', icon: '🌐', runtime: 'web', color: '#e44d26',
    desc: 'Static website with live webview',
    files: {
      'index.html': `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>My Website</title>
  <link rel="stylesheet" href="style.css" />
</head>
<body>
  <main>
    <h1>Hello from Dev Engine 👋</h1>
    <p>Edit <code>index.html</code>, <code>style.css</code> and <code>script.js</code>, then press <b>Run</b>.</p>
    <button id="btn">Click me</button>
    <p id="count">Clicks: 0</p>
  </main>
  <script src="script.js"></script>
</body>
</html>
`,
      'style.css': `body {
  font-family: system-ui, sans-serif;
  background: linear-gradient(135deg, #0f172a, #1e293b);
  color: #f1f5f9;
  min-height: 100vh;
  margin: 0;
  display: grid;
  place-items: center;
}
main { text-align: center; }
button {
  background: #f26207; color: white; border: 0; padding: 10px 22px;
  border-radius: 8px; font-size: 16px; cursor: pointer;
}
code { background: #334155; padding: 2px 6px; border-radius: 4px; }
`,
      'script.js': `let clicks = 0;
document.getElementById('btn').addEventListener('click', () => {
  clicks++;
  document.getElementById('count').textContent = 'Clicks: ' + clicks;
  console.log('Button clicked', clicks, 'times');
});
console.log('Website loaded!');
`,
    },
  },
  {
    id: 'python', name: 'Python', icon: '🐍', runtime: 'python', color: '#3776ab',
    desc: 'Python 3 (runs in your browser via WebAssembly)',
    files: {
      'main.py': `def greet(name):
    return f"Hello, {name}!"


def main():
    print(greet("Dev Engine"))
    numbers = [3, 1, 4, 1, 5, 9, 2, 6]
    print("Sorted:", sorted(numbers))
    print("Sum:", sum(numbers))


if __name__ == "__main__":
    main()
`,
      'requirements.txt': `# Add packages here (pure-Python wheels or Pyodide packages), e.g.\n# numpy\n`,
    },
  },
  {
    id: 'python-tests', name: 'Python + pytest', icon: '🧪', runtime: 'python', color: '#0a9edc',
    desc: 'Python project with pytest unit tests',
    files: {
      'calculator.py': `def add(a, b):
    return a + b


def divide(a, b):
    if b == 0:
        raise ValueError("Cannot divide by zero")
    return a / b


def average(values):
    # BUG: crashes on an empty list — run the tests and let the Agent fix it!
    return sum(values) / len(values)
`,
      'main.py': `from calculator import add, divide, average

print("2 + 3 =", add(2, 3))
print("10 / 4 =", divide(10, 4))
print("avg =", average([1, 2, 3, 4]))
`,
      'test_calculator.py': `import pytest
from calculator import add, divide, average


def test_add():
    assert add(2, 3) == 5


def test_divide():
    assert divide(9, 3) == 3


def test_divide_by_zero():
    with pytest.raises(ValueError):
        divide(1, 0)


def test_average_empty_list_returns_zero():
    assert average([]) == 0
`,
    },
  },
  {
    id: 'node', name: 'Node.js', icon: '🟩', runtime: 'node', color: '#3c873a',
    desc: 'JavaScript program with modules & npm packages',
    files: {
      'index.js': `import { sum, isPrime } from './utils.js';

console.log('Hello from Node.js on Dev Engine!');
console.log('Sum of 1..10 =', sum([1,2,3,4,5,6,7,8,9,10]));
console.log('Primes under 30:', Array.from({ length: 30 }, (_, i) => i).filter(isPrime));
console.log('Env NODE_ENV =', process.env.NODE_ENV);
`,
      'utils.js': `export function sum(arr) {
  return arr.reduce((a, b) => a + b, 0);
}

export function isPrime(n) {
  if (n < 2) return false;
  for (let i = 2; i * i <= n; i++) if (n % i === 0) return false;
  return true;
}
`,
      'utils.test.js': `import { sum, isPrime } from './utils.js';

describe('utils', () => {
  test('sum adds numbers', () => {
    expect(sum([1, 2, 3])).toBe(6);
  });
  test('isPrime', () => {
    expect(isPrime(7)).toBe(true);
    expect(isPrime(8)).toBe(false);
  });
});
`,
      'package.json': `{
  "name": "my-node-app",
  "version": "1.0.0",
  "type": "module",
  "main": "index.js",
  "dependencies": {}
}
`,
    },
  },
  {
    id: 'typescript', name: 'TypeScript', icon: '🟦', runtime: 'node', color: '#3178c6',
    desc: 'Typed JavaScript, compiled on the fly',
    files: {
      'index.ts': `interface User {
  name: string;
  age: number;
}

function describe(user: User): string {
  return \`\${user.name} is \${user.age} years old\`;
}

const users: User[] = [
  { name: 'Asha', age: 28 },
  { name: 'Ravi', age: 34 },
];

users.forEach((u) => console.log(describe(u)));
`,
      'package.json': `{\n  "name": "ts-app",\n  "main": "index.ts",\n  "dependencies": {}\n}\n`,
    },
  },
  {
    id: 'react', name: 'React', icon: '⚛️', runtime: 'web', color: '#61dafb',
    desc: 'React 18 app with JSX (no build step)',
    files: {
      'index.html': `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>React App</title>
  <link rel="stylesheet" href="src/App.css" />
</head>
<body>
  <div id="root"></div>
  <script type="module" src="src/main.jsx"></script>
</body>
</html>
`,
      'src/main.jsx': `import React from 'react';
import { createRoot } from 'react-dom/client';
import App from './App.jsx';

createRoot(document.getElementById('root')).render(<App />);
`,
      'src/App.jsx': `import React, { useState } from 'react';

export default function App() {
  const [todos, setTodos] = useState(['Learn React', 'Build on Dev Engine']);
  const [text, setText] = useState('');
  const add = () => { if (text.trim()) { setTodos([...todos, text]); setText(''); } };
  return (
    <div className="app">
      <h1>⚛️ React Todo</h1>
      <div className="row">
        <input value={text} onChange={(e) => setText(e.target.value)} placeholder="New todo" />
        <button onClick={add}>Add</button>
      </div>
      <ul>{todos.map((t, i) => <li key={i}>{t}</li>)}</ul>
    </div>
  );
}
`,
      'src/App.css': `body { font-family: system-ui, sans-serif; background: #20232a; color: #fff; margin: 0; }
.app { max-width: 420px; margin: 40px auto; padding: 0 16px; }
h1 { color: #61dafb; }
.row { display: flex; gap: 8px; }
input { flex: 1; padding: 8px; border-radius: 6px; border: 1px solid #555; background: #282c34; color: #fff; }
button { padding: 8px 16px; border-radius: 6px; border: 0; background: #61dafb; color: #20232a; font-weight: 600; }
li { padding: 6px 0; border-bottom: 1px solid #333; }
`,
      'package.json': `{\n  "name": "react-app",\n  "dependencies": {\n    "react": "18.3.1",\n    "react-dom": "18.3.1"\n  }\n}\n`,
    },
  },
  {
    id: 'canvas-game', name: 'Kaboom / Canvas Game', icon: '🎮', runtime: 'web', color: '#a855f7',
    desc: 'HTML5 canvas game starter',
    files: {
      'index.html': `<!DOCTYPE html>
<html><head><meta charset="UTF-8"><title>Game</title>
<style>body{margin:0;background:#111;display:grid;place-items:center;height:100vh;color:#fff;font-family:sans-serif}canvas{background:#1e1e2e;border-radius:8px}</style>
</head><body>
<div><canvas id="c" width="400" height="300"></canvas><p>Use ← → to move. Catch the stars!</p></div>
<script src="game.js"></script>
</body></html>
`,
      'game.js': `const c = document.getElementById('c'), ctx = c.getContext('2d');
let x = 180, score = 0, stars = [], keys = {};
addEventListener('keydown', e => keys[e.key] = true);
addEventListener('keyup', e => keys[e.key] = false);
function loop() {
  if (keys.ArrowLeft) x -= 5; if (keys.ArrowRight) x += 5;
  x = Math.max(0, Math.min(360, x));
  if (Math.random() < 0.03) stars.push({ x: Math.random() * 390, y: 0 });
  stars.forEach(s => s.y += 3);
  stars = stars.filter(s => { if (s.y > 270 && s.x > x - 10 && s.x < x + 40) { score++; return false; } return s.y < 300; });
  ctx.clearRect(0, 0, 400, 300);
  ctx.fillStyle = '#f26207'; ctx.fillRect(x, 280, 40, 12);
  ctx.fillStyle = '#facc15'; stars.forEach(s => ctx.fillRect(s.x, s.y, 10, 10));
  ctx.fillStyle = '#fff'; ctx.fillText('Score: ' + score, 10, 20);
  requestAnimationFrame(loop);
}
loop();
`,
    },
  },
  {
    id: 'c', name: 'C', icon: '©️', runtime: 'server', color: '#5c6bc0', desc: 'C with GCC (needs backend)',
    files: { 'main.c': `#include <stdio.h>\n\nint main(void) {\n    printf("Hello from C!\\n");\n    return 0;\n}\n`, '.devengine': `run = "gcc main.c -o main && ./main"\n` },
  },
  {
    id: 'cpp', name: 'C++', icon: '➕', runtime: 'server', color: '#00599c', desc: 'C++ with G++ (needs backend)',
    files: { 'main.cpp': `#include <iostream>\n\nint main() {\n    std::cout << "Hello from C++!" << std::endl;\n    return 0;\n}\n`, '.devengine': `run = "g++ -std=c++17 main.cpp -o main && ./main"\n` },
  },
  {
    id: 'java', name: 'Java', icon: '☕', runtime: 'server', color: '#b07219', desc: 'Java (needs backend)',
    files: { 'Main.java': `public class Main {\n    public static void main(String[] args) {\n        System.out.println("Hello from Java!");\n    }\n}\n`, '.devengine': `run = "javac Main.java && java Main"\n` },
  },
  {
    id: 'go', name: 'Go', icon: '🐹', runtime: 'server', color: '#00add8', desc: 'Go (needs backend)',
    files: { 'main.go': `package main\n\nimport "fmt"\n\nfunc main() {\n\tfmt.Println("Hello from Go!")\n}\n`, '.devengine': `run = "go run main.go"\n` },
  },
  {
    id: 'rust', name: 'Rust', icon: '🦀', runtime: 'server', color: '#dea584', desc: 'Rust (needs backend)',
    files: { 'main.rs': `fn main() {\n    println!("Hello from Rust!");\n}\n`, '.devengine': `run = "rustc main.rs -o main && ./main"\n` },
  },
  {
    id: 'bash', name: 'Bash', icon: '💲', runtime: 'server', color: '#4eaa25', desc: 'Shell scripts (needs backend)',
    files: { 'main.sh': `#!/bin/bash\necho "Hello from Bash!"\nfor i in 1 2 3; do echo "Count $i"; done\n`, '.devengine': `run = "bash main.sh"\n` },
  },
  {
    id: 'blank', name: 'Blank project', icon: '⬜', runtime: 'web', color: '#64748b', desc: 'Start from nothing',
    files: { 'index.html': `<!DOCTYPE html>\n<html>\n<body>\n  <h1>Blank</h1>\n</body>\n</html>\n` },
  },
];

export function getTemplate(id) {
  return TEMPLATES.find((t) => t.id === id) || TEMPLATES[0];
}

/** Guess the entry file of a project for a runtime. */
export function defaultEntry(runtime, files) {
  const names = Object.keys(files);
  const pick = (...c) => c.find((n) => names.includes(n));
  if (runtime === 'web') return pick('index.html', 'public/index.html', 'src/index.html') || names.find((n) => n.endsWith('.html'));
  if (runtime === 'python') return pick('main.py', 'app.py', 'src/main.py') || names.find((n) => n.endsWith('.py') && !/^test_|_test\.py$/.test(n));
  if (runtime === 'node') {
    try {
      const pkg = JSON.parse(files['package.json'] || '{}');
      if (pkg.main && names.includes(pkg.main)) return pkg.main;
    } catch { /* ignore */ }
    return pick('index.js', 'index.ts', 'main.js', 'main.ts', 'src/index.js', 'src/index.ts', 'app.js');
  }
  return names[0];
}

/** Infer runtime from files when a project was imported. */
export function detectRuntime(files) {
  const names = Object.keys(files);
  if (names.some((n) => n.endsWith('.html'))) return 'web';
  if (names.some((n) => n.endsWith('.py'))) return 'python';
  if (names.some((n) => /\.(m?js|ts)$/.test(n))) return 'node';
  return 'server';
}
