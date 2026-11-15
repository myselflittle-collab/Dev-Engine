const $ = (s) => document.querySelector(s);
let mode = 'stopwatch'; let running = false; let start = 0; let elapsed = 0; let total = 0; let raf; let pomoWork = true;
const fmt = (ms) => { ms = Math.max(0, ms); const m = Math.floor(ms / 60000); const s = Math.floor(ms / 1000) % 60; const d = Math.floor(ms / 100) % 10; return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}${mode === 'stopwatch' ? '.' + d : ''}`; };
function tick() {
  const now = elapsed + (running ? Date.now() - start : 0);
  if (mode === 'stopwatch') { $('#time').textContent = fmt(now); $('#arc').style.strokeDashoffset = 283 - ((now / 1000) % 60) / 60 * 283; }
  else {
    const left = total - now; $('#time').textContent = fmt(left); $('#arc').style.strokeDashoffset = 283 * (1 - left / total);
    if (left <= 0 && running) { running = false; elapsed = total; $('#start').textContent = 'Start'; $('.ring').classList.add('done'); beep(); if (mode === 'pomodoro') { pomoWork = !pomoWork; setTimeout(() => setMode('pomodoro'), 1500); } }
  }
  if (running) raf = requestAnimationFrame(tick);
}
function beep() { try { const a = new AudioContext(); const o = a.createOscillator(); o.connect(a.destination); o.frequency.value = 880; o.start(); o.stop(a.currentTime + 0.6); } catch {} if (navigator.vibrate) navigator.vibrate(400); }
function setMode(m) {
  mode = m; running = false; cancelAnimationFrame(raf); elapsed = 0; $('.ring').classList.remove('done'); $('#start').textContent = 'Start'; $('#laps').innerHTML = '';
  document.querySelectorAll('[data-m]').forEach((b) => b.classList.toggle('on', b.dataset.m === m));
  $('#setup').hidden = m !== 'timer'; $('#lap').hidden = m !== 'stopwatch';
  total = m === 'pomodoro' ? (pomoWork ? 25 : 5) * 60000 : (+$('#min').value * 60 + +$('#sec').value) * 1000;
  if (m === 'pomodoro') $('#laps').innerHTML = `<li>${pomoWork ? '🍅 Focus time' : '☕ Break time'}</li>`;
  tick();
}
$('#start').onclick = () => {
  if (mode === 'timer' && !running && elapsed === 0) total = (+$('#min').value * 60 + +$('#sec').value) * 1000;
  if (mode !== 'stopwatch' && total <= 0) return;
  running = !running;
  if (running) { start = Date.now(); $('.ring').classList.remove('done'); tick(); } else elapsed += Date.now() - start;
  $('#start').textContent = running ? 'Pause' : 'Resume';
};
$('#reset').onclick = () => setMode(mode);
$('#lap').onclick = () => { if (running) { const li = document.createElement('li'); li.textContent = $('#time').textContent; $('#laps').prepend(li); } };
document.querySelectorAll('[data-m]').forEach((b) => { b.onclick = () => { pomoWork = true; setMode(b.dataset.m); }; });
setMode('stopwatch');
