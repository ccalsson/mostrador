import { randomBytes } from 'node:crypto';
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { join, resolve } from 'node:path';
import { spawnSync } from 'node:child_process';

const [action, app, ...command] = process.argv.slice(2);
if (!['crear', 'ejecutar'].includes(action) || !['mostrador', 'mercado'].includes(app)) {
  throw new Error('Uso: node firma-upload.mjs crear|ejecutar mostrador|mercado [ejecutable ...argumentos]');
}
const folder = resolve(process.env.SIGNING_DIRECTORY || join(process.env.LOCALAPPDATA, 'MostradorSigning', '2026-10-18'));
if (!existsSync(folder)) throw new Error('Crear previamente el directorio privado SIGNING_DIRECTORY.');
const store = join(folder, `${app}-upload.p12`);
const protectedPassword = join(folder, `${app}-password.dpapi`);
const certificate = join(folder, `${app}-upload-cert.pem`);
const alias = `${app}-upload`;
const javaHome = (process.env.JAVA_HOME || 'C:/Program Files/Java/jdk-21').replaceAll('"', '');
const powershell = 'C:/Windows/System32/WindowsPowerShell/v1.0/powershell.exe';
function run(file, args, options = {}) {
  const result = spawnSync(file, args, { encoding: 'utf8', windowsHide: true, ...options });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`Falló ${file} (código ${result.status}). ${result.stderr || ''}`);
  return result.stdout;
}
let password;
if (action === 'crear') {
  if (existsSync(store) || existsSync(protectedPassword)) throw new Error('La firma ya existe; no se reemplaza. Usar ejecutar.');
  password = randomBytes(32).toString('base64url');
  const encrypted = run(powershell, ['-NoProfile', '-NonInteractive', '-Command', '$p=[Console]::In.ReadToEnd(); ConvertTo-SecureString -String $p -AsPlainText -Force | ConvertFrom-SecureString'], { input: password });
  writeFileSync(protectedPassword, encrypted.trim(), { flag: 'wx', mode: 0o600 });
} else {
  if (!existsSync(store) || !existsSync(protectedPassword)) throw new Error('No existe una firma upload completa.');
  password = run(powershell, ['-NoProfile', '-NonInteractive', '-Command', '$s=ConvertTo-SecureString ([Console]::In.ReadToEnd().Trim()); $p=[Runtime.InteropServices.Marshal]::SecureStringToBSTR($s); try { [Console]::Write([Runtime.InteropServices.Marshal]::PtrToStringBSTR($p)) } finally { [Runtime.InteropServices.Marshal]::ZeroFreeBSTR($p) }'], { input: readFileSync(protectedPassword, 'utf8') });
}
const env = { ...process.env, JAVA_HOME: javaHome, ANDROID_KEYSTORE_PATH: store, ANDROID_STORE_PASSWORD: password, ANDROID_KEY_ALIAS: alias, ANDROID_KEY_PASSWORD: password };
if (action === 'crear') {
  const keytool = join(javaHome, 'bin', 'keytool.exe');
  run(keytool, ['-genkeypair', '-keystore', store, '-storetype', 'PKCS12', '-storepass:env', 'ANDROID_STORE_PASSWORD', '-keypass:env', 'ANDROID_KEY_PASSWORD', '-alias', alias, '-keyalg', 'RSA', '-keysize', '4096', '-validity', '10000', '-dname', `CN=${app} upload candidate`, '-noprompt'], { env });
  run(keytool, ['-exportcert', '-rfc', '-keystore', store, '-storepass:env', 'ANDROID_STORE_PASSWORD', '-alias', alias, '-file', certificate], { env });
  console.log(JSON.stringify({ app, store, certificate, passwordProtection: 'Windows DPAPI current user', candidateOnly: true }));
} else {
  if (!command.length) throw new Error('Falta el ejecutable.');
  const result = spawnSync(command[0], command.slice(1), { env, stdio: 'inherit', windowsHide: true });
  if (result.error) throw result.error;
  process.exitCode = result.status ?? 1;
}
