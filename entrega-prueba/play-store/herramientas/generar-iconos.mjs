// Regenera los íconos de ambas apps desde la paleta del contrato visual.
// Dibuja con Chrome (CDP) en vez de remuestrear: cada densidad se renderiza a su tamaño real.
// Uso: node generar-iconos.mjs [--verificar]
import { spawn } from 'node:child_process';
import { mkdirSync, readFileSync, writeFileSync, rmSync } from 'node:fs';
import { Buffer } from 'node:buffer';
import path from 'node:path';

const raiz = path.resolve(import.meta.dirname, '..', '..', '..');
const fuente = readFileSync(path.join(raiz, 'repoweb/public/apps/assets/fonts/Fraunces-SemiBold.ttf'));
const chrome = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const puerto = 9335;
const soloVerificar = process.argv.includes('--verificar');

// Mismo glifo, distinto fondo: es lo que separaba las dos APKs hasta ahora.
const marcas = {
  mostrador: { fondo: '#131C28', tinta: '#F2F5F9' },
  mercado: { fondo: '#1D5FD4', tinta: '#FFFFFF' },
};

const destinos = {
  mostrador: [
    ['clients/puesto_flutter/assets/icon/mostrador.png', 1024],
    ['repoweb/public/apps/assets/mostrador.png', 1024],
    ['clients/puesto_flutter/windows/runner/resources/app_icon.ico', null],
  ],
  mercado: [
    ['clients/mercado_flutter/assets/icon/mercado.png', 1024],
    ['repoweb/public/apps/assets/mercado.png', 1024],
  ],
};

// El tile del launcher y el splash se dibujan aparte: el splash va sobre transparente
// porque el fondo real lo pone android:windowSplashScreenBackground.
const densidades = { mipmap: { mdpi: 48, hdpi: 72, xhdpi: 96, xxhdpi: 144, xxxhdpi: 192 },
                     drawable: { mdpi: 108, hdpi: 162, xhdpi: 216, xxhdpi: 324, xxxhdpi: 432 },
                     splash: { mdpi: 144, hdpi: 216, xhdpi: 288, xxhdpi: 432, xxxhdpi: 576 } };

// Fondo del arranque y color de ventana: tienen que coincidir con los tokens del contrato.
const arranque = {
  mostrador: { splash: '#131C28', ventana: '#F5F6F8' },
  mercado: { splash: '#1D5FD4', ventana: '#F5F6F8' },
};

const android = {
  mostrador: 'clients/puesto_flutter/android/app/src/main/res',
  mercado: 'clients/mercado_flutter/android/app/src/main/res',
};

const html = (marca, tam, variante) => {
  const { fondo, tinta } = marcas[marca];
  const azulejo = variante === 'splash';
  return `<!doctype html><meta charset="utf-8"><style>
@font-face{font-family:F;src:url(data:font/ttf;base64,${fuente.toString('base64')})}
html,body{margin:0;padding:0;width:${tam}px;height:${tam}px;overflow:hidden}
body{background:${azulejo ? 'transparent' : fondo};display:grid;place-items:center}
span{font-family:F,Georgia,serif;font-weight:600;font-size:${Math.round(tam * (azulejo ? 0.40 : 0.58))}px;
  line-height:1;color:${tinta};transform:translateY(${Math.round(tam * 0.02)}px)}
</style><span>M</span>`;
};

const esperar = (ms) => new Promise((r) => setTimeout(r, ms));
const capturas = [];
for (const [marca, res] of Object.entries(android)) {
  for (const [carpeta, tabla] of Object.entries(densidades)) {
    for (const [dpi, tam] of Object.entries(tabla)) {
      const archivo = { mipmap: 'ic_launcher.png', drawable: 'ic_launcher_foreground.png',
                        splash: 'splash_foreground.png' }[carpeta];
      const carpetaRes = carpeta === 'splash' ? `drawable-${dpi}` : `${carpeta}-${dpi}`;
      capturas.push([`${res}/${carpetaRes}/${archivo}`, marca, tam, carpeta]);
    }
  }
}
for (const [marca, lista] of Object.entries(destinos)) {
  for (const [ruta, tam] of lista) if (tam) capturas.push([ruta, marca, tam, 'mipmap']);
}

