import { copyFileSync, existsSync } from "node:fs";
import { join } from "node:path";

const src = "node_modules/@electric-sql/pglite/dist";
const dest = ".vercel/output/functions/__server.func/_libs";

if (!existsSync(dest)) {
  console.warn("[pglite] server bundle dir missing, skip asset copy");
  process.exit(0);
}

for (const file of ["pglite.data", "pglite.wasm", "initdb.wasm"]) {
  copyFileSync(join(src, file), join(dest, file));
}

console.log("[pglite] copied wasm assets next to the server bundle");
