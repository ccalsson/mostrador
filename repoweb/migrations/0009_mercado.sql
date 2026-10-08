-- Mercado al Toque. Solo agrega. No borra datos de Mostrador.

alter table productos add column if not exists publicado_online boolean not null default false;

alter table pedidos add column if not exists origen text;
alter table pedidos add column if not exists comprador_mercado_id text;
alter table pedidos add column if not exists pago_estado text;
alter table pedidos add column if not exists confirmed_at timestamptz;
alter table pedidos add column if not exists preparation_started_at timestamptz;
alter table pedidos add column if not exists prepared_at timestamptz;
alter table pedidos add column if not exists picked_up_at timestamptz;
alter table pedidos add column if not exists delivered_at timestamptz;

create index if not exists pedidos_mercado_comprador_idx
  on pedidos (comprador_mercado_id)
  where comprador_mercado_id is not null;

create table if not exists mercado_compradores (
  id text primary key,
  user_id text not null unique references "user"(id),
  pais text,
  tipo_documento text,
  numero_documento text,
  nombre text not null,
  telefono text,
  identidad_estado text not null default 'pendiente',
  documento_ref text,
  selfie_ref text,
  created_at timestamptz not null default now(),
  constraint mercado_comprador_doc_chk check (
    (
      pais is null and tipo_documento is null and numero_documento is null
    ) or (
      pais in ('AR', 'PY')
      and tipo_documento in ('DNI', 'CI_PY')
      and numero_documento is not null
    )
  )
);

create unique index if not exists mercado_comprador_doc_idx
  on mercado_compradores (pais, tipo_documento, numero_documento)
  where numero_documento is not null;

create table if not exists mercado_archivos (
  id text primary key,
  comprador_id text not null references mercado_compradores(id),
  tipo text not null check (tipo in ('documento', 'selfie')),
  mime text not null,
  contenido bytea not null,
  created_at timestamptz not null default now()
);

create table if not exists mercado_cargadores (
  id text primary key,
  user_id text not null unique references "user"(id),
  nombre text not null,
  telefono text,
  estado text not null default 'activo' check (estado in ('activo', 'suspendido', 'bloqueado')),
  disponibilidad text not null default 'no_disponible' check (disponibilidad in ('disponible', 'no_disponible')),
  puntos integer not null default 0,
  nivel text not null default 'nuevo',
  score numeric(12, 2) not null default 0,
  recorridos_aceptados integer not null default 0,
  recorridos_completados integer not null default 0,
  cancelaciones integer not null default 0,
  pedidos_retirados integer not null default 0,
  pedidos_entregados integer not null default 0,
  entregas_a_tiempo integer not null default 0,
  entregas_demoradas integer not null default 0,
  suma_minutos_retiro integer not null default 0,
  suma_minutos_entrega integer not null default 0,
  calificacion_suma integer not null default 0,
  calificacion_cantidad integer not null default 0,
  incidencias integer not null default 0,
  reclamos integer not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists mercado_cargadores_disp_idx
  on mercado_cargadores (disponibilidad, score desc)
  where estado = 'activo';

create table if not exists mercado_sesiones (
  token_hash text primary key,
  user_id text not null references "user"(id),
  perfil text not null check (perfil in ('comprador', 'cargador')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);

create table if not exists mercado_google_state (
  id text primary key,
  perfil text not null check (perfil in ('comprador', 'cargador')),
  created_at timestamptz not null default now()
);

create table if not exists mercado_recorridos (
  id text primary key,
  comprador_id text not null references mercado_compradores(id),
  cargador_id text not null references mercado_cargadores(id),
  estado text not null,
  created_at timestamptz not null default now(),
  accepted_at timestamptz,
  delivered_at timestamptz
);

create table if not exists mercado_recorrido_pedidos (
  recorrido_id text not null references mercado_recorridos(id) on delete cascade,
  pedido_id text not null unique references pedidos(id),
  estado text not null,
  accepted_at timestamptz,
  picked_up_at timestamptz,
  delivered_at timestamptz,
  primary key (recorrido_id, pedido_id)
);

create table if not exists mercado_calificaciones (
  id text primary key,
  recorrido_id text not null unique references mercado_recorridos(id),
  comprador_id text not null references mercado_compradores(id),
  cargador_id text not null references mercado_cargadores(id),
  estrellas integer not null check (estrellas between 1 and 5),
  comentario text,
  created_at timestamptz not null default now()
);

create table if not exists mercado_punto_reglas (
  codigo text primary key,
  puntos integer not null,
  minutos_limite integer
);

insert into mercado_punto_reglas (codigo, puntos, minutos_limite) values
  ('entrega_completada', 10, null),
  ('buena_calificacion', 5, null),
  ('entrega_a_tiempo', 5, null),
  ('cancelacion', -20, null)
on conflict (codigo) do nothing;

create table if not exists mercado_punto_movimientos (
  id text primary key,
  cargador_id text not null references mercado_cargadores(id),
  codigo text not null,
  puntos integer not null,
  referencia text not null,
  created_at timestamptz not null default now(),
  unique (cargador_id, codigo, referencia)
);

create table if not exists mercado_niveles (
  codigo text primary key,
  puntos_minimos integer not null,
  orden integer not null
);

insert into mercado_niveles (codigo, puntos_minimos, orden) values
  ('nuevo', 0, 1),
  ('bronce', 50, 2),
  ('plata', 150, 3),
  ('oro', 400, 4),
  ('elite', 800, 5)
on conflict (codigo) do nothing;

create table if not exists mercado_nivel_historial (
  id text primary key,
  cargador_id text not null references mercado_cargadores(id),
  nivel text not null,
  created_at timestamptz not null default now()
);

create table if not exists mercado_idempotencia (
  user_id text not null,
  clave text not null,
  ruta text not null,
  respuesta jsonb not null,
  created_at timestamptz not null default now(),
  primary key (user_id, clave, ruta)
);

create table if not exists mercado_premios (
  id text primary key,
  periodo text not null,
  puesto integer not null,
  descripcion text not null,
  estado text not null default 'pendiente',
  created_at timestamptz not null default now()
);
