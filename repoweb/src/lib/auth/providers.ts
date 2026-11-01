/**
 * Proveedores de ingreso de esta app.
 *
 * Sólo Google directo (nuestra propia app de Google Cloud). No hay broker
 * externo: el cliente importa este módulo sin arrastrar Better Auth ni `pg`.
 */
export const GOOGLE_PROVIDER = { providerId: "google", label: "Google" };
