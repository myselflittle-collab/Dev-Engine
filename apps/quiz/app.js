// Edit the questions below to make your own quiz!
const QUESTIONS = [
  { q: 'What does HTML stand for?', a: ['Hyper Text Markup Language', 'High Tech Modern Language', 'Home Tool Markup Language'], c: 0 },
  { q: 'Which language styles web pages?', a: ['Python', 'CSS', 'SQL'], c: 1 },
  { q: 'Which planet is known as the Red Planet?', a: ['Venus', 'Jupiter', 'Mars', 'Saturn'], c: 2 },
  { q: 'What is 12 × 12?', a: ['124', '144', '132'], c: 1 },
  { q: 'Konark Sun Temple is in which Indian state?', a: ['Odisha', 'Kerala', 'Gujarat'], c: 0 },
];
let i = 0; let score = 0;
const $ = (s) => document.querySelector(s);
function show() {
  const item = QUESTIONS[i];
  $('#progress').textContent = `Question ${i + 1} of ${QUESTIONS.length} · Score ${score}`;
  $('#fill').style.width = (i / QUESTIONS.length) * 100 + '%';
  $('#q').textContent = item.q; $('#fb').textContent = ''; $('#next').hidden = true;
  $('#opts').innerHTML = '';
  item.a.forEach((text, k) => {
    const b = document.createElement('button'); b.textContent = text; b.className = 'pop';
    b.onclick = () => {
      [...$('#opts').children].forEach((x, j) => { x.disabled = true; if (j === item.c) x.classList.add('right'); });
      if (k === item.c) { score++; $('#fb').textContent = '✅ Correct!'; } else { b.classList.add('wrong'); $('#fb').textContent = '❌ Not quite.'; }
      $('#next').hidden = false;
    };
    $('#opts').append(b);
  });
}
$('#next').onclick = () => { i++; if (i < QUESTIONS.length) show(); else finish(); };
function finish() {
  $('#fill').style.width = '100%';
  $('#progress').textContent = 'Finished!';
  const pct = Math.round((score / QUESTIONS.length) * 100);
  $('#q').textContent = pct >= 80 ? '🏆 Excellent!' : pct >= 50 ? '👍 Good job!' : '📚 Keep practising!';
  $('#opts').innerHTML = `<div class="score">${score}/${QUESTIONS.length}</div>`;
  $('#fb').textContent = `You scored ${pct}%`;
  $('#next').hidden = false; $('#next').textContent = 'Play again ↻';
  $('#next').onclick = () => { i = 0; score = 0; $('#next').textContent = 'Next →'; $('#next').onclick = () => { i++; if (i < QUESTIONS.length) show(); else finish(); }; show(); };
}
show();
