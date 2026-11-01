create table if not exists producto_fotos (
  id text primary key,
  mime text not null,
  contenido bytea not null,
  created_at timestamptz not null default now()
);

alter table productos add column if not exists foto_id text;
