-- 0047: Grupos Empresariales (Multi-Empresa)
-- Permite agrupar clientes (holdings) para reportes consolidados.

create table if not exists torre.grupos_empresariales (
  id text primary key,
  nombre text not null,
  descripcion text not null default '',
  creado_por text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table torre.saas_clients add column if not exists grupo_id text references torre.grupos_empresariales(id);
create index if not exists saas_clients_grupo_idx on torre.saas_clients(grupo_id);
