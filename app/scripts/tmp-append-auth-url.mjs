import { readFileSync, writeFileSync, existsSync } from "node:fs";

const path = new URL("../.env", import.meta.url);
if (!existsSync(path)) {
  console.log(".env: NO EXISTE");
  process.exit(1);
}
const actual = readFileSync(path, "utf8");
if (/^BETTER_AUTH_URL=/m.test(actual)) {
  console.log("BETTER_AUTH_URL: ya presente, sin cambios");
  process.exit(0);
}
writeFileSync(path, actual.replace(/\s*$/, "\n") + "BETTER_AUTH_URL=http://192.168.0.101:8080\n");
console.log("BETTER_AUTH_URL: agregado (http://192.168.0.101:8080)");
