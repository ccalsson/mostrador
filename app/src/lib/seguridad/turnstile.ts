/**
 * Turnstile. Sin `TURNSTILE_SECRET_KEY` el alta queda cerrada en Vercel y
 * abierta fuera, para poder probar en local.
 */
export async function verificarTurnstile(token: string, ip: string): Promise<{ ok: true } | { ok: false; motivo: string }> {
  const secret = process.env.TURNSTILE_SECRET_KEY?.trim();
  if (!secret) {
    if (process.env.VERCEL === "1") return { ok: false, motivo: "El alta está cerrada hasta configurar el captcha." };
    return { ok: true };
  }
  if (!token.trim()) return { ok: false, motivo: "Confirmá que no sos un robot." };
  const cuerpo = new URLSearchParams({ secret, response: token.trim(), remoteip: ip });
  const respuesta = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: cuerpo,
  });
  const data = (await respuesta.json()) as { success?: boolean };
  if (!data.success) return { ok: false, motivo: "No pudimos verificar el captcha. Probá de nuevo." };
  return { ok: true };
}
