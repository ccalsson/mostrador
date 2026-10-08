-- Idempotencia de aceptaciones legales. Solo schema torre.
-- Una aceptación por (tenant, versión) para contratos B2B de la Parte A y
-- una por (usuario, versión) para documentos del canal de la Parte B.
-- ON CONFLICT DO NOTHING + select devuelve la existente sin duplicar.

create unique index if not exists saas_acceptances_tenant_version_uidx
  on torre.saas_contract_acceptances (tenant_id, version_id)
  where tenant_id is not null;

create unique index if not exists saas_acceptances_user_version_uidx
  on torre.saas_contract_acceptances (user_id, version_id)
  where tenant_id is null;
