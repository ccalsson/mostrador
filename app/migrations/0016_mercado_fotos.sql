-- Foto de perfil del canal Mercado (portado desde repoweb/migrations/0010_mercado_fotos.sql).
-- No es el DNI. Opcional. Additive-only: sin backfill; la columna es nullable
-- y la tabla nace vacía. Rollback manual: drop table mercado_fotos + drop
-- column foto_id en ambas tablas.

create table if not exists mercado_fotos (
  id text primary key,
  mime text not null default 'image/jpeg',
  contenido bytea not null,
  created_at timestamptz not null default now()
);

alter table mercado_compradores add column if not exists foto_id text;
alter table mercado_cargadores add column if not exists foto_id text;
