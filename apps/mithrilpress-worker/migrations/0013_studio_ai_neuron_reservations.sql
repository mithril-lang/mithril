-- Reserve a conservative estimate before each Workers AI call. Failed or
-- ambiguous calls keep their reservation because the provider may have run.
ALTER TABLE studio_ai_usage
  ADD COLUMN estimated_neurons INTEGER NOT NULL DEFAULT 0
  CHECK (estimated_neurons BETWEEN 0 AND 8000);
