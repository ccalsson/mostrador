// Mide el desborde horizontal del sitio legal emulando un viewport real por CDP.
// Uso: node medir-desborde.mjs <url> <ancho>
const [url, anchoArg] = process.argv.slice(2);
const ancho = Number(anchoArg) || 390;
const alto = 844;
const puerto = 9333;
const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const { spawn } = await import('node:child_process');

const proc = spawn(chrome, [
  '--headless=new',
  `--remote-debugging-port=${puerto}`,
  '--disable-gpu',
  '--no-first-run',
  `--window-size=${ancho},${alto}`,
  'about:blank',
], { stdio: 'ignore' });

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

let targets = [];
for (let i = 0; i < 40; i++) {
  await esperar(250);
  try {
    const r = await fetch(`http://127.0.0.1:${puerto}/json/list`);
    targets = (await r.json()).filter((t) => t.type === 'page');
    if (targets.length) break;
  } catch {}
}
if (!targets.length) { proc.kill(); throw new Error('CDP no respondió'); }

const ws = new WebSocket(targets[0].webSocketDebuggerUrl);
await new Promise((r, j) => { ws.onopen = r; ws.onerror = j; });
let id = 0;
const pendientes = new Map();
ws.onmessage = (e) => {
  const msg = JSON.parse(e.data);
  const p = pendientes.get(msg.id);
  if (p) { pendientes.delete(msg.id); msg.error ? p.j(new Error(JSON.stringify(msg.error))) : p.r(msg.result); }
};
const cmd = (method, params = {}) => new Promise((r, j) => {
  const n = ++id;
  pendientes.set(n, { r, j });
  ws.send(JSON.stringify({ id: n, method, params }));
});

await cmd('Page.enable');
await cmd('Emulation.setDeviceMetricsOverride', { width: ancho, height: alto, deviceScaleFactor: 1, mobile: true });
await cmd('Page.navigate', { url });
await esperar(2500);

const expr = `(() => {
  const d = document.documentElement;
  const informe = { interior: innerWidth, scroll: d.scrollWidth, body: document.body.scrollWidth };
  const culpables = [];
  for (const el of document.querySelectorAll('*')) {
    const r = el.getBoundingClientRect();
    if (r.right > innerWidth + 1 || r.width > innerWidth + 1) {
      culpables.push({
        etiqueta: el.tagName.toLowerCase(),
        clases: el.className && String(el.className).slice(0, 60),
        id: el.id,
        izquierda: Math.round(r.left),
        derecha: Math.round(r.right),
        ancho: Math.round(r.width),
        texto: (el.textContent || '').trim().slice(0, 45),
      });
    }
  }
  informe.culpables = culpables.slice(0, 15);
  informe.total = culpables.length;
  return JSON.stringify(informe);
})()`;

const res = await cmd('Runtime.evaluate', { expression: expr, returnByValue: true });
console.log(JSON.stringify(JSON.parse(res.result.value), null, 2));

ws.close();
proc.kill();
process.exit(0);
