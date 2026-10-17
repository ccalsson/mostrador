export function resendListo(key: string | undefined, from: string | undefined) {
  return Boolean(key?.trim() && from?.trim());
}

export function correoRecuperacion(email: string, enlace: string, from: string) {
  return {
    from,
    to: [email],
    subject: "Recuperar el acceso",
    text: `Para elegir una clave nueva abrí este enlace. Vence en 30 minutos.\n\n${enlace}\n\nSi no lo pediste, ignorá este mensaje.`,
  };
}

export function correoConfirmacion(email: string, enlace: string, from: string) {
  return {
    from,
    to: [email],
    subject: "Confirmá tu correo",
    text: `Para usar la cuenta abrí este enlace. Vence en 24 horas.\n\n${enlace}\n\nSi no creaste la cuenta, ignorá este mensaje.`,
  };
}

export async function enviarPorResend(correo: { from: string; to: string[]; subject: string; text: string }) {
  const key = process.env.RESEND_API_KEY?.trim();
  const from = process.env.RESEND_FROM?.trim();
  if (!resendListo(key, from)) return false;
  const respuesta = await fetch("https://api.resend.com/emails", {
    method: "POST",
    headers: { authorization: `Bearer ${key}`, "content-type": "application/json" },
    body: JSON.stringify({ ...correo, from }),
  });
  return respuesta.ok;
}
