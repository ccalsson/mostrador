-- API Marketplace: api keys, webhooks, webhook logs
-- Idempotent migration

create table if not exists torre.api_keys (
  id text primary key,
  client_id text not null references torre.saas_clients(id),
  nombre text not null,
  key_hash text not null unique,
  key_prefix text not null,
  scopes text[] not null default '{}',
  rate_limit_rpm int not null default 60,
  activo boolean not null default true,
  ultimo_uso_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists api_keys_client_idx on torre.api_keys(client_id);

create table if not exists torre.webhooks (
  id text primary key,
  client_id text not null references torre.saas_clients(id),
  url text not null,
  eventos text[] not null default '{}',
  secreto text not null,
  activo boolean not null default true,
  created_at timestamptz not null default now()
);
create index if not exists webhooks_client_idx on torre.webhooks(client_id);

create table if not exists torre.webhooks_log (
  id text primary key,
  webhook_id text not null references torre.webhooks(id),
  evento text not null,
  status_code int,
  respuesta_ms int,
  exito boolean not null,
  error text,
  payload_preview text,
  created_at timestamptz not null default now()
);
create index if not exists webhooks_log_webhook_idx on torre.webhooks_log(webhook_id);
