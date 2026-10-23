-- Compras pendientes: altas de compra inteligente pagadas que esperan habilitacion
CREATE TABLE IF NOT EXISTS torre.compras_pendientes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  comprador_id text NOT NULL,
  producto text NOT NULL,
  monto numeric(12,2) NOT NULL,
  pagado_at timestamptz NOT NULL,
  estado text NOT NULL DEFAULT 'pending' CHECK (estado IN ('pending', 'active', 'expired')),
  habilitado_at timestamptz,
  vence_at timestamptz,
  tenant_id uuid REFERENCES torre.saas_tenants(id),
  creado_at timestamptz DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_compras_pendientes_estado
  ON torre.compras_pendientes (estado);
