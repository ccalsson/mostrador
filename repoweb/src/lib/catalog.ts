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
  { nombre: "Acelga", unidad: "bulto", unidadLabel: "10 kg", precio: 4500, stock: 24, stockMinimo: 8, alias: ["ACELGA", "ACELGA 10KG"] },
  { nombre: "Achicoria", unidad: "bulto", unidadLabel: "10 kg", precio: 7500, stock: 12, stockMinimo: 4, alias: ["ACHICORIA"] },
  { nombre: "Ají", unidad: "bulto", unidadLabel: "cajón", precio: 18000, stock: 10, stockMinimo: 4, alias: ["AJI", "AJÍ"] },
  { nombre: "Ajo", unidad: "bulto", unidadLabel: "5 kg", precio: 24000, stock: 16, stockMinimo: 4, alias: ["AJO", "AJO MENDOZA"] },
  { nombre: "Akusay", unidad: "bulto", unidadLabel: "10 kg", precio: 8000, stock: 10, stockMinimo: 4, alias: ["AKUSAY"] },
  { nombre: "Albahaca", unidad: "kg", unidadLabel: "kg", precio: 480, stock: 8, stockMinimo: 2, alias: ["ALBAHACA"] },
  { nombre: "Ananá", unidad: "bulto", unidadLabel: "18 kg", precio: 38000, stock: 8, stockMinimo: 3, alias: ["ANANA", "PIÑA"] },
  { nombre: "Apio", unidad: "bulto", unidadLabel: "8 kg", precio: 9000, stock: 14, stockMinimo: 4, alias: ["APIO"] },
  { nombre: "Arándano", unidad: "bulto", unidadLabel: "2 kg", precio: 15500, stock: 6, stockMinimo: 2, alias: ["ARANDANO", "ARÁNDANO"] },
  { nombre: "Banana Brasil", unidad: "bulto", unidadLabel: "20 kg", precio: 22000, stock: 18, stockMinimo: 6, alias: ["BANANA BRASIL", "BAN. BRASIL"] },
  { nombre: "Banana Ecuador", unidad: "bulto", unidadLabel: "20 kg", precio: 31000, stock: 16, stockMinimo: 6, alias: ["BANANA ECUADOR", "BAN. ECUADOR"] },
  { nombre: "Batata", unidad: "bulto", unidadLabel: "20 kg", precio: 28000, stock: 14, stockMinimo: 5, alias: ["BATATA"] },
  { nombre: "Berenjena", unidad: "bulto", unidadLabel: "12 kg", precio: 17000, stock: 12, stockMinimo: 4, alias: ["BERENJENA"] },
  { nombre: "Berro", unidad: "kg", unidadLabel: "kg", precio: 2500, stock: 6, stockMinimo: 2, alias: ["BERRO"] },
  { nombre: "Brócoli", unidad: "bulto", unidadLabel: "8 kg", precio: 10000, stock: 10, stockMinimo: 4, alias: ["BROCOLI", "BRÓCOLI"] },
  { nombre: "Cebolla", unidad: "bulto", unidadLabel: "20 kg", precio: 26000, stock: 30, stockMinimo: 10, alias: ["CEBOLLA", "CEBOLLA VALENCIANA"] },
  { nombre: "Cebolla de verdeo", unidad: "bulto", unidadLabel: "10 kg", precio: 15000, stock: 12, stockMinimo: 4, alias: ["VERDEO", "CEBOLLA VERDEO"] },
  { nombre: "Chaucha", unidad: "bulto", unidadLabel: "10 kg", precio: 22000, stock: 10, stockMinimo: 4, alias: ["CHAUCHA"] },
  { nombre: "Champiñón", unidad: "kg", unidadLabel: "kg", precio: 8500, stock: 6, stockMinimo: 2, alias: ["CHAMPIGNON", "CHAMPIÑON"] },
  { nombre: "Choclo", unidad: "bulto", unidadLabel: "15 kg", precio: 50000, stock: 10, stockMinimo: 4, alias: ["CHOCLO", "MAIZ"] },
  { nombre: "Cilantro", unidad: "kg", unidadLabel: "kg", precio: 11000, stock: 4, stockMinimo: 2, alias: ["CILANTRO"] },
  { nombre: "Ciruela", unidad: "bulto", unidadLabel: "9 kg", precio: 47000, stock: 6, stockMinimo: 2, alias: ["CIRUELA"] },
  { nombre: "Coliflor", unidad: "bulto", unidadLabel: "15 kg", precio: 12000, stock: 8, stockMinimo: 3, alias: ["COLIFLOR"] },
  { nombre: "Durazno", unidad: "bulto", unidadLabel: "10 kg", precio: 58000, stock: 8, stockMinimo: 3, alias: ["DURAZNO"] },
  { nombre: "Escarola", unidad: "bulto", unidadLabel: "5 kg", precio: 6500, stock: 10, stockMinimo: 4, alias: ["ESCAROLA"] },
  { nombre: "Espinaca", unidad: "bulto", unidadLabel: "5 kg", precio: 3500, stock: 12, stockMinimo: 4, alias: ["ESPINACA"] },
  { nombre: "Frutilla", unidad: "bulto", unidadLabel: "5 kg", precio: 17000, stock: 8, stockMinimo: 3, alias: ["FRUTILLA"] },
  { nombre: "Hinojo", unidad: "bulto", unidadLabel: "15 kg", precio: 15000, stock: 8, stockMinimo: 3, alias: ["HINOJO"] },
  { nombre: "Jengibre", unidad: "kg", unidadLabel: "kg", precio: 3600, stock: 6, stockMinimo: 2, alias: ["JENGIBRE"] },
  { nombre: "Kiwi", unidad: "bulto", unidadLabel: "10 kg", precio: 43000, stock: 6, stockMinimo: 2, alias: ["KIWI"] },
  { nombre: "Lechuga criolla", unidad: "bulto", unidadLabel: "8 kg", precio: 5000, stock: 20, stockMinimo: 6, alias: ["LECHUGA CRIOLLA"] },
  { nombre: "Lechuga mantecosa", unidad: "bulto", unidadLabel: "5 kg", precio: 4500, stock: 16, stockMinimo: 5, alias: ["LECHUGA MANTECOSA"] },
  { nombre: "Limón", unidad: "bulto", unidadLabel: "18 kg", precio: 22000, stock: 18, stockMinimo: 6, alias: ["LIMON", "LIMÓN"] },
  { nombre: "Mandarina", unidad: "bulto", unidadLabel: "10 kg", precio: 18000, stock: 12, stockMinimo: 4, alias: ["MANDARINA"] },
  { nombre: "Mango", unidad: "bulto", unidadLabel: "18 kg", precio: 51000, stock: 6, stockMinimo: 2, alias: ["MANGO"] },
  { nombre: "Manzana Gala", unidad: "bulto", unidadLabel: "18 kg", precio: 32000, stock: 12, stockMinimo: 4, alias: ["MANZANA GALA", "GALA"] },
  { nombre: "Manzana Granny Smith", unidad: "bulto", unidadLabel: "18 kg", precio: 34000, stock: 10, stockMinimo: 4, alias: ["GRANNY", "MANZANA VERDE"] },
  { nombre: "Manzana Red Delicious", unidad: "bulto", unidadLabel: "18 kg", precio: 36000, stock: 12, stockMinimo: 4, alias: ["RED DELICIOUS", "MANZANA ROJA"] },
  { nombre: "Melón", unidad: "bulto", unidadLabel: "10 kg", precio: 26000, stock: 8, stockMinimo: 3, alias: ["MELON", "MELÓN"] },
  { nombre: "Menta", unidad: "kg", unidadLabel: "kg", precio: 9000, stock: 4, stockMinimo: 2, alias: ["MENTA"] },
  { nombre: "Morrón rojo", unidad: "bulto", unidadLabel: "8 kg", precio: 33000, stock: 8, stockMinimo: 3, alias: ["MORRON ROJO", "PIMIENTO ROJO"] },
  { nombre: "Morrón verde", unidad: "bulto", unidadLabel: "8 kg", precio: 25000, stock: 10, stockMinimo: 4, alias: ["MORRON VERDE", "PIMIENTO VERDE"] },
  { nombre: "Nabo", unidad: "bulto", unidadLabel: "10 kg", precio: 8000, stock: 8, stockMinimo: 3, alias: ["NABO"] },
  { nombre: "Naranja Valencia", unidad: "bulto", unidadLabel: "18 kg", precio: 24000, stock: 20, stockMinimo: 6, alias: ["NARANJA", "NARANJA VALENCIA"] },
  { nombre: "Palta Hass", unidad: "bulto", unidadLabel: "10 kg", precio: 41000, stock: 8, stockMinimo: 3, alias: ["PALTA", "PALTA HASS"] },
  { nombre: "Papa blanca", unidad: "bulto", unidadLabel: "18 kg", precio: 25000, stock: 28, stockMinimo: 10, alias: ["PAPA", "PAPA SPUNTA"] },
  { nombre: "Papa negra", unidad: "bulto", unidadLabel: "18 kg", precio: 30000, stock: 16, stockMinimo: 6, alias: ["PAPA NEGRA"] },
  { nombre: "Pepino", unidad: "bulto", unidadLabel: "18 kg", precio: 12500, stock: 12, stockMinimo: 4, alias: ["PEPINO"] },
  { nombre: "Pera Williams", unidad: "bulto", unidadLabel: "18 kg", precio: 30000, stock: 12, stockMinimo: 4, alias: ["PERA", "PERA WILLIAMS"] },
  { nombre: "Perejil", unidad: "bulto", unidadLabel: "10 kg", precio: 14000, stock: 14, stockMinimo: 4, alias: ["PEREJIL"] },
  { nombre: "Pomelo rosado", unidad: "bulto", unidadLabel: "15 kg", precio: 20000, stock: 8, stockMinimo: 3, alias: ["POMELO"] },
  { nombre: "Puerro", unidad: "bulto", unidadLabel: "10 kg", precio: 15000, stock: 10, stockMinimo: 4, alias: ["PUERRO"] },
  { nombre: "Rabanito", unidad: "bulto", unidadLabel: "5 kg", precio: 12000, stock: 8, stockMinimo: 3, alias: ["RABANITO"] },
  { nombre: "Radicheta", unidad: "bulto", unidadLabel: "3 kg", precio: 3500, stock: 10, stockMinimo: 3, alias: ["RADICHETA"] },
  { nombre: "Remolacha", unidad: "bulto", unidadLabel: "10 kg", precio: 8500, stock: 10, stockMinimo: 4, alias: ["REMOLACHA"] },
  { nombre: "Repollo", unidad: "bulto", unidadLabel: "15 kg", precio: 8000, stock: 14, stockMinimo: 4, alias: ["REPOLLO"] },
  { nombre: "Repollo colorado", unidad: "bulto", unidadLabel: "15 kg", precio: 10000, stock: 8, stockMinimo: 3, alias: ["REPOLLO COLORADO"] },
  { nombre: "Rúcula", unidad: "bulto", unidadLabel: "3 kg", precio: 3000, stock: 10, stockMinimo: 3, alias: ["RUCULA", "RÚCULA"] },
  { nombre: "Sandía", unidad: "bulto", unidadLabel: "16 kg", precio: 27000, stock: 10, stockMinimo: 3, alias: ["SANDIA", "SANDÍA"] },
  { nombre: "Tomate cherry", unidad: "bulto", unidadLabel: "5 kg", precio: 20000, stock: 8, stockMinimo: 3, alias: ["CHERRY", "TOMATE CHERRY"] },
  { nombre: "Tomate perita", unidad: "bulto", unidadLabel: "18 kg", precio: 32000, stock: 16, stockMinimo: 6, alias: ["TOMATE PERITA"] },
  { nombre: "Tomate redondo", unidad: "bulto", unidadLabel: "18 kg", precio: 34000, stock: 18, stockMinimo: 6, alias: ["TOMATE", "TOMATE REDONDO"] },
  { nombre: "Uva", unidad: "bulto", unidadLabel: "8 kg", precio: 40000, stock: 6, stockMinimo: 2, alias: ["UVA"] },
  { nombre: "Zanahoria", unidad: "bulto", unidadLabel: "20 kg", precio: 26000, stock: 20, stockMinimo: 6, alias: ["ZANAHORIA"] },
  { nombre: "Zapallito", unidad: "bulto", unidadLabel: "15 kg", precio: 14000, stock: 12, stockMinimo: 4, alias: ["ZAPALLITO"] },
  { nombre: "Zapallo anco", unidad: "bulto", unidadLabel: "15 kg", precio: 37000, stock: 10, stockMinimo: 4, alias: ["ZAPALLO", "ANCO"] },
];

export const SEED_CLIENTES = [
  { nombre: "Mostrador", telefono: null, cuentaCorriente: false },
  { nombre: "Verdulería San Telmo", telefono: "11-4567-2210", cuentaCorriente: true },
  { nombre: "Restó Lo de Pepe", telefono: "11-4788-0192", cuentaCorriente: true },
  { nombre: "Hotel Crillón", telefono: "11-4312-8890", cuentaCorriente: true },
  { nombre: "Dietética Sur", telefono: "11-4201-7744", cuentaCorriente: false },
];