-- Compatibilidad con la base compartida de convergencia (app/).
-- La web (línea grok) lee mercado_sesiones.user_id para contar sesiones en
-- vivo (torre/mercado) y para su propio emitirSesion/leerSesion; el esquema
-- de la app/ (0009 de app/migrations) usa usuario_id. La columna es nullable:
-- solo desbloquea lecturas y no toca las filas de la app/. No borra nada.

alter table mercado_sesiones add column if not exists user_id text;
