const DESECHABLES = new Set([
  "mailinator.com",
  "guerrillamail.com",
  "guerrillamail.info",
  "guerrillamailblock.com",
  "sharklasers.com",
  "grr.la",
  "yopmail.com",
  "yopmail.fr",
  "tempmail.com",
  "temp-mail.org",
  "10minutemail.com",
  "trashmail.com",
  "getnada.com",
  "dispostable.com",
  "mailnesia.com",
  "maildrop.cc",
  "fakeinbox.com",
  "mohmal.com",
  "emailondeck.com",
  "throwawaymail.com",
  "spam4.me",
  "mintemail.com",
  "mytemp.email",
  "tempr.email",
  "discard.email",
  "mailcatch.com",
  "trash-mail.com",
]);

const CLAVES_FLOJAS = new Set([
  "12345678",
  "123456789",
  "1234567890",
  "password",
  "password1",
  "qwertyui",
  "qwerty123",
  "mostrador",
  "mercado1",
]);

const CORREO =
  /^[a-z0-9](?:[a-z0-9._%+-]{0,62}[a-z0-9])?@[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?(?:\.[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?)+$/;

export function correoAceptable(raw: string): { ok: true; email: string } | { ok: false; motivo: string } {
  const email = raw.trim().toLowerCase();
  if (email.length < 6 || email.length > 254 || !CORREO.test(email)) {
    return { ok: false, motivo: "El correo no es válido." };
  }
  const dominio = email.slice(email.lastIndexOf("@") + 1);
  if (
    DESECHABLES.has(dominio) ||
    dominio === "localhost" ||
    dominio.endsWith(".local") ||
    dominio.endsWith(".invalid") ||
    dominio.endsWith(".test") ||
    dominio === "example.com" ||
    dominio === "example.org"
  ) {
    return { ok: false, motivo: "Usá un correo real. Los temporales no entran." };
  }
  return { ok: true, email };
}

export function claveAceptable(clave: string, email: string): { ok: true } | { ok: false; motivo: string } {
  if (clave.length < 8 || clave.length > 72) {
    return { ok: false, motivo: "La clave necesita entre 8 y 72 caracteres." };
  }
  if (CLAVES_FLOJAS.has(clave.toLowerCase()) || clave.toLowerCase() === email.toLowerCase()) {
    return { ok: false, motivo: "Esa clave es demasiado fácil." };
  }
  return { ok: true };
}
