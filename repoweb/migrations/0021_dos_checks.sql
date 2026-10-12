-- Dos textos cortos, publicados. El usuario los acepta con dos checks antes de entrar.

update torre.saas_legal_documents set
  title = 'Condiciones de uso del puesto',
  status = 'published',
  reaccept_on_change = true,
  updated_at = now()
where id = 'doc_saas';

update torre.saas_legal_documents set
  title = 'Condiciones de uso del comprador',
  status = 'published',
  reaccept_on_change = true,
  updated_at = now()
where id = 'doc_comprador';

update torre.saas_legal_documents set
  title = 'Condiciones de uso del cargador',
  status = 'published',
  reaccept_on_change = true,
  updated_at = now()
where id = 'doc_cargador';

update torre.saas_legal_documents set
  title = 'Privacidad',
  status = 'published',
  reaccept_on_change = true,
  updated_at = now()
where id = 'doc_privacidad';

insert into torre.saas_legal_versions (id, document_id, version_label, body, content_hash, status, published_at)
values
  (
    'lver_saas_1', 'doc_saas', '1.0',
    'Condiciones de uso del puesto. Mostrador y Mercado al Toque sirven para vender, cobrar, llevar stock y tomar pedidos. Quien opera carga los precios, los clientes y los cobros, y responde por esos datos. El abono y los add-ons salen del catálogo vigente al contratar. Un precio ya contratado no cambia solo. El trial dura los días que dice el plan. Se puede dejar de usar el servicio. Lo ya cobrado o entregado queda registrado.',
    '83595953140892babdb1c3bc6eb7dabee320dad9764a9661c80a95e8942eb228',
    'published', now()
  ),
  (
    'lver_comprador_1', 'doc_comprador', '1.0',
    'Condiciones de uso del comprador. La app sirve para pedir en los puestos publicados. El precio es el del puesto al confirmar el pedido. El pago y el retiro siguen ese pedido. La calificación la pone el comprador al cerrar la entrega. La cuenta no tiene abono.',
    'a3c7e6cb0dd07814b29ecc5d67817f5c64c5b13a344fe6596cc13037de021c5e',
    'published', now()
  ),
  (
    'lver_cargador_1', 'doc_cargador', '1.0',
    'Condiciones de uso del cargador. La app sirve para tomar un recorrido, retirar y entregar. La cuenta no tiene abono. La comisión de la entrega es la que informa el sistema. La calificación la pone el comprador. Se puede quedar no disponible.',
    '7833a4b178493250fcfe46d42831279d0a213951b0040ca725cd8c191cdccb0d',
    'published', now()
  ),
  (
    'lver_privacidad_1', 'doc_privacidad', '1.0',
    'Privacidad. Guardamos la cuenta, el teléfono, los pedidos y los cobros. Si se cargan, también el documento y la foto de identidad. Sirven para operar el puesto, asignar un cargador y cobrar. No se venden. Se pueden corregir desde la ficha o pidiéndolo a Torre. La sesión se cierra al salir.',
    'd0264987e8f9d0ca7f0bf1355617e8cb699a4e54d690ed35b8182dcfa0643b14',
    'published', now()
  )
on conflict (id) do nothing;