const proc = spawn(chrome, ['--headless=new', `--remote-debugging-port=${puerto}`, '--disable-gpu',
  '--no-first-run', 'about:blank'], { stdio: 'ignore' });

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
  const m = JSON.parse(e.data);
  const p = pendientes.get(m.id);
  if (p) { pendientes.delete(m.id); m.error ? p.j(new Error(`${p.metodo}: ${JSON.stringify(m.error)}`)) : p.r(m.result); }
};
const cmd = (method, params = {}) => new Promise((r, j) => {
  const n = ++id;
  pendientes.set(n, { r, j, metodo: method });
  ws.send(JSON.stringify({ id: n, method, params }));
});

await cmd('Page.enable');
const cache = new Map();
const renderizar = async (marca, tam, variante) => {
  const clave = `${marca}:${variante}:${tam}`;
  if (!cache.has(clave)) {
    await cmd('Emulation.setDeviceMetricsOverride', { width: tam, height: tam, deviceScaleFactor: 1, mobile: false });
    await cmd('Emulation.setDefaultBackgroundColorOverride', {
      color: variante === 'splash' ? { r: 0, g: 0, b: 0, a: 0 } : { r: 0, g: 0, b: 0, a: 255 },
    });
    await cmd('Page.navigate', { url: 'data:text/html;base64,' + Buffer.from(html(marca, tam, variante)).toString('base64') });
    await esperar(600);
    const { data } = await cmd('Page.captureScreenshot', { format: 'png' });
    cache.set(clave, Buffer.from(data, 'base64'));
  }
  return cache.get(clave);
};

for (const [rutaRel, marca, tam, variante] of capturas) {
  const absoluto = path.join(raiz, rutaRel);
  mkdirSync(path.dirname(absoluto), { recursive: true });
  writeFileSync(absoluto, await renderizar(marca, tam, variante));
  if (!soloVerificar) console.log(`${rutaRel}  ${tam}x${tam}`);
}

// .ico multi-tamaño: entradas PNG comprimidas, válidas desde Vista.
const ico = (pngs) => {
  const cab = Buffer.alloc(6);
  cab.writeUInt16LE(0, 0); cab.writeUInt16LE(1, 2); cab.writeUInt16LE(pngs.length, 4);
  let offset = 6 + 16 * pngs.length;
  const entradas = pngs.map(([tam, datos]) => {
    const e = Buffer.alloc(16);
    e[0] = tam >= 256 ? 0 : tam; e[1] = tam >= 256 ? 0 : tam;
    e.writeUInt16LE(1, 4); e.writeUInt16LE(32, 6);
    e.writeUInt32LE(datos.length, 8); e.writeUInt32LE(offset, 12);
    offset += datos.length;
    return e;
  });
  return Buffer.concat([cab, ...entradas, ...pngs.map(([, datos]) => datos)]);
};
for (const [marca, lista] of Object.entries(destinos)) {
  for (const [ruta, tam] of lista) {
    if (tam) continue;
    const tamaños = [16, 32, 48, 64, 256];
    const pngs = [];
    for (const n of tamaños) pngs.push([n, await renderizar(marca, n, 'mipmap')]);
    writeFileSync(path.join(raiz, ruta), ico(pngs));
    console.log(`${ruta}  ${tamaños.join('/')} px`);
  }
}

// El fondo adaptive debe coincidir con el tile y el arranque llevar los mismos tokens.
const coloresDe = (marca) => `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <color name="ic_launcher_background">${marcas[marca].fondo}</color>
    <color name="splash_background">${arranque[marca].splash}</color>
    <color name="ventana">${arranque[marca].ventana}</color>
</resources>`;
for (const marca of Object.keys(android)) {
  const ruta = path.join(raiz, `${android[marca]}/values/colors.xml`);
  mkdirSync(path.dirname(ruta), { recursive: true });
  writeFileSync(ruta, coloresDe(marca));
  console.log(`${marca}/values/colors.xml  splash=${arranque[marca].splash} ventana=${arranque[marca].ventana}`);
}

ws.close();
proc.kill();
process.exit(0);
