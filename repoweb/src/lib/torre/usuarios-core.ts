/**
 * Logica pura de usuarios centralizados.
 * Sin dependencias externas para facilitar tests unitarios.
 */

export type AppAccess = {
  app: "Mostrador" | "Mercado" | "Super al Toque" | "Materiales Ya" | "Torre";
  rol: string;
  tenantNombre?: string;
  activo: boolean;
};

export type UsuarioUnificado = {
  id: string;
  nombre: string;
  email: string;
  telefono: string | null;
  apps: AppAccess[];
  appsCount: number;
  ultimoLogin: string | null;
  creado: string;
  activoGlobal: boolean;
};

export type FiltroUsuarios = {
  app?: string;
  rol?: string;
  busqueda?: string;
  activo?: boolean;
};

/**
 * Consolida usuarios de multiples fuentes en una vista unificada.
 * Funcion pura: no tiene side effects ni dependencias externas.
 */
export function consolidarUsuarios(
  users: { id: string; nombre: string; email: string; telefono: string | null; createdAt: string }[],
  staffRows: { userId: string; rol: string; tenantNombre: string; activo: boolean; ultimoLogin: string | null }[],
  compradoresRows: { userId: string; nombre: string; email: string; telefono: string | null }[],
  cargadoresRows: { userId: string; nombre: string; email: string; telefono: string | null; activo: boolean }[],
  torreAccessRows: { email: string; role: string }[],
): UsuarioUnificado[] {
  const userMap = new Map<string, UsuarioUnificado>();

  // Procesar usuarios base
  for (const u of users) {
    userMap.set(u.email.toLowerCase(), {
      id: u.id,
      nombre: u.nombre,
      email: u.email,
      telefono: u.telefono,
      apps: [],
      appsCount: 0,
      ultimoLogin: null,
      creado: u.createdAt,
      activoGlobal: false,
    });
  }

  // Procesar staff (Mostrador)
  for (const s of staffRows) {
    const user = Array.from(userMap.values()).find((u) => u.id === s.userId);
    if (!user) continue;
    user.apps.push({
      app: "Mostrador",
      rol: s.rol,
      tenantNombre: s.tenantNombre,
      activo: s.activo,
    });
    if (s.activo) user.activoGlobal = true;
    if (s.ultimoLogin && (!user.ultimoLogin || s.ultimoLogin > user.ultimoLogin)) {
      user.ultimoLogin = s.ultimoLogin;
    }
  }

  // Procesar compradores (Mercado)
  for (const c of compradoresRows) {
    const key = c.email.toLowerCase();
    let user = userMap.get(key);
    if (!user) {
      user = {
        id: c.userId,
        nombre: c.nombre,
        email: c.email,
        telefono: c.telefono,
        apps: [],
        appsCount: 0,
        ultimoLogin: null,
        creado: new Date().toISOString(),
        activoGlobal: true,
      };
      userMap.set(key, user);
    }
    const hasMercado = user.apps.some((a) => a.app === "Mercado");
    if (!hasMercado) {
      user.apps.push({
        app: "Mercado",
        rol: "comprador",
        activo: true,
      });
    } else {
      const mercadoApp = user.apps.find((a) => a.app === "Mercado");
      if (mercadoApp && !mercadoApp.rol.includes("comprador")) {
        mercadoApp.rol = `${mercadoApp.rol}, comprador`;
      }
    }
    user.activoGlobal = true;
  }

  // Procesar cargadores (Mercado)
  for (const c of cargadoresRows) {
    const key = c.email.toLowerCase();
    let user = userMap.get(key);
    if (!user) {
      user = {
        id: c.userId,
        nombre: c.nombre,
        email: c.email,
        telefono: c.telefono,
        apps: [],
        appsCount: 0,
        ultimoLogin: null,
        creado: new Date().toISOString(),
        activoGlobal: false,
      };
      userMap.set(key, user);
    }
    const hasMercado = user.apps.some((a) => a.app === "Mercado");
    if (!hasMercado) {
      user.apps.push({
        app: "Mercado",
        rol: "cargador",
        activo: c.activo,
      });
    } else {
      const mercadoApp = user.apps.find((a) => a.app === "Mercado");
      if (mercadoApp && !mercadoApp.rol.includes("cargador")) {
        mercadoApp.rol = `${mercadoApp.rol}, cargador`;
      }
      if (c.activo) mercadoApp!.activo = true;
    }
    if (c.activo) user.activoGlobal = true;
  }

  // Procesar Torre
  for (const t of torreAccessRows) {
    const key = t.email.toLowerCase();
    let user = userMap.get(key);
    if (!user) {
      user = {
        id: "",
        nombre: t.email.split("@")[0],
        email: t.email,
        telefono: null,
        apps: [],
        appsCount: 0,
        ultimoLogin: null,
        creado: new Date().toISOString(),
        activoGlobal: true,
      };
      userMap.set(key, user);
    }
    user.apps.push({
      app: "Torre",
      rol: t.role,
      activo: true,
    });
    user.activoGlobal = true;
  }

  // Calcular appsCount
  for (const user of userMap.values()) {
    user.appsCount = user.apps.length;
  }

  return Array.from(userMap.values());
}

/**
 * Filtra y ordena usuarios.
 * Funcion pura: no tiene side effects ni dependencias externas.
 */
export function filtrarUsuarios(
  users: UsuarioUnificado[],
  filtro: FiltroUsuarios,
): UsuarioUnificado[] {
  let resultado = users;

  if (filtro.app) {
    resultado = resultado.filter((u) => u.apps.some((a) => a.app === filtro.app));
  }

  if (filtro.rol) {
    resultado = resultado.filter((u) => u.apps.some((a) => a.rol.includes(filtro.rol!)));
  }

  if (filtro.activo !== undefined) {
    resultado = resultado.filter((u) => u.activoGlobal === filtro.activo);
  }

  if (filtro.busqueda && filtro.busqueda.trim()) {
    const q = filtro.busqueda.trim().toLowerCase();
    resultado = resultado.filter(
      (u) => u.nombre.toLowerCase().includes(q) || u.email.toLowerCase().includes(q),
    );
  }

  return resultado.sort((a, b) => a.nombre.localeCompare(b.nombre));
}
