alter table productos add column if not exists costo numeric(12, 2);
alter table productos add column if not exists margen_pct numeric(6, 2);

alter table caja_egresos add column if not exists referencia text;
create unique index if not exists caja_egresos_referencia_idx
  on caja_egresos (tenant_id, referencia)
  where referencia is not null;
