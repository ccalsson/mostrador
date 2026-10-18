import { spawn } from 'node:child_process';
import { createWriteStream, existsSync, mkdirSync, copyFileSync, writeFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const tools = dirname(fileURLToPath(import.meta.url));
const root = resolve(tools, '../../..');
const output = resolve(process.env.DELIVERY_DIRECTORY || join(process.env.USERPROFILE, 'Desktop', 'Mostrador-PlayStore-2026-10-18'));
if (!existsSync(output)) throw new Error('Crear previamente DELIVERY_DIRECTORY.');
const apps = [
  { name: 'mostrador', folder: 'puesto_flutter', version: '0.2.1', code: 3, id: 'com.frutasroman.puesto_flutter', api: 'https://mostrador-api.vercel.app' },
  { name: 'mercado', folder: 'mercado_flutter', version: '1.0.1', code: 2, id: 'ar.grok.mostrador.mercado_al_toque', api: 'https://mostrador-api.vercel.app/api/mercado/v1' },
];
const requested = process.argv[2];
const selected = requested ? apps.filter(app => app.name === requested) : apps;
if (!selected.length) throw new Error('Aplicación no reconocida.');
const evidence = join(output, 'verificacion');
mkdirSync(evidence, { recursive: true });
const bash = 'C:/Program Files/Git/bin/bash.exe';
const flutter = process.env.FLUTTER_EXECUTABLE || '/c/flutter/bin/flutter';
async function run(app, step, command, signed = false) {
  console.log(`${app.name}: ${step}`);
  const log = createWriteStream(join(evidence, `${app.name}-${step}.log`));
  // apkanalyzer.bat suma mayor+menor de la versión de Java y lee "21" como 21 < 170, así que su
  // chequeo rechaza al JDK 21 real con el que pasa el resto del build. Se omite sólo ese chequeo.
  const env = { ...process.env, JAVA_HOME: (process.env.JAVA_HOME || 'C:/Program Files/Java/jdk-21').replaceAll('"', ''), SKIP_JDK_VERSION_CHECK: '1' };
  const executable = signed ? process.execPath : bash;
  const args = signed ? [join(tools, 'firma-upload.mjs'), 'ejecutar', app.name, bash, '-lc', command] : ['-lc', command];
  const child = spawn(executable, args, { cwd: join(root, 'clients', app.folder), env, windowsHide: true });
  for (const stream of [child.stdout, child.stderr]) stream.on('data', data => { log.write(data); process.stdout.write(data); });
  const status = await new Promise((accept, reject) => { child.on('error', reject); child.on('close', accept); });
  await new Promise(accept => log.end(accept));
  if (status !== 0) throw new Error(`${app.name}/${step} falló: ${status}. Revisar su log; no se entrega como aprobado.`);
}
for (const app of selected) {
  await run(app, 'dependencias', `${flutter} pub get`);
  await run(app, 'analyze', `${flutter} analyze`);
  await run(app, 'tests', `${flutter} test --reporter expanded`);
  // Sin --no-pub: el build release regenera GeneratedPluginRegistrant filtrando las dev_dependencies
  // (integration_test); con --no-pub queda el registrant del `pub get` anterior y Gradle no compila.
  const flags = `--release --build-name=${app.version} --build-number=${app.code} --dart-define=API_BASE_URL=${app.api} --dart-define=API_AUTH_ORIGIN=https://mostrador-api.vercel.app --dart-define=PUBLIC_SITE_URL=https://mostrador-xi.vercel.app/apps`;
  await run(app, 'aab', `${flutter} build appbundle ${flags}`, true);
  await run(app, 'apk', `${flutter} build apk ${flags}`, true);
  const destination = join(output, 'android', app.name);
  mkdirSync(destination, { recursive: true });
  copyFileSync(join(root, 'clients', app.folder, 'build/app/outputs/bundle/release/app-release.aab'), join(destination, `${app.name}-${app.version}-candidato.aab`));
  copyFileSync(join(root, 'clients', app.folder, 'build/app/outputs/flutter-apk/app-release.apk'), join(destination, `${app.name}-${app.version}-qa.apk`));
  writeFileSync(join(destination, 'compilacion.json'), JSON.stringify({ ...app, backendEnvironment: 'Neon DEV', status: 'CANDIDATO: no subir hasta completar checklist', publicSite: 'https://mostrador-xi.vercel.app/apps', legalPagesDeploymentVerified: false, signing: 'upload local provisional; confirmar titularidad Play antes de uso', compiledAt: new Date().toISOString() }, null, 2));
  console.log(`${app.name}: AAB y APK copiados a ${destination}`);
}
