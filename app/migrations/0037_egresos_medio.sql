-- Agregar campo "medio" a egresos_caja para clasificar el medio de pago del egreso
-- Valores: efectivo, transferencia, otro
-- Default: efectivo (compatibilidad con egresos existentes)

ALTER TABLE egresos_caja
ADD COLUMN IF NOT EXISTS medio TEXT NOT NULL DEFAULT 'efectivo';

-- Índice para consultas por medio
CREATE INDEX IF NOT EXISTS idx_egresos_caja_medio ON egresos_caja(medio);

-- Comment documental
COMMENT ON COLUMN egresos_caja.medio IS 'Medio de pago del egreso: efectivo, transferencia, otro';
