-- Un comprador de la app puede ser cliente de más de un puesto.
drop index if exists clientes_user_idx;
create unique index if not exists clientes_tenant_user_idx
  on clientes (tenant_id, user_id)
  where user_id is not null;
