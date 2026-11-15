const $ = (s) => document.querySelector(s);
const ICON = (c) => (c === 0 ? '☀️' : c <= 2 ? '🌤️' : c === 3 ? '☁️' : c <= 48 ? '🌫️' : c <= 57 ? '🌦️' : c <= 67 ? '🌧️' : c <= 77 ? '❄️' : c <= 82 ? '🌧️' : c <= 86 ? '🌨️' : '⛈️');
const DESC = (c) => (c === 0 ? 'Clear sky' : c <= 2 ? 'Partly cloudy' : c === 3 ? 'Overcast' : c <= 48 ? 'Fog' : c <= 57 ? 'Drizzle' : c <= 67 ? 'Rain' : c <= 77 ? 'Snow' : c <= 82 ? 'Showers' : 'Thunderstorm');
async function load(lat, lon, name) {
  $('#now').innerHTML = '<p class="muted">Loading…</p>';
  try {
    const r = await fetch(`https://api.open-meteo.com/v1/forecast?latitude=${lat}&longitude=${lon}&current=temperature_2m,relative_humidity_2m,weather_code,wind_speed_10m,apparent_temperature&daily=weather_code,temperature_2m_max,temperature_2m_min&timezone=auto`);
    const d = await r.json();
    const c = d.current;
    $('#now').innerHTML = `<span class="big pop">${ICON(c.weather_code)}</span><div><div class="t">${Math.round(c.temperature_2m)}°C</div><b></b><div class="muted small">${DESC(c.weather_code)} · Feels ${Math.round(c.apparent_temperature)}° · 💧${c.relative_humidity_2m}% · 💨${Math.round(c.wind_speed_10m)} km/h</div></div>`;
    $('#now b').textContent = name;
    $('#days').innerHTML = d.daily.time.map((t, i) => `<div class="pop" style="animation-delay:${i * 60}ms"><span class="muted">${new Date(t).toLocaleDateString(undefined, { weekday: 'short' })}</span><span class="ic">${ICON(d.daily.weather_code[i])}</span>${Math.round(d.daily.temperature_2m_max[i])}° <span class="muted">${Math.round(d.daily.temperature_2m_min[i])}°</span></div>`).join('');
  } catch (e) { $('#now').innerHTML = '<p>⚠️ Could not load weather. Check your internet connection.</p>'; }
}
async function search(q) {
  const r = await fetch(`https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=1`);
  const d = await r.json();
  if (!d.results || !d.results.length) { $('#now').innerHTML = '<p>City not found.</p>'; return; }
  const p = d.results[0];
  load(p.latitude, p.longitude, `${p.name}${p.admin1 ? ', ' + p.admin1 : ''}, ${p.country}`);
}
$('#form').onsubmit = (e) => { e.preventDefault(); search($('#city').value); };
$('#loc').onclick = () => navigator.geolocation.getCurrentPosition((p) => load(p.coords.latitude, p.coords.longitude, 'Your location'), () => alert('Location permission denied'));
search($('#city').value);
