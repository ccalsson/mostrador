import type { Unidad } from "./types";

export type CatalogItem = {
  nombre: string;
  unidad: Unidad;
  unidadLabel: string;
  precio: number;
  moneda: "USD";
  stock: number;
  stockMinimo: number;
  alias: string[];
};

export const TENANT_ID = "frutas-roman";
export const TENANT_NOMBRE = "Frutas Román, el Jujeño";
export const TENANT_BAJADA = "Frutas y verduras del Mercado Central";
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
  { nombre: "Acelga", unidad: "bulto", unidadLabel: "atado", precio: 4.99, moneda: "USD", stock: 28, stockMinimo: 8, alias: ["ACELGA ATADO", "ACELGA BLT"] },
  { nombre: "Ají", unidad: "kg", unidadLabel: "kg", precio: 2.49, moneda: "USD", stock: 18, stockMinimo: 5, alias: ["AJI FRESCO", "AJÍ"] },
  { nombre: "Ajo", unidad: "kg", unidadLabel: "kg", precio: 2.99, moneda: "USD", stock: 22, stockMinimo: 6, alias: ["AJO BLANCO", "AJO KG"] },
  { nombre: "Ananá", unidad: "bulto", unidadLabel: "cajón", precio: 19.99, moneda: "USD", stock: 14, stockMinimo: 4, alias: ["ANANA", "PIÑA", "ANANA CJO"] },
  { nombre: "Apio", unidad: "bulto", unidadLabel: "cajón", precio: 7.49, moneda: "USD", stock: 16, stockMinimo: 5, alias: ["APIO CJO"] },
  { nombre: "Banana Brasil", unidad: "bulto", unidadLabel: "cajón", precio: 24.99, moneda: "USD", stock: 24, stockMinimo: 8, alias: ["BAN. BRASIL", "BANANA BRA", "BAN BRASIL 18KG"] },
  { nombre: "Banana Ecuador", unidad: "bulto", unidadLabel: "cajón", precio: 28.99, moneda: "USD", stock: 31, stockMinimo: 10, alias: ["BAN. ECUADOR", "BANANA ECU", "BAN ECUADOR 18KG"] },
  { nombre: "Batata", unidad: "bulto", unidadLabel: "bolsa", precio: 9.49, moneda: "USD", stock: 19, stockMinimo: 6, alias: ["BATATA BOLSA", "BATATA 20KG"] },
  { nombre: "Berenjena", unidad: "bulto", unidadLabel: "cajón", precio: 9.99, moneda: "USD", stock: 12, stockMinimo: 4, alias: ["BERENJENA CJO"] },
  { nombre: "Brócoli", unidad: "bulto", unidadLabel: "cajón", precio: 13.49, moneda: "USD", stock: 9, stockMinimo: 4, alias: ["BROCOLI", "BROCOLI CJO"] },
  { nombre: "Cebolla", unidad: "bulto", unidadLabel: "bolsa", precio: 7.99, moneda: "USD", stock: 40, stockMinimo: 12, alias: ["CEBOLLA BLANCA", "CEB. BOLSA 20KG"] },
  { nombre: "Champiñón", unidad: "kg", unidadLabel: "kg", precio: 4.49, moneda: "USD", stock: 8, stockMinimo: 3, alias: ["CHAMPIGNON", "CHAMPIÑON KG"] },
  { nombre: "Chaucha", unidad: "bulto", unidadLabel: "cajón", precio: 11.49, moneda: "USD", stock: 11, stockMinimo: 4, alias: ["CHAUCHA CJO"] },
  { nombre: "Choclo", unidad: "bulto", unidadLabel: "cajón", precio: 11.99, moneda: "USD", stock: 15, stockMinimo: 5, alias: ["CHOCLO CJO", "MAIZ CHOCLO"] },
  { nombre: "Ciruela", unidad: "bulto", unidadLabel: "cajón", precio: 17.49, moneda: "USD", stock: 10, stockMinimo: 4, alias: ["CIRUELA ROJA", "CIRUELA CJO"] },
  { nombre: "Coliflor", unidad: "bulto", unidadLabel: "cajón", precio: 12.49, moneda: "USD", stock: 8, stockMinimo: 3, alias: ["COLIFLOR CJO"] },
  { nombre: "Durazno", unidad: "bulto", unidadLabel: "cajón", precio: 18.99, moneda: "USD", stock: 13, stockMinimo: 5, alias: ["DURAZNO CJO", "PEACH"] },
  { nombre: "Espinaca", unidad: "bulto", unidadLabel: "cajón", precio: 7.99, moneda: "USD", stock: 14, stockMinimo: 5, alias: ["ESPINACA CJO"] },
  { nombre: "Frutilla", unidad: "bulto", unidadLabel: "cajón", precio: 34.99, moneda: "USD", stock: 7, stockMinimo: 3, alias: ["FRUTILLA CJO", "FRUTILLA 2.5KG"] },
  { nombre: "Jengibre", unidad: "kg", unidadLabel: "kg", precio: 5.49, moneda: "USD", stock: 6, stockMinimo: 2, alias: ["JENGIBRE KG", "GINGER"] },
  { nombre: "Kiwi", unidad: "bulto", unidadLabel: "cajón", precio: 31.99, moneda: "USD", stock: 3, stockMinimo: 6, alias: ["KIWI CJO", "KIWI HAYWARD"] },
  { nombre: "Lechuga criolla", unidad: "bulto", unidadLabel: "cajón", precio: 5.99, moneda: "USD", stock: 22, stockMinimo: 8, alias: ["LECHUGA CRIOLLA", "LECH. CRIOLLA"] },
  { nombre: "Lechuga mantecosa", unidad: "bulto", unidadLabel: "cajón", precio: 7.49, moneda: "USD", stock: 18, stockMinimo: 6, alias: ["LECHUGA MANTECOSA", "LECH. MANT."] },
  { nombre: "Limón", unidad: "bulto", unidadLabel: "cajón", precio: 12.99, moneda: "USD", stock: 26, stockMinimo: 8, alias: ["LIMON", "LIMON CJO 18KG"] },
  { nombre: "Mandarina", unidad: "bulto", unidadLabel: "cajón", precio: 14.49, moneda: "USD", stock: 20, stockMinimo: 7, alias: ["MANDARINA CJO", "MANDARINA OKITSU"] },
  { nombre: "Mango", unidad: "bulto", unidadLabel: "cajón", precio: 23.49, moneda: "USD", stock: 9, stockMinimo: 3, alias: ["MANGO CJO", "MANGO KENT"] },
  { nombre: "Manzana Gala", unidad: "bulto", unidadLabel: "cajón", precio: 22.99, moneda: "USD", stock: 17, stockMinimo: 6, alias: ["MANZ. GALA", "MANZANA GALA CJO"] },
  { nombre: "Manzana Granny Smith", unidad: "bulto", unidadLabel: "cajón", precio: 21.99, moneda: "USD", stock: 15, stockMinimo: 6, alias: ["MANZ. GRANNY", "GRANNY SMITH"] },
  { nombre: "Manzana Red Delicious", unidad: "bulto", unidadLabel: "cajón", precio: 23.99, moneda: "USD", stock: 21, stockMinimo: 7, alias: ["MANZ. RED", "RED DELICIOUS", "MANZANA ROJA"] },
  { nombre: "Melón", unidad: "bulto", unidadLabel: "cajón", precio: 15.99, moneda: "USD", stock: 11, stockMinimo: 4, alias: ["MELON CJO", "MELON AMARILLO"] },
  { nombre: "Morrón rojo", unidad: "bulto", unidadLabel: "cajón", precio: 18.49, moneda: "USD", stock: 10, stockMinimo: 4, alias: ["MORRON ROJO", "PIMIENTO ROJO"] },
  { nombre: "Morrón verde", unidad: "bulto", unidadLabel: "cajón", precio: 14.49, moneda: "USD", stock: 12, stockMinimo: 4, alias: ["MORRON VERDE", "PIMIENTO VERDE"] },
  { nombre: "Naranja Valencia", unidad: "bulto", unidadLabel: "cajón", precio: 11.99, moneda: "USD", stock: 34, stockMinimo: 10, alias: ["NARANJA VALENCIA", "NARANJA CJO", "NAR. VALENCIA"] },
  { nombre: "Palta Hass", unidad: "bulto", unidadLabel: "cajón", precio: 36.99, moneda: "USD", stock: 4, stockMinimo: 6, alias: ["PALTA HASS", "PALTA CJO", "AVOCADO"] },
  { nombre: "Papa blanca", unidad: "bulto", unidadLabel: "bolsa", precio: 9.49, moneda: "USD", stock: 36, stockMinimo: 12, alias: ["PAPA CONS.", "PAPA BLANCA 20KG", "PAPA"] },
  { nombre: "Papa negra", unidad: "bulto", unidadLabel: "bolsa", precio: 10.99, moneda: "USD", stock: 22, stockMinimo: 8, alias: ["PAPA NEGRA", "PAPA NEGRA 20KG"] },
  { nombre: "Pepino", unidad: "bulto", unidadLabel: "cajón", precio: 9.99, moneda: "USD", stock: 14, stockMinimo: 5, alias: ["PEPINO CJO"] },
  { nombre: "Pera Williams", unidad: "bulto", unidadLabel: "cajón", precio: 21.49, moneda: "USD", stock: 16, stockMinimo: 5, alias: ["PERA WILLIAMS", "PERA CJO"] },
  { nombre: "Perejil", unidad: "bulto", unidadLabel: "atado", precio: 2.99, moneda: "USD", stock: 30, stockMinimo: 10, alias: ["PEREJIL ATADO", "PEREJIL BLT"] },
  { nombre: "Pomelo rosado", unidad: "bulto", unidadLabel: "cajón", precio: 15.99, moneda: "USD", stock: 13, stockMinimo: 4, alias: ["POMELO ROSADO", "POMELO CJO"] },
  { nombre: "Remolacha", unidad: "bulto", unidadLabel: "cajón", precio: 6.99, moneda: "USD", stock: 12, stockMinimo: 4, alias: ["REMOLACHA CJO"] },
  { nombre: "Repollo", unidad: "bulto", unidadLabel: "cajón", precio: 5.49, moneda: "USD", stock: 18, stockMinimo: 6, alias: ["REPOLLO CJO", "REPOLLO BLANCO"] },
  { nombre: "Rúcula", unidad: "bulto", unidadLabel: "cajón", precio: 8.99, moneda: "USD", stock: 9, stockMinimo: 4, alias: ["RUCULA", "RÚCULA CJO"] },
  { nombre: "Sandía", unidad: "bulto", unidadLabel: "unidad", precio: 5.49, moneda: "USD", stock: 20, stockMinimo: 6, alias: ["SANDIA", "SANDÍA UND"] },
  { nombre: "Tomate cherry", unidad: "kg", unidadLabel: "kg", precio: 2.99, moneda: "USD", stock: 11, stockMinimo: 4, alias: ["TOMATE CHERRY", "CHERRY KG"] },
  { nombre: "Tomate perita", unidad: "bulto", unidadLabel: "cajón", precio: 10.99, moneda: "USD", stock: 27, stockMinimo: 8, alias: ["TOMATE PERITA", "TOM. PERITA CJO"] },
  { nombre: "Tomate redondo", unidad: "bulto", unidadLabel: "cajón", precio: 9.99, moneda: "USD", stock: 25, stockMinimo: 8, alias: ["TOMATE REDONDO", "TOMATE CJO"] },
  { nombre: "Uva blanca", unidad: "bulto", unidadLabel: "cajón", precio: 28.49, moneda: "USD", stock: 8, stockMinimo: 3, alias: ["UVA BLANCA", "UVA BLANCA CJO"] },
  { nombre: "Uva rosada", unidad: "bulto", unidadLabel: "cajón", precio: 29.99, moneda: "USD", stock: 7, stockMinimo: 3, alias: ["UVA ROSADA", "UVA ROSADA CJO"] },
  { nombre: "Zanahoria", unidad: "bulto", unidadLabel: "bolsa", precio: 8.49, moneda: "USD", stock: 29, stockMinimo: 10, alias: ["ZANAHORIA BOLSA", "ZANA. 20KG"] },
  { nombre: "Zapallito", unidad: "bulto", unidadLabel: "cajón", precio: 7.99, moneda: "USD", stock: 17, stockMinimo: 6, alias: ["ZAPALLITO CJO", "ZAPALLITO VERDE"] },
  { nombre: "Zapallo anco", unidad: "bulto", unidadLabel: "bulto", precio: 6.99, moneda: "USD", stock: 14, stockMinimo: 5, alias: ["ZAPALLO ANCO", "ANCO"] },
];

export const SEED_CLIENTES = [
  { nombre: "Mostrador", telefono: null, cuentaCorriente: false },
  { nombre: "Verdulería San Telmo", telefono: "11-4567-2210", cuentaCorriente: true },
  { nombre: "Restó Lo de Pepe", telefono: "11-4788-0192", cuentaCorriente: true },
  { nombre: "Hotel Crillón", telefono: "11-4312-8890", cuentaCorriente: true },
  { nombre: "Dietética Sur", telefono: "11-4201-7744", cuentaCorriente: false },
];
