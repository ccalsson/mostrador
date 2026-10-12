create table if not exists torre.saas_sesiones (
  token_hash text primary key,
  user_id text not null,
  email text not null,
  expires_at timestamptz not null,
  created_at timestamptz not null default now()
);
