/* Configuración PÚBLICA. No incluir claves, credenciales ni datos de clientes.
 * Completar con información confirmada por el titular, nunca inferida del repo.
 * Los campos vacíos y las confirmaciones falsas mantienen el contacto bloqueado.
 * Completar este archivo NO publica el sitio ni implementa la eliminación.
 */
window.MOSTRADOR_PUBLICO = Object.freeze({
  urlBase: 'https://mostrador-xi.vercel.app/apps/',
  nombreLegal: '',
  pais: '',
  domicilio: '',
  correoSoporte: '',
  correoPrivacidad: '',
  fechaVigencia: '', // AAAA-MM-DD, después de la revisión jurídica.
  plazoSoporte: '', // Cantidad y unidad; aclarar días hábiles/corridos y punto de inicio.
  plazoDerechos: '',
  plazoEliminacion: '',
  retencionCuenta: '',
  retencionOperaciones: '', // Fundamento legal, jurisdicción y plazo contable concreto.
  retencionIdentidad: '',
  retencionMensajes: '',
  retencionSeguridad: '',
  retencionCopias: '',
  retencionIA: '', // Si no aplica, explicar qué funciones/proveedores están desactivados.
  revisionLegalAprobada: false,
  canalHumanoVerificado: false, // Buzones atendidos y procedimiento ensayado, no sólo creados.
  publicacionAutorizada: false, // No habilitar antes de autorización y QA de producción.
  apps: Object.freeze({
    mostrador: Object.freeze({ nombre: 'Mostrador', playStoreUrl: '' }),
    mercado: Object.freeze({ nombre: 'Mercado', playStoreUrl: '' })
  })
});
