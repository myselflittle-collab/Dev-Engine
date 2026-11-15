const U = {
  Length: { metre: 1, kilometre: 1000, centimetre: 0.01, millimetre: 0.001, mile: 1609.344, yard: 0.9144, foot: 0.3048, inch: 0.0254 },
  Weight: { kilogram: 1, gram: 0.001, tonne: 1000, pound: 0.45359237, ounce: 0.028349523125 },
  Area: { 'square metre': 1, 'square foot': 0.09290304, acre: 4046.8564224, hectare: 10000, 'square km': 1e6 },
  Speed: { 'km/h': 1 / 3.6, 'm/s': 1, mph: 0.44704, knot: 0.514444 },
  Data: { byte: 1, KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3, TB: 1024 ** 4 },
  Temperature: { Celsius: 'C', Fahrenheit: 'F', Kelvin: 'K' },
};
const $ = (s) => document.querySelector(s);
const toC = (v, u) => (u === 'C' ? v : u === 'F' ? (v - 32) * 5 / 9 : v - 273.15);
const fromC = (v, u) => (u === 'C' ? v : u === 'F' ? v * 9 / 5 + 32 : v + 273.15);
function fill() {
  const units = Object.keys(U[$('#cat').value]);
  for (const s of [$('#ua'), $('#ub')]) s.innerHTML = units.map((u) => `<option>${u}</option>`).join('');
  $('#ub').selectedIndex = 1; conv();
}
function conv(rev) {
  const cat = U[$('#cat').value]; const [from, to, src, dst] = rev ? [$('#ub'), $('#ua'), $('#b'), $('#a')] : [$('#ua'), $('#ub'), $('#a'), $('#b')];
  const v = parseFloat(src.value); if (isNaN(v)) { dst.value = ''; return; }
  const r = $('#cat').value === 'Temperature' ? fromC(toC(v, cat[from.value]), cat[to.value]) : v * cat[from.value] / cat[to.value];
  dst.value = +r.toPrecision(10);
}
$('#cat').innerHTML = Object.keys(U).map((c) => `<option>${c}</option>`).join('');
$('#cat').onchange = fill; $('#a').oninput = () => conv(); $('#b').oninput = () => conv(true); $('#ua').onchange = () => conv(); $('#ub').onchange = () => conv();
$('#swap').onclick = () => { const i = $('#ua').selectedIndex; $('#ua').selectedIndex = $('#ub').selectedIndex; $('#ub').selectedIndex = i; conv(); };
fill();
