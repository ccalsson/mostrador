import { manifestPara } from "@/lib/torre/control-fn";

/**
 * Contrato de actualización para Windows y Android.
 * El cliente consulta, compara su versión, muestra el aviso y solo instala si la persona acepta.
 * Si el manifest trae checksum, el cliente tiene que verificar SHA-256 antes de instalar.
 * Torre no instala nada. publication = "torre" significa que la ficha está publicada aquí,
 * no que un servidor haya confirmado el binario en producción.
 */
export async function manifestHttp(request: Request, params: { app?: string; platform?: string }) {
  const url = new URL(request.url);
  const app = params.app || "";
  const platform = params.platform || "";
  if (!app || !["web", "android", "windows"].includes(platform)) {
    return Response.json({ error: "Aplicación o plataforma inválida." }, { status: 400 });
  }
  const body = await manifestPara(app, platform, {
    tenantId: url.searchParams.get("tenant") || undefined,
    branchId: url.searchParams.get("branch") || undefined,
    current: url.searchParams.get("current") || undefined,
  });
  return Response.json(body);
}
