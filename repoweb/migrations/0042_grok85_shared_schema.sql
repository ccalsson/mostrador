create table if not exists mercado_compra_alta (
  id text primary key, comprador_id text not null, estado text not null,
  precio_ars numeric(12,2) not null, comprobante_nombre text, comprobante_data text,
  desde date, hasta date, created_at timestamptz not null default now()
);
create index if not exists mercado_compra_alta_estado_idx on mercado_compra_alta (estado, created_at desc);
alter table mercado_calificaciones add column if not exists cargador_id text;
alter table mercado_google_state add column if not exists id text;
alter table mercado_idempotencia add column if not exists user_id text;
alter table mercado_idempotencia add column if not exists ruta text;
alter table mercado_nivel_historial add column if not exists nivel text;
alter table mercado_niveles add column if not exists codigo text;
alter table mercado_niveles add column if not exists orden integer;
alter table mercado_premios add column if not exists periodo text;
alter table mercado_premios add column if not exists puesto integer;
alter table mercado_premios add column if not exists estado text default 'pendiente';
alter table mercado_premios add column if not exists created_at timestamptz default now();
alter table mercado_punto_movimientos add column if not exists codigo text;
alter table mercado_punto_movimientos add column if not exists referencia text;
alter table mercado_punto_reglas add column if not exists codigo text;
alter table mercado_punto_reglas add column if not exists minutos_limite integer;
alter table mercado_recorrido_pedidos add column if not exists accepted_at timestamptz;

create or replace function grok85_shared_columns() returns trigger language plpgsql as $$
declare
  d jsonb := to_jsonb(new);
  v text;
begin
  case tg_table_name
  when 'mercado_google_state' then
    if d ? 'state' then
      d := d || jsonb_build_object('id', coalesce(d->>'id',d->>'state'), 'state', coalesce(d->>'state',d->>'id'),
        'destino', coalesce(d->>'destino','web'), 'expires_at', coalesce(d->>'expires_at',(now()+interval '20 minutes')::text));
    end if;
  when 'mercado_idempotencia' then
    if d ? 'usuario_id' then
      d := d || jsonb_build_object('user_id',coalesce(d->>'user_id',d->>'usuario_id'),
        'usuario_id',coalesce(d->>'usuario_id',d->>'user_id'),
        'perfil',coalesce(d->>'perfil','grok85:'||(d->>'ruta')), 'request_hash',coalesce(d->>'request_hash','grok85'));
    end if;
  when 'mercado_niveles' then
    if d ? 'nombre' then
      v := coalesce(d->>'codigo',case when lower(d->>'nombre')='inicial' then 'nuevo' else lower(d->>'nombre') end);
      d := d || jsonb_build_object('codigo',v,'id',coalesce(d->>'id','grok85-'||v),'nombre',coalesce(d->>'nombre',v),
        'orden',coalesce((d->>'orden')::integer,(d->>'puntos_minimos')::integer));
    end if;
  when 'mercado_nivel_historial' then
    if d ? 'nivel_id' then
      select codigo into v from mercado_niveles where id=d->>'nivel_id';
      d := d || jsonb_build_object('nivel',coalesce(d->>'nivel',v));
      select id into v from mercado_niveles where codigo=d->>'nivel';
      d := d || jsonb_build_object('nivel_id',coalesce(d->>'nivel_id',v));
    end if;
  when 'mercado_punto_reglas' then
    if d ? 'regla' then
      v := coalesce(d->>'codigo',case when d->>'regla'='recorrido_entregado' then 'entrega_completada' else d->>'regla' end);
      d := d || jsonb_build_object('codigo',v,'id',coalesce(d->>'id','grok85-'||v),'regla',coalesce(d->>'regla',v));
    end if;
  when 'mercado_punto_movimientos' then
    if d ? 'motivo' then
      d := d || jsonb_build_object('codigo',coalesce(d->>'codigo',d->>'motivo'),
        'motivo',coalesce(d->>'motivo',d->>'codigo'),'referencia',coalesce(d->>'referencia',d->>'recorrido_id',d->>'id'));
    end if;
  when 'mercado_recorrido_pedidos' then
    if d ? 'tenant_id' then
      select tenant_id into v from pedidos where id=d->>'pedido_id';
      d := d || jsonb_build_object('id',coalesce(d->>'id','grok85-'||(d->>'recorrido_id')||'-'||(d->>'pedido_id')),
        'tenant_id',coalesce(d->>'tenant_id',v));
    end if;
  when 'mercado_calificaciones' then
    select cargador_id into v from mercado_recorridos where id=d->>'recorrido_id';
    d := d || jsonb_build_object('cargador_id',coalesce(d->>'cargador_id',v),'comentario',coalesce(d->>'comentario',''));
  else null;
  end case;
  new := jsonb_populate_record(new,d);
  return new;
end;
$$;

do $$ declare t text; begin
  foreach t in array array['mercado_google_state','mercado_idempotencia','mercado_niveles','mercado_nivel_historial',
    'mercado_punto_reglas','mercado_punto_movimientos','mercado_recorrido_pedidos','mercado_calificaciones'] loop
    if not exists (select 1 from pg_trigger where tgname='grok85_shared_'||t and tgrelid=t::regclass) then
      execute format('create trigger %I before insert or update on %I for each row execute function grok85_shared_columns()', 'grok85_shared_'||t,t);
    end if;
  end loop;
end $$;

update mercado_google_state set id=id;
update mercado_niveles set codigo=codigo;
update mercado_nivel_historial set nivel=nivel;
update mercado_punto_reglas set codigo=codigo;
update mercado_punto_movimientos set codigo=codigo;
update mercado_calificaciones set cargador_id=cargador_id;
create unique index if not exists grok85_google_state_id_idx on mercado_google_state(id);
create unique index if not exists grok85_idempotencia_idx on mercado_idempotencia(user_id,clave,ruta);
create unique index if not exists grok85_niveles_codigo_idx on mercado_niveles(codigo);
create unique index if not exists grok85_punto_reglas_codigo_idx on mercado_punto_reglas(codigo);
create unique index if not exists grok85_puntos_referencia_idx on mercado_punto_movimientos(cargador_id,codigo,referencia);
