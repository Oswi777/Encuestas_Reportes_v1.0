-- Agrega campos para seguimiento de la opción "otro"
ALTER TABLE respuestas
  ADD COLUMN IF NOT EXISTS empleado_numero VARCHAR(32),
  ADD COLUMN IF NOT EXISTS otro_comentario TEXT;

-- Índice opcional para consultas rápidas de seguimiento
CREATE INDEX IF NOT EXISTS idx_respuestas_otro
  ON respuestas ((LOWER(opcion)))
  WHERE LOWER(opcion) = 'otro';
