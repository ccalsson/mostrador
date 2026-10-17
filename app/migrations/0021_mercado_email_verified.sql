-- Fase 5: gate de confirmación de correo en Mercado.
-- Los compradores y cargadores nuevos deben confirmar su correo antes de
-- poder operar. El campo email_verified se setea en false al registrar y
-- en true al confirmar con el token enviado por correo.

alter table mercado_compradores
  add column if not exists email_verified boolean not null default false;

alter table mercado_cargadores
  add column if not exists email_verified boolean not null default false;

-- Los usuarios existentes se marcan como verificados para no romper el flujo.
update mercado_compradores set email_verified = true;
update mercado_cargadores set email_verified = true;
