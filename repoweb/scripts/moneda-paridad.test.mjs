// Los dos backends escriben sobre la misma Neon DEV. Si la fórmula de cotización
// diverge, un pedido de la web y uno del puesto cobran montos distintos por la
// misma mercadería. Este test compara el texto de las dos implementaciones.
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { stripTypeScriptTypes } from "node:module";
import test from "node:test";

const web = await readFile(new URL("../src/lib/moneda.ts", import.meta.url), "utf8");
const api = await readFile(new URL("../../app/src/lib/server/moneda.ts", import.meta.url), "utf8");

function constante(src, nombre) {
  const m = src.match(new RegExp(`const ${nombre} = ([^;]+);`));
  assert.ok(m, `falta la constante ${nombre}`);
  const valor = m[1].trim();
  assert.match(valor, /^\d+(\.\d+)?$/, `${nombre} debería ser un número, es ${valor}`);
  return valor;
}

function cuerpo(src, nombre) {
  const inicio = src.indexOf(`function ${nombre}(`);
  assert.ok(inicio >= 0, `falta la función ${nombre}`);
  const abre = src.indexOf("{", inicio);
  let saldo = 0;
  for (let i = abre; i < src.length; i += 1) {
    if (src[i] === "{") saldo += 1;
    else if (src[i] === "}") {
      saldo -= 1;
      if (saldo === 0) return src.slice(inicio, i + 1).replace(/\s+/g, " ").trim();
    }
  }
  throw new Error(`${nombre} no cierra`);
}

function bloque(src, nombre) {
  const firma = src.indexOf(`function ${nombre}(`);
  const abre = src.indexOf("{", firma);
  let saldo = 0;
  for (let i = abre; i < src.length; i += 1) {
    if (src[i] === "{") saldo += 1;
    else if (src[i] === "}") {
      saldo -= 1;
      if (saldo === 0) return src.slice(abre + 1, i);
    }
  }
  throw new Error(`${nombre} no cierra`);
}

/** Cada "insert into pedido_items" con su texto SQL, tal como lo ejecuta el backend. */
async function escriturasDePedidoItems(rutas) {
  const sitios = [];
  for (const ruta of rutas) {
    const src = await readFile(new URL(ruta, import.meta.url), "utf8");
    for (const m of src.matchAll(/insert into pedido_items/g)) {
      const fin = src.indexOf("`", m.index);
      const sql = src.slice(m.index, fin < 0 ? src.length : fin);
      const abre = sql.indexOf("(");
      const cierra = sql.indexOf(")", abre);
      const columnas = sql
        .slice(abre + 1, cierra)
        .split(",")
        .map((c) => c.trim())
        .filter(Boolean);
      const cuerpo = sql.slice(sql.lastIndexOf("values") + 6).replace(/\s+/g, " ");
      const valores = cuerpo.slice(cuerpo.indexOf("(") + 1, cuerpo.lastIndexOf(")")).trim();
      const expresiones = [];
      let profundidad = 0;
      let actual = "";
      for (const c of valores) {
        if (c === "(" || c === "{" || c === "[") profundidad += 1;
        else if (c === ")" || c === "}" || c === "]") profundidad -= 1;
        if (c === "," && profundidad === 0) {
          expresiones.push(actual.trim());
          actual = "";
          continue;
        }
        actual += c;
      }
      expresiones.push(actual.trim());
      const i = columnas.indexOf("precio_unitario");
      assert.ok(i >= 0, `${ruta}: un pedido_items sin columna precio_unitario`);
      assert.equal(
        expresiones.length,
        columnas.length,
        `${ruta}: el insert de pedido_items tiene ${expresiones.length} valores para ${columnas.length} columnas`,
      );
      sitios.push({ ruta, precio: expresiones[i] });
    }
  }
  return sitios;
}


// El cuerpo se evalúa tal cual, sin las anotaciones de tipos de la firma.
const cotizar = new Function(
  "precio",
  "moneda",
  "cotizacion",
  `const FALLBACK_FX = ${constante(web, "FALLBACK_FX")};
   const FACTOR = ${constante(web, "FACTOR")};
   ${bloque(web, "precioEnArs")}`,
);

test("las constantes de cotización son idénticas en los dos backends", () => {
  assert.equal(constante(web, "FALLBACK_FX"), constante(api, "FALLBACK_FX"), "FALLBACK_FX");
  assert.equal(constante(web, "FACTOR"), constante(api, "FACTOR"), "FACTOR");
});

test("precioEnArs es literalmente la misma fórmula en los dos backends", () => {
  assert.equal(cuerpo(web, "precioEnArs"), cuerpo(api, "precioEnArs"));
});

test("los dos backends leen la cotización de la misma fila de Torre", () => {
  const sql = /select usd_ars from torre\.saas_fx_rates order by as_of desc limit 1/;
  assert.match(web, sql);
  assert.match(api, sql);
});

test("el catálogo en USD se cobra en pesos con recargo redondeado al cien", () => {
  assert.equal(cotizar(4.87, "USD", 1540), 7900);
  assert.equal(cotizar(0.31, "USD", 1540), 600);
  assert.equal(cotizar(20, "USD", 1500), 31500);
  assert.equal(cotizar(37.66, "USD", 1540), 60900);
});

