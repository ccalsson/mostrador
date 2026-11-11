-- Idempotencia de las tres escrituras que todavía no la tenían:
-- POST /stock/ajuste, POST /egresos y POST /remitos.
-- Un retry de red después de un timeout volvía a descontar stock, volvía a
-- sacar dinero de la caja o duplicaba el remito. Pedidos y cobros ya se
-- protegen con unique (tenant_id, client_uuid); acá va la misma columna.
-- Postgres admite varios NULL en un índice único, así que las filas viejas y
-- los clientes que aún no mandan clientUuid siguen entrando normal.

alter table stock_movimientos
  add column if not exists client_uuid text;

alter table egresos_caja
  add column if not exists client_uuid text;

alter table remitos
  add column if not exists client_uuid text;

create unique index if not exists stock_movimientos_tenant_client_idx
  on stock_movimientos (tenant_id, client_uuid);

create unique index if not exists egresos_caja_tenant_client_idx
  on egresos_caja (tenant_id, client_uuid);

create unique index if not exists remitos_tenant_client_idx
  on remitos (tenant_id, client_uuid);

comment on column stock_movimientos.client_uuid is
  'Uuid del cliente para reintentar un ajuste sin duplicar el movimiento.';
comment on column egresos_caja.client_uuid is
  'Uuid del cliente para reintentar un egreso sin duplicar el retiro de caja.';
comment on column remitos.client_uuid is
  'Uuid del cliente para reintentar un remito sin duplicar sus líneas.';
