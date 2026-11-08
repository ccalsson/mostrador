-- Marketing Automation: campanias push, secuencias email, ofertas automaticas
-- Idempotent migration

create table if not exists torre.campanias_push (
  id text primary key,
  nombre text not null,
  segmento text not null,
  titulo text not null,
  cuerpo text not null,
  estado text not null default 'borrador' check (estado in ('borrador','programada','enviada','cancelada')),
  programado_at timestamptz,
  enviado_at timestamptz,
  enviados_count int not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists torre.secuencias_email (
  id text primary key,
  nombre text not null,
  evento_trigger text not null,
  asunto text not null,
  contenido text not null,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);

create table if not exists torre.ofertas_auto (
  id text primary key,
  nombre text not null,
  condicion text not null,
  descuento_pct int not null check (descuento_pct >= 0 and descuento_pct <= 100),
  mensaje text not null,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);
