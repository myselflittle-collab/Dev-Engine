import test from 'node:test';
import assert from 'node:assert/strict';
import { generateSite, detectKind, extractName } from '../js/sitegen.js';
import { runCommand } from '../js/assistant.js';
import { renderSite, exportDocument } from '../js/siterender.js';

const all = (s) => s.sections.flatMap((x) => x.elements);
const sec = (s, t) => s.sections.find((x) => x.type === t);

test('detects website kind and name', () => {
  assert.equal(detectKind('make a website for my bakery'), 'restaurant');
  assert.equal(detectKind('create site for a vet clinic'), 'pet');
  assert.equal(detectKind('website for my dental clinic'), 'medical');
  assert.equal(detectKind('portfolio website'), 'portfolio');
  assert.equal(detectKind('make a website'), 'business');
  assert.equal(extractName('make a website for my gym called Iron House'), 'Iron House');
  assert.equal(extractName('website named "PetHealer" with animations'), 'PetHealer');
  const s = generateSite('make a website for my pet clinic called PetHealer');
  assert.equal(s.kind, 'pet'); assert.equal(s.name, 'PetHealer');
  assert.ok(s.sections.length >= 8);
});

test('assistant: animations', () => {
  const s = generateSite('bakery');
  let r = runCommand(s, 'animate the hero with bounce in');
  assert.ok(r.changed);
  assert.ok(sec(s, 'hero').elements.every((e) => e.anim.in === 'bounce-in'));
  r = runCommand(s, 'make buttons pulse');
  assert.ok(all(s).filter((e) => e.kind === 'button').every((e) => e.anim.loop === 'pulse'));
  r = runCommand(s, 'images zoom on hover');
  assert.ok(all(s).filter((e) => e.kind === 'image').every((e) => e.anim.hover === 'grow'));
  r = runCommand(s, 'typewriter effect on the hero title');
  assert.equal(sec(s, 'hero').elements.find((e) => e.kind === 'heading').anim.in, 'typewriter');
  r = runCommand(s, 'make the logo spin');
  assert.equal(sec(s, 'hero').elements.find((e) => e.kind === 'icon').anim.loop, 'spin');
  r = runCommand(s, 'make everything slide from left');
  assert.ok(all(s).filter((e) => e.kind !== 'nav').every((e) => e.anim.in === 'from-left'));
  r = runCommand(s, 'make it faster');
  assert.ok(r.changed);
  r = runCommand(s, 'parallax background on about');
  assert.equal(sec(s, 'about').anim.bgEffect, 'parallax');
  r = runCommand(s, 'add floating bubbles');
  assert.equal(sec(s, 'hero').anim.bgEffect, 'bubbles');
  r = runCommand(s, 'remove animations from the gallery');
  assert.ok(sec(s, 'gallery').elements.every((e) => !e.anim.in));
  assert.ok(sec(s, 'hero').elements.some((e) => e.anim.in));
});

test('assistant: content, theme and structure', () => {
  const s = generateSite('gym');
  runCommand(s, 'change the title to "No Pain No Gain"');
  assert.equal(sec(s, 'hero').elements.find((e) => e.kind === 'heading').props.text, 'No Pain No Gain');
  runCommand(s, 'change button text to Join today');
  assert.equal(sec(s, 'hero').elements.find((e) => e.kind === 'button').props.text, 'Join today');
  runCommand(s, 'rename the business to "Little Gym"');
  assert.equal(s.name, 'Little Gym');
  assert.match(sec(s, 'navbar').elements[0].props.brand, /Little Gym/);
  runCommand(s, 'make the theme purple');
  assert.equal(s.theme.primary, '#9333ea');
  runCommand(s, 'make the hero background pink');
  assert.equal(sec(s, 'hero').style.bg, '#ec4899');
  runCommand(s, 'light mode');
  assert.equal(s.theme.bg, '#ffffff');
  runCommand(s, 'use font Playfair Display');
  assert.equal(s.theme.headingFont, 'Playfair Display');
  const n = s.sections.length;
  let r = runCommand(s, 'add a video section');
  assert.equal(s.sections.length, n + 1);
  assert.ok(r.select);
  runCommand(s, 'remove the pricing section');
  assert.ok(!sec(s, 'pricing'));
  r = runCommand(s, 'add a button "Call us"');
  assert.ok(all(s).some((e) => e.kind === 'button' && e.props.text === 'Call us'));
  r = runCommand(s, 'make the title bigger');
  assert.ok(r.changed);
  r = runCommand(s, 'help');
  assert.match(r.reply, /animate/);
  r = runCommand(s, 'what is the meaning of life');
  assert.equal(r.reply, null);
});

test('assistant: selected element', () => {
  const s = generateSite('shop');
  const img = all(s).find((e) => e.kind === 'image');
  runCommand(s, 'make it bounce', { selectedId: img.id });
  assert.equal(img.anim.loop, 'bounce');
});

test('render + export contain animations and are safe', () => {
  const s = generateSite('make a website called <script>alert(1)</script>');
  runCommand(s, 'make buttons pulse');
  const r = renderSite(s, { mode: 'editor' });
  assert.ok(!r.body.includes('<script>alert'));
  assert.match(r.body, /l-pulse/);
  assert.match(r.body, /data-in="fade-up"/);
  const e = exportDocument(s);
  assert.match(e.html, /<link rel="stylesheet" href="style.css">/);
  assert.match(e.css, /@media \(max-width:760px\)/);
  assert.match(e.js, /IntersectionObserver/);
});
