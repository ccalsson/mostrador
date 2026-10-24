-- Alta de SIRE en la Torre de Control. Idempotente.

insert into torre.saas_apps (
  id, name, slug, description, status, repository_url, production_url, current_version
) values (
  'app_sire', 'SIRE', 'sire',
  'Cuaderno docente: asistencia por dictado, cursos, planilla y promociones. Login con Google.',
  'active', 'https://github.com/ccalsson/sire', 'https://sire-three.vercel.app', '1.0.0'
) on conflict (id) do nothing;
