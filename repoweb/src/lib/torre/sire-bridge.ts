export type SireInstitution = { id: string; name: string };
export type SireSite = { id: string; institution_id: string; parent_site_id: string | null; name: string; kind: string; active: boolean };
export type SireMember = { id: string; institution_id: string; site_id: string | null; role: string; active: boolean; name: string; email: string };
export type SireData = { institutions: SireInstitution[]; sites: SireSite[]; members: SireMember[]; limited: boolean };
export type SireResult = { disponible: false; motivo: string } | { disponible: true; data: SireData };

/** Credentials stay on Torre's server. Network failure never exposes them to clients. */
export async function consultarSire(base: string | undefined, token: string | undefined, fetcher: typeof fetch = fetch): Promise<SireResult> {
  if (!base?.trim() || !token || token.trim().length < 32) return { disponible: false, motivo: "La conexión con SIRE todavía no está configurada." };
  let endpoint: URL;
  try {
    const url = new URL(base);
    if (url.username || url.password || url.search || url.hash || url.pathname !== "/") throw new Error();
    if (url.protocol !== "https:" && !(url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname))) throw new Error();
    endpoint = new URL("/api/torre-control", url);
  } catch { return { disponible: false, motivo: "La dirección configurada de SIRE no es válida." }; }
  try {
    const res = await fetcher(endpoint, { headers: { "x-sire-torre-token": token.trim(), accept: "application/json" }, redirect: "error", signal: AbortSignal.timeout(5000) });
    if (!res.ok) return { disponible: false, motivo: "SIRE no pudo autorizar o completar la consulta." };
    const body = await res.json() as Partial<SireData>;
    if (!Array.isArray(body.institutions) || !Array.isArray(body.sites) || !Array.isArray(body.members) || typeof body.limited !== "boolean") throw new Error();
    return { disponible: true, data: body as SireData };
  } catch { return { disponible: false, motivo: "No se pudo consultar SIRE." }; }
}

export async function cambiarSire(base: string | undefined, token: string | undefined, actorEmail: string, action: "create-institution" | "create-site" | "link-member" | "set-member-state", data: unknown, fetcher: typeof fetch = fetch): Promise<{ ok: boolean; mensaje: string }> {
  if (!base?.trim() || !token || token.trim().length < 32) return { ok: false, mensaje: "La conexión con SIRE todavía no está configurada." };
  let endpoint: URL;
  try {
    const url = new URL(base);
    if (url.username || url.password || url.search || url.hash || url.pathname !== "/") throw new Error();
    if (url.protocol !== "https:" && !(url.protocol === "http:" && ["127.0.0.1", "localhost"].includes(url.hostname))) throw new Error();
    endpoint = new URL("/api/torre-control", url);
  } catch { return { ok: false, mensaje: "La dirección configurada de SIRE no es válida." }; }
  try {
    const res = await fetcher(endpoint, { method: "POST", headers: { "x-sire-torre-token": token.trim(), "content-type": "application/json" }, body: JSON.stringify({ actorEmail, action, data }), redirect: "error", signal: AbortSignal.timeout(5000) });
    if (res.status === 403) return { ok: false, mensaje: "Tu cuenta de Torre debe estar verificada en SIRE." };
    if (res.status === 400) return { ok: false, mensaje: "Revisá los datos: la cuenta debe existir y estar verificada en SIRE." };
    if (res.status === 409) return { ok: false, mensaje: "La operación entra en conflicto con un registro existente." };
    if (!res.ok) return { ok: false, mensaje: "SIRE no pudo completar la operación." };
    return { ok: true, mensaje: "Operación guardada en SIRE." };
  } catch { return { ok: false, mensaje: "No se pudo contactar SIRE; verificá el resultado antes de reintentar." }; }
}
