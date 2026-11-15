import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { classify, loadApp, APPS } from '../js/appgen.js';

test('classifies requests', () => {
  assert.deepEqual(classify('make a website for my bakery').type, 'website');
  assert.equal(classify('Create website for my pet clinic called PetHealer').kind, 'pet');
  assert.equal(classify('create a portfolio website').kind, 'portfolio');
  assert.equal(classify('build a todo app').recipe, 'todo');
  assert.equal(classify('I need an expense tracker').recipe, 'expense');
  assert.equal(classify('make a snake game').recipe, 'snake');
  assert.equal(classify('build a weather app').recipe, 'weather');
  assert.equal(classify('build a todo web app').type, 'app');
  assert.equal(classify('make a tic tac toe game').recipe, 'tictactoe');
  const c = classify('build a hospital management software');
  assert.equal(c.type, 'app'); assert.equal(c.recipe, null); assert.equal(c.name, 'Hospital Management App');
  assert.equal(classify('write a python script that renames files').type, 'code');
  assert.equal(classify('hello how are you').type, 'chat');
});

test('every app recipe loads, has its files and name substituted', async () => {
  const read = async (p) => fs.readFileSync(new URL('../' + p, import.meta.url), 'utf8');
  for (const a of APPS) {
    const f = await loadApp(a.id, 'Little App', read);
    assert.ok(f['index.html'].includes('Little App'), a.id);
    assert.ok(!f['style.css'].includes('@import'), a.id + ' base css inlined');
    assert.ok(f['index.html'].includes('app.js'), a.id);
    for (const x of a.files) assert.ok(x in f, `${a.id}/${x}`);
  }
});

test('app logic modules pass their own tests (via Node)', async () => {
  const calc = await import('../apps/calculator/logic.js');
  assert.equal(calc.evaluate('2+3*4'), 14);
  assert.throws(() => calc.evaluate('1/0'));
  const ttt = await import('../apps/tictactoe/logic.js');
  assert.equal(ttt.bestMove(['X', 'X', null, null, 'O', null, null, null, null]), 2);
  const exp = await import('../apps/expense/logic.js');
  assert.equal(exp.summary([{ type: 'income', amount: 10 }, { type: 'expense', amount: 4, category: 'Food' }]).balance, 6);
});
