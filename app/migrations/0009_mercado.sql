alter table productos
  add column if not exists publicado_online boolean not null default false;

alter table pedidos
  add column if not exists origen text not null default 'mostrador',
  add column if not exists comprador_mercado_id text,
  add column if not exists pago_estado text not null default 'pendiente',
  add column if not exists confirmed_at timestamptz,
  add column if not exists preparation_started_at timestamptz,
  add column if not exists prepared_at timestamptz,
  add column if not exists picked_up_at timestamptz,
  add column if not exists delivered_at timestamptz;

create index if not exists pedidos_mercado_comprador_idx
  on pedidos (comprador_mercado_id, created_at desc)
  where origen = 'mercado_al_toque';

create table if not exists mercado_compradores (
  id text primary key,
  nombre text not null,
  email text not null,
  telefono text not null,
  pais text not null check (pais in ('AR', 'PY')),
  tipo_documento text not null check (tipo_documento in ('DNI', 'CI_PY')),
  numero_documento text not null,
  estado_identidad text not null default 'pendiente'
    check (estado_identidad in ('pendiente', 'documentacion_cargada')),
  created_at timestamptz not null default now()
);

create unique index if not exists mercado_compradores_email_idx
  on mercado_compradores (lower(email));

create table if not exists mercado_cargadores (
  id text primary key,
  nombre text not null,
  email text not null,
  telefono text not null,
  estado_cuenta text not null default 'activo'
    check (estado_cuenta in ('activo', 'suspendido', 'bloqueado')),
  disponibilidad text not null default 'no_disponible'
    check (disponibilidad in ('disponible', 'no_disponible')),
  puntos integer not null default 0,
  score numeric(8, 3) not null default 0,
  created_at timestamptz not null default now()
);

create unique index if not exists mercado_cargadores_email_idx
  on mercado_cargadores (lower(email));

create table if not exists mercado_credenciales (
  email text primary key,
  perfil text not null check (perfil in ('comprador', 'cargador')),
  usuario_id text not null,
  password_hash text,
  google_subject text unique,
  created_at timestamptz not null default now(),
  unique (perfil, usuario_id)
);

create table if not exists mercado_archivos (
  id text primary key,
  comprador_id text not null references mercado_compradores(id) on delete cascade,
  tipo text not null check (tipo in ('documento', 'selfie')),
  contenido bytea not null,
  created_at timestamptz not null default now()
);

create table if not exists mercado_sesiones (
  id text primary key,
  perfil text not null check (perfil in ('comprador', 'cargador')),
  usuario_id text not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create index if not exists mercado_sesiones_expiracion_idx
  on mercado_sesiones (expires_at);

create table if not exists mercado_google_state (
  state text primary key,
  perfil text not null check (perfil in ('comprador', 'cargador')),
  destino text not null check (destino in ('app', 'web')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists mercado_recorridos (
  id text primary key,
  comprador_id text not null references mercado_compradores(id),
  cargador_id text not null references mercado_cargadores(id),
  estado text not null default 'asignado'
    check (estado in ('asignado', 'aceptado', 'rechazado', 'entregado')),
  bultos integer not null default 0 check (bultos >= 0),
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  delivered_at timestamptz
);

create index if not exists mercado_recorridos_cargador_idx
  on mercado_recorridos (cargador_id, created_at desc);

create table if not exists mercado_recorrido_pedidos (
  id text primary key,
  recorrido_id text not null references mercado_recorridos(id) on delete cascade,
  pedido_id text not null unique references pedidos(id),
  tenant_id text not null references tenants(id),
  bultos integer not null default 0 check (bultos >= 0),
  estado text not null default 'asignado'
    check (estado in ('asignado', 'aceptado', 'retirado', 'entregado', 'cancelado')),
  picked_up_at timestamptz,
  delivered_at timestamptz
);

create index if not exists mercado_recorrido_pedidos_recorrido_idx
  on mercado_recorrido_pedidos (recorrido_id);

create table if not exists mercado_calificaciones (
  id text primary key,
  recorrido_id text not null unique references mercado_recorridos(id),
  comprador_id text not null references mercado_compradores(id),
  estrellas integer not null check (estrellas between 1 and 5),
  comentario text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists mercado_punto_reglas (
  id text primary key,
  regla text not null unique,
  puntos integer not null
);

create table if not exists mercado_punto_movimientos (
  id text primary key,
  cargador_id text not null references mercado_cargadores(id),
  recorrido_id text references mercado_recorridos(id),
  puntos integer not null,
  motivo text not null,
  created_at timestamptz not null default now()
);

create table if not exists mercado_niveles (
  id text primary key,
  nombre text not null unique,
  puntos_minimos integer not null check (puntos_minimos >= 0)
);

create table if not exists mercado_nivel_historial (
  id text primary key,
  cargador_id text not null references mercado_cargadores(id),
  nivel_id text not null references mercado_niveles(id),
  created_at timestamptz not null default now()
);

create table if not exists mercado_idempotencia (
  perfil text not null,
  usuario_id text not null,
  clave text not null,
  request_hash text not null,
  respuesta jsonb not null,
  created_at timestamptz not null default now(),
  primary key (perfil, usuario_id, clave)
);

create table if not exists mercado_premios (
  id text primary key,
  nombre text not null,
  descripcion text not null default '',
  puntos_requeridos integer not null check (puntos_requeridos >= 0),
  activo boolean not null default true
);
