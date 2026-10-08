/**
 * Torre administra el contrato. Mostrador y Mercado al Toque ejecutan.
 * No hay FK entre los dos mundos.
 *
 * Cuando la app operativa adopte sucursales, el par es:
 *   operationalTenantRef  (texto, el id que ya usa el puesto)
 *   branchId              (id de torre.saas_branches)
 * La app puede guardar branchId en su propia configuración.
 * Torre no lee pedidos, stock, caja, productos ni clientes del puesto.
 */
export type IdentidadOperativa = {
  operationalTenantRef: string;
  branchId: string;
};

export type UpdateManifest = {
  latestVersion: string | null;
  minimumSupportedVersion: string | null;
  downloadUrl: string | null;
  checksum: string | null;
  mandatory: boolean;
  releaseNotes: string;
  publishedAt: string | null;
  updateAvailable: boolean;
  publication: "torre";
  infrastructureConfirmed: false;
};
