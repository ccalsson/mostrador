create table if not exists seguridad_cupo (
  clave text primary key,
  n integer not null,
  vence timestamptz not null
);
