-- Tokens de recuperación de contraseña para cuentas de Mercado
-- (mercado_credenciales no pasa por Better Auth: auth custom con scrypt).

create table if not exists mercado_reset_tokens (
  id text primary key,
  email text not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  used_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists mercado_reset_tokens_email_idx
  on mercado_reset_tokens (email);

create index if not exists mercado_reset_tokens_expiracion_idx
  on mercado_reset_tokens (expires_at);
