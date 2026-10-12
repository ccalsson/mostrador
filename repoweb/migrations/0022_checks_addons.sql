-- Condiciones cortas de add-ons y servicios. No aparecen en la puerta de entrada.

insert into torre.saas_legal_documents (id, code, title, audience, reaccept_on_change, status)
values (
  'doc_addons', 'addons-servicios', 'Add-ons y servicios', 'other', true, 'published'
)
on conflict (id) do update set
  title = excluded.title,
  status = 'published',
  updated_at = now();

insert into torre.saas_legal_versions (id, document_id, version_label, body, content_hash, status, published_at)
values (
  'lver_addons_1', 'doc_addons', '1.0',
  'Add-ons y servicios. El precio es el del catálogo al confirmar, en dólares o en pesos con el dólar oficial más el 5 %, redondeado para arriba. Torre habilita el servicio después de ver el pago. Hasta entonces no se prende. Rigen las mismas condiciones de uso y la misma privacidad ya aceptadas.',
  'f6315dd1e10926bcaaa8733c8c3d782f9bd790128403ab2e00c2753671df78e7',
  'published', now()
)
on conflict (id) do nothing;