test("un precio ya en pesos se cobra tal cual", () => {
  assert.equal(cotizar(1500, "ARS", 1540), 1500);
  assert.equal(cotizar(480.004, "ARS", 1540), 480);
  assert.equal(cotizar(480.006, "ARS", 1540), 480.01);
});

test("sin moneda leída la web falla duro en vez de adivinar", () => {
  assert.match(web, /export function monedaDeFila/);
  assert.match(web, /throw new Error\("El producto no trae moneda/);
});

test("todo alta de producto escribe la moneda en los dos backends", async () => {
  const archivos = [
    "../src/lib/fn.ts",
    "../src/lib/sucursales-puesto.ts",
    "../src/lib/server/bootstrap.ts",
    "../../app/src/lib/server/productos.ts",
    "../../app/src/lib/server/sucursales.ts",
    "../../app/src/lib/server/bootstrap.ts",
  ];
  let altas = 0;
  for (const ruta of archivos) {
    const src = await readFile(new URL(ruta, import.meta.url), "utf8");
    for (const m of src.matchAll(/insert into productos \(([^)]*)\)/gs)) {
      altas += 1;
      assert.match(m[1], /\bmoneda\b/, `${ruta} tiene un alta de producto sin moneda`);
    }
  }
  assert.equal(altas, 8, "se esperaban 5 altas de producto en la web y 3 en la API");
});

for (const caso of [
  { nombre: "USD a ARS", anterior: { precio: 10, moneda: "USD" }, precio: 20000, moneda: "ARS" },
  { nombre: "ARS a USD", anterior: { precio: 16000, moneda: "ARS" }, precio: 20, moneda: "USD" },
  { nombre: "misma moneda", anterior: { precio: 10, moneda: "USD" }, precio: 15, moneda: "USD" },
  { nombre: "moneda omitida", anterior: { precio: 16000, moneda: "ARS" }, precio: 20000 },
]) {
  test(`editar producto respeta el importe ingresado: ${caso.nombre}`, async () => {
    const src = await readFile(new URL("../src/lib/fn.ts", import.meta.url), "utf8");
    const declaracion = src.slice(src.indexOf("export const saveProducto ="), src.indexOf("export const quitarProducto ="));
    const js = stripTypeScriptTypes(declaracion.replace("export const", "const"));
    const builder = { middleware() { return this; }, validator() { return this; }, handler(fn) { return fn; } };
    const staff = { tenantId: "tenant-prueba", rol: "admin" };
    let parametros;
    const sql = async () => [caso.anterior];
    sql.query = async (query, values) => {
      assert.match(query, /update productos/);
      assert.match(query, /moneda = coalesce\(\$11, moneda\)/);
      parametros = values;
    };
    const save = new Function(
      "createServerFn", "authMiddleware", "ensureStaffForUser", "assertRole", "getSql", "audit", "num",
      `${js}\nreturn saveProducto;`,
    )(() => builder, [], async () => staff, () => {}, async () => sql, async () => {}, Number);
    await save({
      context: { userId: "usuario-prueba" },
      data: { id: "producto-prueba", nombre: "Producto", unidad: "kg", unidadLabel: "kg", precio: caso.precio,
        moneda: caso.moneda, stockMinimo: 0, alias: [], activo: true },
    });
    assert.equal(parametros[3], caso.precio);
    assert.equal(parametros[10], caso.moneda ?? null);
    assert.equal(parametros[9], staff.tenantId);
  });
}

test("la web no cambia un precio sin escribir la moneda", async () => {
  const archivos = ["../src/lib/fn.ts", "../src/lib/sucursales-puesto.ts", "../src/lib/server/bootstrap.ts"];
  for (const ruta of archivos) {
    const src = await readFile(new URL(ruta, import.meta.url), "utf8");
    for (const m of src.matchAll(/update productos\s+set ([^]*?)\s+where/gi)) {
      if (!/\bprecio\b/.test(m[1])) continue; // las que no tocan el precio no la necesitan
      assert.match(m[1], /\bmoneda\b/, `${ruta} cambia el precio sin escribir la moneda`);
    }
  }
});

// pedido_items.precio_unitario es el dinero de registro: caja, tickets, reportes y
// cuenta corriente lo suman como pesos. Un snapshot en USD se cobra 1600 veces menos.
test("los dos backends snapshotean el precio de los pedidos en pesos", async () => {
  const archivos = [
    "../src/lib/fn.ts",
    "../src/lib/portal-fn.ts",
    "../src/lib/mercado/servicio.ts",
    "../../app/src/lib/portal-fn.ts",
    "../../app/src/lib/server/catalog-pedidos.ts",
    "../../app/src/lib/server/pedidos.ts",
    "../../app/src/lib/server/portal.ts",
    "../../app/src/lib/server/mercado.ts",
    "../../app/src/lib/server/bootstrap.ts",
  ];
  const sitios = await escriturasDePedidoItems(archivos);
  assert.equal(sitios.length, 11, "se esperaban 11 escrituras de pedido_items entre los dos backends");
  for (const s of sitios) {
    assert.match(
      s.precio,
      /ars/i,
      `${s.ruta} escribe precio_unitario = ${s.precio}; tiene que ser el precio cotizado en ARS`,
    );
  }
});
