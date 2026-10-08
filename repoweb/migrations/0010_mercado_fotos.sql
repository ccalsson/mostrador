-- Foto de perfil. No es el DNI. Opcional.

create table if not exists mercado_fotos (
  id text primary key,
  mime text not null default 'image/jpeg',
  contenido bytea not null,
  created_at timestamptz not null default now()
);

alter table mercado_compradores add column if not exists foto_id text;
alter table mercado_cargadores add column if not exists foto_id text;
