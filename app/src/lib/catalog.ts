import type { Unidad } from "./types";

export type CatalogItem = {
  nombre: string;
  unidad: Unidad;
  unidadLabel: string;
  precio: number;
  stock: number;
  stockMinimo: number;
  alias: string[];
};

export const TENANT_ID = "frutas-roman";
export const TENANT_NOMBRE = "Frutas Román, el Jujeño";
export const TENANT_PIE =
  "Gracias por su compra. Cambio y reclamos el mismo día. Mercado Central — Nave 3.";

export const DEMO_PASSWORD = "roman2026";

export const DEMO_USERS = [
  {
    email: "dueno@frutasroman.com",
    password: DEMO_PASSWORD,
    nombre: "Román Quispe",
    rol: "admin" as const,
  },
  {
    email: "caja@frutasroman.com",
    password: DEMO_PASSWORD,
    nombre: "Lucía Ferreyra",
    rol: "cajero" as const,
  },
  {
    email: "venta@frutasroman.com",
    password: DEMO_PASSWORD,
    nombre: "Maxi Gómez",
    rol: "vendedor" as const,
  },
];

export const CATALOG: CatalogItem[] = [
  { nombre: "Acelga", unidad: "bulto", unidadLabel: "atado", precio: 7200, stock: 28, stockMinimo: 8, alias: ["ACELGA ATADO", "ACELGA BLT"] },
  { nombre: "Ají", unidad: "kg", unidadLabel: "kg", precio: 3800, stock: 18, stockMinimo: 5, alias: ["AJI FRESCO", "AJÍ"] },
  { nombre: "Ajo", unidad: "kg", unidadLabel: "kg", precio: 4200, stock: 22, stockMinimo: 6, alias: ["AJO BLANCO", "AJO KG"] },
  { nombre: "Ananá", unidad: "bulto", unidadLabel: "cajón", precio: 31000, stock: 14, stockMinimo: 4, alias: ["ANANA", "PIÑA", "ANANA CJO"] },
  { nombre: "Apio", unidad: "bulto", unidadLabel: "cajón", precio: 11200, stock: 16, stockMinimo: 5, alias: ["APIO CJO"] },
  { nombre: "Banana Brasil", unidad: "bulto", unidadLabel: "cajón", precio: 38500, stock: 24, stockMinimo: 8, alias: ["BAN. BRASIL", "BANANA BRA", "BAN BRASIL 18KG"] },
  { nombre: "Banana Ecuador", unidad: "bulto", unidadLabel: "cajón", precio: 44800, stock: 31, stockMinimo: 10, alias: ["BAN. ECUADOR", "BANANA ECU", "BAN ECUADOR 18KG"] },
  { nombre: "Batata", unidad: "bulto", unidadLabel: "bolsa", precio: 14200, stock: 19, stockMinimo: 6, alias: ["BATATA BOLSA", "BATATA 20KG"] },
  { nombre: "Berenjena", unidad: "bulto", unidadLabel: "cajón", precio: 14800, stock: 12, stockMinimo: 4, alias: ["BERENJENA CJO"] },
  { nombre: "Brócoli", unidad: "bulto", unidadLabel: "cajón", precio: 20500, stock: 9, stockMinimo: 4, alias: ["BROCOLI", "BROCOLI CJO"] },
  { nombre: "Cebolla", unidad: "bulto", unidadLabel: "bolsa", precio: 11800, stock: 40, stockMinimo: 12, alias: ["CEBOLLA BLANCA", "CEB. BOLSA 20KG"] },
  { nombre: "Champiñón", unidad: "kg", unidadLabel: "kg", precio: 6500, stock: 8, stockMinimo: 3, alias: ["CHAMPIGNON", "CHAMPIÑON KG"] },
  { nombre: "Chaucha", unidad: "bulto", unidadLabel: "cajón", precio: 17600, stock: 11, stockMinimo: 4, alias: ["CHAUCHA CJO"] },
  { nombre: "Choclo", unidad: "bulto", unidadLabel: "cajón", precio: 18400, stock: 15, stockMinimo: 5, alias: ["CHOCLO CJO", "MAIZ CHOCLO"] },
  { nombre: "Ciruela", unidad: "bulto", unidadLabel: "cajón", precio: 26800, stock: 10, stockMinimo: 4, alias: ["CIRUELA ROJA", "CIRUELA CJO"] },
  { nombre: "Coliflor", unidad: "bulto", unidadLabel: "cajón", precio: 19200, stock: 8, stockMinimo: 3, alias: ["COLIFLOR CJO"] },
  { nombre: "Durazno", unidad: "bulto", unidadLabel: "cajón", precio: 28600, stock: 13, stockMinimo: 5, alias: ["DURAZNO CJO", "PEACH"] },
  { nombre: "Espinaca", unidad: "bulto", unidadLabel: "cajón", precio: 12400, stock: 14, stockMinimo: 5, alias: ["ESPINACA CJO"] },
  { nombre: "Frutilla", unidad: "bulto", unidadLabel: "cajón", precio: 54000, stock: 7, stockMinimo: 3, alias: ["FRUTILLA CJO", "FRUTILLA 2.5KG"] },
  { nombre: "Jengibre", unidad: "kg", unidadLabel: "kg", precio: 8500, stock: 6, stockMinimo: 2, alias: ["JENGIBRE KG", "GINGER"] },
  { nombre: "Kiwi", unidad: "bulto", unidadLabel: "cajón", precio: 49200, stock: 3, stockMinimo: 6, alias: ["KIWI CJO", "KIWI HAYWARD"] },
  { nombre: "Lechuga criolla", unidad: "bulto", unidadLabel: "cajón", precio: 9200, stock: 22, stockMinimo: 8, alias: ["LECHUGA CRIOLLA", "LECH. CRIOLLA"] },
  { nombre: "Lechuga mantecosa", unidad: "bulto", unidadLabel: "cajón", precio: 11400, stock: 18, stockMinimo: 6, alias: ["LECHUGA MANTECOSA", "LECH. MANT."] },
  { nombre: "Limón", unidad: "bulto", unidadLabel: "cajón", precio: 19800, stock: 26, stockMinimo: 8, alias: ["LIMON", "LIMON CJO 18KG"] },
  { nombre: "Mandarina", unidad: "bulto", unidadLabel: "cajón", precio: 22400, stock: 20, stockMinimo: 7, alias: ["MANDARINA CJO", "MANDARINA OKITSU"] },
  { nombre: "Mango", unidad: "bulto", unidadLabel: "cajón", precio: 36000, stock: 9, stockMinimo: 3, alias: ["MANGO CJO", "MANGO KENT"] },
  { nombre: "Manzana Gala", unidad: "bulto", unidadLabel: "cajón", precio: 35200, stock: 17, stockMinimo: 6, alias: ["MANZ. GALA", "MANZANA GALA CJO"] },
  { nombre: "Manzana Granny Smith", unidad: "bulto", unidadLabel: "cajón", precio: 33800, stock: 15, stockMinimo: 6, alias: ["MANZ. GRANNY", "GRANNY SMITH"] },
  { nombre: "Manzana Red Delicious", unidad: "bulto", unidadLabel: "cajón", precio: 36400, stock: 21, stockMinimo: 7, alias: ["MANZ. RED", "RED DELICIOUS", "MANZANA ROJA"] },
  { nombre: "Melón", unidad: "bulto", unidadLabel: "cajón", precio: 24800, stock: 11, stockMinimo: 4, alias: ["MELON CJO", "MELON AMARILLO"] },
  { nombre: "Morrón rojo", unidad: "bulto", unidadLabel: "cajón", precio: 28600, stock: 10, stockMinimo: 4, alias: ["MORRON ROJO", "PIMIENTO ROJO"] },
  { nombre: "Morrón verde", unidad: "bulto", unidadLabel: "cajón", precio: 22400, stock: 12, stockMinimo: 4, alias: ["MORRON VERDE", "PIMIENTO VERDE"] },
  { nombre: "Naranja Valencia", unidad: "bulto", unidadLabel: "cajón", precio: 18600, stock: 34, stockMinimo: 10, alias: ["NARANJA VALENCIA", "NARANJA CJO", "NAR. VALENCIA"] },
  { nombre: "Palta Hass", unidad: "bulto", unidadLabel: "cajón", precio: 56000, stock: 4, stockMinimo: 6, alias: ["PALTA HASS", "PALTA CJO", "AVOCADO"] },
  { nombre: "Papa blanca", unidad: "bulto", unidadLabel: "bolsa", precio: 14600, stock: 36, stockMinimo: 12, alias: ["PAPA CONS.", "PAPA BLANCA 20KG", "PAPA"] },
  { nombre: "Papa negra", unidad: "bulto", unidadLabel: "bolsa", precio: 16800, stock: 22, stockMinimo: 8, alias: ["PAPA NEGRA", "PAPA NEGRA 20KG"] },
  { nombre: "Pepino", unidad: "bulto", unidadLabel: "cajón", precio: 15200, stock: 14, stockMinimo: 5, alias: ["PEPINO CJO"] },
  { nombre: "Pera Williams", unidad: "bulto", unidadLabel: "cajón", precio: 32800, stock: 16, stockMinimo: 5, alias: ["PERA WILLIAMS", "PERA CJO"] },
  { nombre: "Perejil", unidad: "bulto", unidadLabel: "atado", precio: 4800, stock: 30, stockMinimo: 10, alias: ["PEREJIL ATADO", "PEREJIL BLT"] },
  { nombre: "Pomelo rosado", unidad: "bulto", unidadLabel: "cajón", precio: 24200, stock: 13, stockMinimo: 4, alias: ["POMELO ROSADO", "POMELO CJO"] },
  { nombre: "Remolacha", unidad: "bulto", unidadLabel: "cajón", precio: 10400, stock: 12, stockMinimo: 4, alias: ["REMOLACHA CJO"] },
  { nombre: "Repollo", unidad: "bulto", unidadLabel: "cajón", precio: 8200, stock: 18, stockMinimo: 6, alias: ["REPOLLO CJO", "REPOLLO BLANCO"] },
  { nombre: "Rúcula", unidad: "bulto", unidadLabel: "cajón", precio: 13600, stock: 9, stockMinimo: 4, alias: ["RUCULA", "RÚCULA CJO"] },
  { nombre: "Sandía", unidad: "bulto", unidadLabel: "unidad", precio: 8500, stock: 20, stockMinimo: 6, alias: ["SANDIA", "SANDÍA UND"] },
  { nombre: "Tomate cherry", unidad: "kg", unidadLabel: "kg", precio: 4500, stock: 11, stockMinimo: 4, alias: ["TOMATE CHERRY", "CHERRY KG"] },
  { nombre: "Tomate perita", unidad: "bulto", unidadLabel: "cajón", precio: 16800, stock: 27, stockMinimo: 8, alias: ["TOMATE PERITA", "TOM. PERITA CJO"] },
  { nombre: "Tomate redondo", unidad: "bulto", unidadLabel: "cajón", precio: 15400, stock: 25, stockMinimo: 8, alias: ["TOMATE REDONDO", "TOMATE CJO"] },
  { nombre: "Uva blanca", unidad: "bulto", unidadLabel: "cajón", precio: 43800, stock: 8, stockMinimo: 3, alias: ["UVA BLANCA", "UVA BLANCA CJO"] },
  { nombre: "Uva rosada", unidad: "bulto", unidadLabel: "cajón", precio: 46200, stock: 7, stockMinimo: 3, alias: ["UVA ROSADA", "UVA ROSADA CJO"] },
  { nombre: "Zanahoria", unidad: "bulto", unidadLabel: "bolsa", precio: 13200, stock: 29, stockMinimo: 10, alias: ["ZANAHORIA BOLSA", "ZANA. 20KG"] },
  { nombre: "Zapallito", unidad: "bulto", unidadLabel: "cajón", precio: 12600, stock: 17, stockMinimo: 6, alias: ["ZAPALLITO CJO", "ZAPALLITO VERDE"] },
  { nombre: "Zapallo anco", unidad: "bulto", unidadLabel: "bulto", precio: 10800, stock: 14, stockMinimo: 5, alias: ["ZAPALLO ANCO", "ANCO"] },
];

export const SEED_CLIENTES = [
  { nombre: "Mostrador", telefono: null, cuentaCorriente: false },
  { nombre: "Verdulería San Telmo", telefono: "11-4567-2210", cuentaCorriente: true },
  { nombre: "Restó Lo de Pepe", telefono: "11-4788-0192", cuentaCorriente: true },
  { nombre: "Hotel Crillón", telefono: "11-4312-8890", cuentaCorriente: true },
  { nombre: "Dietética Sur", telefono: "11-4201-7744", cuentaCorriente: false },
];
