export type DeployAttempt =
  | { attempted: false; reason: string }
  | { attempted: true; ok: boolean; externalId: string; url: string; log: string };

function hookUrl() {
  return process.env.VERCEL_DEPLOY_HOOK_URL?.trim() || "";
}

export function deployWebDisponible() {
  return Boolean(hookUrl());
}

/** Solo web, y solo si hay un hook en el entorno. Nunca guarda el secreto. */
export async function intentarDeployWeb(platform: string): Promise<DeployAttempt> {
  if (platform !== "web") {
    return { attempted: false, reason: "Windows y Android se actualizan por manifest. No hay deploy remoto." };
  }
  const hook = hookUrl();
  if (!hook) {
    return {
      attempted: false,
      reason: "No hay VERCEL_DEPLOY_HOOK_URL. Quedó publicado en Torre, sin deploy real.",
    };
  }
  try {
    const response = await fetch(hook, { method: "POST", signal: AbortSignal.timeout(8000) });
    const body = (await response.text()).slice(0, 500);
    let externalId = "";
    let url = "";
    try {
      const parsed = JSON.parse(body) as { job?: { id?: string }; id?: string; url?: string };
      externalId = parsed.job?.id || parsed.id || "";
      url = parsed.url || "";
    } catch {
      externalId = "";
    }
    if (!response.ok) {
      return { attempted: true, ok: false, externalId, url, log: `HTTP ${response.status}` };
    }
    return { attempted: true, ok: true, externalId, url, log: "El hook respondió OK. Eso dispara el deploy; no prueba que el sitio ya esté en la versión nueva." };
  } catch (err) {
    return {
      attempted: true,
      ok: false,
      externalId: "",
      url: "",
      log: err instanceof Error ? err.message : "El hook no respondió.",
    };
  }
}
