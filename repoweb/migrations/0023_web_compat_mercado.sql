-- Compatibilidad con la base compartida de convergencia (app/).
-- El Mercado de app/ usa email + estado_identidad/estado_cuenta; la web por
-- puesto usa user_id + identidad_estado/estado + contadores del cargador.
-- Solo agrega columnas con default y sincroniza equivalencias. No borra nada.

alter table mercado_compradores add column if not exists user_id text;
alter table mercado_compradores add column if not exists identidad_estado text not null default 'pendiente';
alter table mercado_compradores add column if not exists documento_ref text;
alter table mercado_compradores add column if not exists selfie_ref text;

-- `estado_identidad` solo existe en el esquema de la app/ (0009 de app/migrations).
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'mercado_compradores' and column_name = 'estado_identidad'
  ) then
    update mercado_compradores
    set identidad_estado = estado_identidad
    where identidad_estado = 'pendiente'
      and estado_identidad is not null
      and estado_identidad <> 'pendiente';
  end if;
end $$;

alter table mercado_cargadores add column if not exists user_id text;
alter table mercado_cargadores add column if not exists estado text not null default 'activo';
alter table mercado_cargadores add column if not exists nivel text not null default 'nuevo';
alter table mercado_cargadores add column if not exists recorridos_aceptados integer not null default 0;
alter table mercado_cargadores add column if not exists recorridos_completados integer not null default 0;
alter table mercado_cargadores add column if not exists cancelaciones integer not null default 0;
alter table mercado_cargadores add column if not exists pedidos_retirados integer not null default 0;
alter table mercado_cargadores add column if not exists pedidos_entregados integer not null default 0;
alter table mercado_cargadores add column if not exists entregas_a_tiempo integer not null default 0;
alter table mercado_cargadores add column if not exists entregas_demoradas integer not null default 0;
alter table mercado_cargadores add column if not exists suma_minutos_retiro integer not null default 0;
alter table mercado_cargadores add column if not exists suma_minutos_entrega integer not null default 0;
alter table mercado_cargadores add column if not exists calificacion_suma integer not null default 0;
alter table mercado_cargadores add column if not exists calificacion_cantidad integer not null default 0;
alter table mercado_cargadores add column if not exists incidencias integer not null default 0;
alter table mercado_cargadores add column if not exists reclamos integer not null default 0;

-- `estado_cuenta` solo existe en el esquema de la app/ (0009 de app/migrations).
do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'mercado_cargadores' and column_name = 'estado_cuenta'
  ) then
    update mercado_cargadores
    set estado = estado_cuenta
    where estado_cuenta is not null
      and estado_cuenta <> 'activo';
  end if;
end $$;

alter table mercado_archivos add column if not exists mime text;
