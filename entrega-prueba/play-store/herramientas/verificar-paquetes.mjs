import { createHash } from 'node:crypto';
import { execFileSync } from 'node:child_process';
import { inflateRawSync } from 'node:zlib';
import { closeSync, openSync, readFileSync, readSync, writeFileSync, readdirSync, statSync, mkdirSync, rmSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { tmpdir } from 'node:os';

const output = resolve(process.env.DELIVERY_DIRECTORY || join(process.env.USERPROFILE, 'Desktop', 'Mostrador-PlayStore-2026-10-18'));
const evidence = join(output, 'verificacion');
const buildTools = process.env.BUILD_TOOLS || join(process.env.LOCALAPPDATA, 'Android', 'Sdk', 'build-tools', '36.0.0');
const javaHome = (process.env.JAVA_HOME || 'C:/Program Files/Java/jdk-21').replaceAll('"', '');
const apksigner = join(buildTools, 'apksigner.bat');
const keytool = join(javaHome, 'bin', 'keytool.exe');
const esperada = {
  mostrador: 'f067c3a6249793c234b31ca2358e308a480db9d528358ddd045540bf528ec68e',
  mercado: '428738366d638c304cc364d7d354910f3f8ca80f569c61fee1c34511596f5a9a',
};

function leer(archivo, offset, largo) {
  const tampon = Buffer.alloc(largo);
  const descriptor = openSync(archivo, 'r');
  try {
    readSync(descriptor, tampon, 0, largo, offset);
  } finally {
    closeSync(descriptor);
  }
  return tampon;
}

function sha256(archivo) {
  return createHash('sha256').update(readFileSync(archivo)).digest('hex');
}

// El directorio central de un zip vive al final del archivo; con 64 KB alcanza para
// encontrar su cabecera incluso en bundles con miles de entradas.
function directorioCentral(archivo, tamano) {
  const ventana = Math.min(tamano, 65536);
  const cola = leer(archivo, tamano - ventana, ventana);
  const eocd = cola.lastIndexOf(Buffer.from('504b0506', 'hex'));
  if (eocd < 0) throw new Error('no es un zip con directorio central');
  const entradas = cola.readUInt16LE(eocd + 10);
  const inicio = cola.readUInt32LE(eocd + 16);
  const cuerpo = leer(archivo, inicio, cola.readUInt32LE(eocd + 12));
  const nombres = [];
  let cursor = 0;
  for (let i = 0; i < entradas; i += 1) {
    if (cuerpo.readUInt32LE(cursor) !== 0x02014b50) throw new Error('directorio central corrupto');
    const largoNombre = cuerpo.readUInt16LE(cursor + 28);
    nombres.push({
      nombre: cuerpo.subarray(cursor + 46, cursor + 46 + largoNombre).toString('latin1'),
      metodo: cuerpo.readUInt16LE(cursor + 10),
      comprimir: cuerpo.readUInt32LE(cursor + 20),
      local: cuerpo.readUInt32LE(cursor + 42),
    });
    cursor += 46 + largoNombre + cuerpo.readUInt16LE(cursor + 30) + cuerpo.readUInt16LE(cursor + 32);
  }
  return nombres;
}

function extraer(archivo, entrada) {
  const cabecera = leer(archivo, entrada.local, 30);
  if (cabecera.readUInt32LE(0) !== 0x04034b50) throw new Error('cabecera local corrupta');
  const datos = leer(archivo, entrada.local + 30 + cabecera.readUInt16LE(26) + cabecera.readUInt16LE(28), entrada.comprimir);
  return entrada.metodo === 8 ? inflateRawSync(datos) : datos;
}

// Un AAB se firma con firma JAR (v1): el certificado PKCS#7 queda en META-INF/<ALIAS>.RSA y
// apksigner no lo lee porque el bundle no es un APK. Se saca la entrada a mano y se imprime
// con keytool, que es quien sabe interpretar el bloque.
function firmaDelAab(archivo, tamano) {
  const entradas = directorioCentral(archivo, tamano);
  if (!entradas.some(e => e.nombre === 'META-INF/MANIFEST.MF')) throw new Error('el AAB no tiene MANIFEST.MF firmado');
  const bloque = entradas.find(e => /^META-INF\/.*\.(RSA|DSA|EC)$/i.test(e.nombre));
  if (!bloque) throw new Error('el AAB no tiene bloque de certificado');
  const ruta = join(tmpdir(), `firma-${Date.now()}.rsa`);
  writeFileSync(ruta, extraer(archivo, bloque));
  try {
    const salida = execFileSync(keytool, ['-printcert', '-file', ruta], { encoding: 'utf8' });
    const huella = /SHA256:\s*([0-9a-f:]{64,})/i.exec(salida);
    const titular = /Owner:\s*(.+)/i.exec(salida);
    return {
      esquema: 'firma JAR del bundle (v1)',
      entrada: bloque.nombre,
      certificadoSha256: huella ? huella[1].replaceAll(':', '').toLowerCase() : null,
      titular: titular ? titular[1].trim() : null,
    };
  } finally {
    rmSync(ruta, { force: true });
  }
}

function firmaDelApk(archivo) {
  const salida = execFileSync(process.env.ComSpec || 'cmd.exe', ['/c', apksigner, 'verify', '--print-certs', archivo], {
    env: { ...process.env, JAVA_HOME: javaHome, SKIP_JDK_VERSION_CHECK: '1' },
    encoding: 'utf8',
  });
  const huella = /certificate SHA-256 digest: ([0-9a-f]{64})/i.exec(salida);
  const dn = /certificate DN: (.+)/i.exec(salida);
  return {
    esquema: 'APK Signing Block (v1+v2+v3)',
    entrada: null,
    certificadoSha256: huella ? huella[1] : null,
    titular: dn ? dn[1].trim() : null,
  };
}

const android = join(output, 'android');
const informe = [];
const bitacora = [];
for (const app of readdirSync(android).sort()) {
  const carpeta = join(android, app);
  if (!statSync(carpeta).isDirectory()) continue;
  for (const nombre of readdirSync(carpeta).filter(n => /\.(aab|apk)$/.test(n)).sort()) {
    const ruta = join(carpeta, nombre);
    const tamano = statSync(ruta).size;
    const registro = { app, archivo: nombre, bytes: tamano, sha256: sha256(ruta), firmado: false };
    bitacora.push(`${app}/${nombre}  ${tamano} bytes  sha256=${registro.sha256}`);
    try {
      const f = nombre.endsWith('.apk') ? firmaDelApk(ruta) : firmaDelAab(ruta, tamano);
      Object.assign(registro, f);
      registro.firmado = Boolean(f.certificadoSha256);
      registro.coincideConLaClaveDeSubida = Boolean(registro.firmado && esperada[app] === registro.certificadoSha256);
      bitacora.push(`  ${f.esquema}${f.entrada ? ` ${f.entrada}` : ''} · ${registro.firmado ? 'VERIFICA' : 'SIN CERTIFICADO'} · ${f.titular ?? 'sin titular'} · clave de subida: ${registro.coincideConLaClaveDeSubida ? 'SI' : 'NO'}`);
    } catch (error) {
      bitacora.push(`  ERROR: ${String(error.message ?? error).split('\n')[0]}`);
    }
    informe.push(registro);
  }
}
mkdirSync(evidence, { recursive: true });
const mal = informe.filter(r => !r.firmado || !r.coincideConLaClaveDeSubida);
writeFileSync(join(evidence, 'paquetes.json'), JSON.stringify({ generado: new Date().toISOString(), total: informe.length, conformes: informe.length - mal.length, artefactos: informe }, null, 2));
writeFileSync(join(evidence, 'firmas.log'), `${bitacora.join('\n')}\nRESULTADO=${mal.length === 0 ? 'OK' : 'REVISAR'}\n`);
console.log(bitacora.join('\n'));
if (mal.length) throw new Error(`${mal.length} paquete(s) sin firma verificable o distinta a la clave de subida.`);
console.log(`\n${informe.length} paquetes firmados con la clave de subida. Informe: ${join(evidence, 'paquetes.json')}`);
