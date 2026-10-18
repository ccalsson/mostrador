// Captura el sitio legal con emulación real de viewport por CDP.
// --window-size no sirve: Chrome impone un ancho mínimo de ventana y recorta la imagen.
// Uso: node capturar-sitio.mjs <directorio-salida> [url-base] [prefijo]
import { spawn } from 'node:child_process';
import { mkdirSync, writeFileSync } from 'node:fs';
import { Buffer } from 'node:buffer';

const salida = process.argv[2];
const base = process.argv[3] || 'http://localhost:8099';
const prefijo = process.argv[4] || '';
const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const puerto = 9334;
mkdirSync(salida, { recursive: true });

const capturas = [
  ['sitio-index-1440', '/index.html?app=mostrador', 1440, 1000],
  ['sitio-index-390', '/index.html?app=mercado', 390, 844],
  ['sitio-privacidad-1440', '/privacidad.html?app=mostrador', 1440, 1000],
  ['sitio-privacidad-390', '/privacidad.html?app=mercado', 390, 844],
  ['sitio-condiciones-390', '/condiciones.html?app=mostrador', 390, 844],
  ['sitio-soporte-390', '/soporte.html?app=mostrador', 390, 844],
  ['sitio-eliminar-cuenta-390', '/eliminar-cuenta.html?app=mercado', 390, 844],
];

const proc = spawn(chrome, [
  '--headless=new', `--remote-debugging-port=${puerto}`, '--disable-gpu',
  '--no-first-run', '--hide-scrollbars', 'about:blank',
], { stdio: 'ignore' });

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

let target = null;
for (let i = 0; i < 60 && !target; i++) {
  await esperar(250);
  try {
    const r = await fetch(`http://127.0.0.1:${puerto}/json/list`);
    target = (await r.json()).find((t) => t.type === 'page');
  } catch {}
}
if (!target) { proc.kill(); throw new Error('CDP no respondió'); }

const ws = new WebSocket(target.webSocketDebuggerUrl);
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
await cmd('Runtime.enable');

// captureBeyondViewport no scrolllea la página: sin este barrido previo los .reveal
// bajo el pliegue quedan con opacity 0 y salen en blanco en la captura completa.
async function barrer(alto) {
  const total = await cmd('Runtime.evaluate', { expression: 'document.documentElement.scrollHeight', returnByValue: true });
  const altoDocumento = total.result.value;
  for (let y = 0; y < altoDocumento; y += Math.floor(alto / 3)) {
    await cmd('Runtime.evaluate', { expression: `window.scrollTo(0, ${y})`, returnByValue: true });
    await esperar(160);
  }
  await cmd('Runtime.evaluate', { expression: 'window.scrollTo(0, 0)', returnByValue: true });
  await esperar(900);
  const sinDisparar = await cmd('Runtime.evaluate', {
    expression: "document.querySelectorAll('.reveal:not(.in)').length", returnByValue: true,
  });
  return sinDisparar.result.value;
}

for (const [nombre, ruta, ancho, alto] of capturas) {
  await cmd('Emulation.setDeviceMetricsOverride', { width: ancho, height: alto, deviceScaleFactor: 2, mobile: ancho < 700 });
  await cmd('Page.navigate', { url: base + ruta });
  await esperar(2200);
  const desborde = await cmd('Runtime.evaluate', {
    expression: 'document.documentElement.scrollWidth + "x" + innerWidth', returnByValue: true,
  });
  const sinDisparar = await barrer(alto);
  const { data } = await cmd('Page.captureScreenshot', { format: 'png', captureBeyondViewport: true });
  const destino = `${salida}\\${prefijo}${nombre}.png`;
  writeFileSync(destino, Buffer.from(data, 'base64'));
  console.log(`${prefijo}${nombre}.png  viewport ${ancho}x${alto}  scrollWidth ${desborde.result.value}  revealSinDisparar ${sinDisparar}`);
}

ws.close();
proc.kill();
process.exit(0);
