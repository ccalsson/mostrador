// Verificación negativa de la Fase 1 (seguridad de acceso) contra el server local.
// No imprime secretos. Sólo status + mensaje.
// Necesita DATABASE_URL: correr con `node --env-file=.env scripts/tmp-fase1-seguridad.mjs`.
import pg from "pg";

const BASE = process.env.BASE ?? "http://127.0.0.1:8080";

const CLAVES_PROPIAS = [
  "auth:sin-ip",
  "recordar:sin-ip",
  "ingreso:sin-ip",
  "reg-cli:sin-ip",
  "registro:sin-ip",
  "uso:sin-ip",
  "lectura:sin-ip",
];

// El server local no manda cabecera de IP, así que todo cae en el mismo balde:
// se limpia antes y después para no dejar el entorno de desarrollo bloqueado.
async function limpiarContadores(pool) {
  await pool.query(
    "delete from seguridad_cupo where clave = any($1::text[]) or clave like 'ingreso-mail:fi-tope-%'",
    [CLAVES_PROPIAS],
  );
}

let pass = 0;
let fail = 0;

function check(nombre, condicion, detalle = "") {
  if (condicion) {
    pass += 1;
    console.log(`PASS  ${nombre}`);
  } else {
    fail += 1;
    console.log(`FAIL  ${nombre} ${detalle}`);
  }
}

async function post(path, body, extraHeaders = {}) {
  const response = await fetch(new URL(path, BASE), {
    method: "POST",
    headers: { "content-type": "application/json", ...extraHeaders },
    body: JSON.stringify(body),
  });
  let data;
  try {
    data = await response.json();
  } catch {
    data = undefined;
  }
  return { status: response.status, data, headers: response.headers };
}

function mensaje(r) {
  return r.data?.message ?? r.data?.error?.message ?? "";
}

const correoDesc = "alguien@mailinator.com";
const correoOk = `fi-seg-${Date.now()}@frutasroman.com`;

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
await limpiarContadores(pool);

console.log(`\n== Portal /api/v1: correo temporal rechazado ==`);
{
  const r = await post("/api/v1/portal/registro", {
    nombre: "Prueba",
    email: correoDesc,
    password: "clave-larga-2026",
    telefono: "11 5555 5555",
    cuit: "20111111112",
    direccion: "Calle 1",
  });
  check("400 por dominio desechable", r.status === 400, JSON.stringify(r.data));
  check("mensaje de correo real", mensaje(r).includes("temporales"), mensaje(r));
}

console.log(`\n== Portal /api/v1: clave floja rechazada ==`);
{
  const r = await post("/api/v1/portal/registro", {
    nombre: "Prueba",
    email: correoOk,
    password: "12345678",
    telefono: "11 5555 5555",
    cuit: "20111111112",
    direccion: "Calle 1",
  });
  check("400 por clave fácil", r.status === 400, JSON.stringify(r.data));
  check("mensaje de clave fácil", mensaje(r).includes("demasiado fácil"), mensaje(r));
}

console.log(`\n== Portal /api/v1: campo oculto website finge el alta ==`);
{
  const r = await post("/api/v1/portal/registro", {
    nombre: "Prueba",
    email: correoOk,
    password: "clave-larga-2026",
    telefono: "11 5555 5555",
    cuit: "20111111112",
    direccion: "Calle 1",
    website: "http://spam.example",
  });
  check("201 fingido", r.status === 201, JSON.stringify(r.data));
  check("sin id de cliente", r.data?.data?.id === null, JSON.stringify(r.data));
}

console.log(`\n== Mercado: política de correo y clave ==`);
{
  const r = await post("/api/mercado/v1/auth/registro", {
    nombre: "Prueba",
    email: correoDesc,
    password: "clave-larga-2026",
    telefono: "1155555555",
    pais: "AR",
    tipoDocumento: "DNI",
    numeroDocumento: "11111111",
  });
  check("400 por dominio desechable", r.status === 400, JSON.stringify(r.data));
  check("mensaje de correo real", mensaje(r).includes("temporales"), mensaje(r));
}
{
  const r = await post("/api/mercado/v1/auth/registro-cargador", {
    nombre: "Prueba",
    email: correoOk,
    password: "12345678",
    telefono: "1155555555",
  });
  check("400 por clave fácil", r.status === 400, JSON.stringify(r.data));
  check("mensaje de clave fácil", mensaje(r).includes("demasiado fácil"), mensaje(r));
}

console.log(`\n== Mercado: tope por correo en el ingreso (8 en 15 min) ==`);
{
  const email = `fi-tope-${Date.now()}@frutasroman.com`;
  let ultimo;
  for (let i = 0; i < 9; i += 1) {
    ultimo = await post("/api/mercado/v1/auth/ingreso", { email, password: "clave-mala-2026", perfil: "comprador" });
  }
  check("la novena da 429", ultimo.status === 429, `status=${ultimo.status} ${JSON.stringify(ultimo.data)}`);
  check("mensaje de demasiados intentos", mensaje(ultimo).includes("Demasiados intentos"), mensaje(ultimo));
  // Igual que la web: este tope sale del servicio, así que no agrega retry-after.
  check("sin detalle interno", !JSON.stringify(ultimo.data).includes("seguridad_cupo"), JSON.stringify(ultimo.data));
}

console.log(`\n== Portal: tope por IP en recordar (20 en 1 h) ==`);
{
  let ultimo;
  for (let i = 0; i < 21; i += 1) {
    ultimo = await post("/api/v1/portal/recordar", { dato: "1155555555" });
  }
  check("la 21 da 429", ultimo.status === 429, `status=${ultimo.status} ${JSON.stringify(ultimo.data)}`);
  check("mensaje de demasiados intentos", mensaje(ultimo).includes("Demasiados intentos"), mensaje(ultimo));
  check("trae retry-after", Number(ultimo.headers.get("retry-after")) > 0, String(ultimo.headers.get("retry-after")));
}

console.log(`\n== Mercado: cuerpo por encima de 24 KB ==`);
{
  const relleno = "x".repeat(30_000);
  const r = await post("/api/mercado/v1/auth/ingreso", { email: correoOk, password: "clave-mala-2026", perfil: "comprador", relleno });
  check("413 por envío grande", r.status === 413, `status=${r.status} ${JSON.stringify(r.data)}`);
}

console.log(`\n== Staff: tope por IP en /api/auth/sign-in (60 en 15 min) ==`);
{
  let ultimo;
  for (let i = 0; i < 62; i += 1) {
    ultimo = await post("/api/auth/sign-in/email", { email: "nadie@frutasroman.com", password: "clave-mala-2026" });
    if (ultimo.status === 429) break;
  }
  check("429 antes de 62 intentos", ultimo.status === 429, `status=${ultimo.status} ${JSON.stringify(ultimo.data)}`);
  check("mensaje de demasiados intentos", mensaje(ultimo).includes("Demasiados intentos"), mensaje(ultimo));
}

console.log(`\n== resumen: ${pass} PASS / ${fail} FAIL ==`);
await limpiarContadores(pool);
const quedan = await pool.query("select count(*)::int as c from seguridad_cupo");
console.log(`contadores propios limpiados; filas restantes en seguridad_cupo: ${quedan.rows[0].c}`);
await pool.end();
process.exit(fail === 0 ? 0 : 1);
