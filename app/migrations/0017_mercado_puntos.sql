-- Puntos y niveles del cargador en Mercado al Toque.
-- Solo agrega datos de configuración y un índice único de idempotencia; no altera ni borra nada.

insert into mercado_niveles (id, nombre, puntos_minimos) values
  ('mn-inicial', 'Inicial', 0),
  ('mn-bronce', 'Bronce', 50),
  ('mn-plata', 'Plata', 150),
  ('mn-oro', 'Oro', 400),
  ('mn-elite', 'Elite', 800)
on conflict (nombre) do nothing;

insert into mercado_punto_reglas (id, regla, puntos) values
  ('mpr-entrega', 'recorrido_entregado', 10),
  ('mpr-calificacion', 'buena_calificacion', 5),
  ('mpr-cancelacion', 'cancelacion', -20)
on conflict (regla) do nothing;

-- Un mismo motivo no se cobra dos veces sobre el mismo recorrido (idempotencia de puntos).
create unique index if not exists mercado_punto_movimientos_unico
  on mercado_punto_movimientos (cargador_id, recorrido_id, motivo);
