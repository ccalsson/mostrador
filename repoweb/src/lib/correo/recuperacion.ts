export function resendListo(key: string | undefined) {
  return Boolean(key?.trim());
}

export function correoRecuperacion(email: string, enlace: string, from: string) {
  return {
    from,
    to: [email],
    subject: "Recuperar el acceso",
    text: `Para elegir una clave nueva abrí este enlace. Vence en 30 minutos.\n\n${enlace}\n\nSi no lo pediste, ignorá este mensaje.`,
  };
}
