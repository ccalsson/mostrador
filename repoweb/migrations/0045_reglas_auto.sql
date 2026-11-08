create table if not exists torre.reglas_auto (
  id text primary key,
  nombre text not null,
  descripcion text not null default '',
  condicion jsonb not null,
  accion jsonb not null,
  activo boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists torre.reglas_auto_log (
  id text primary key,
  regla_id text not null references torre.reglas_auto(id),
  evaluado_at timestamptz not null default now(),
  resultado jsonb not null,
  created_at timestamptz not null default now()
);
