-- Fix transaction_type CHECK constraint (was 'jeonse'/'monthly_rent', should be 'lease'/'rent')
-- Also ensure all project detail columns exist

-- 1. Drop old CHECK constraint on transaction_type
ALTER TABLE projects DROP CONSTRAINT IF EXISTS projects_transaction_type_check;

-- 2. Add correct CHECK constraint
ALTER TABLE projects
  ADD CONSTRAINT projects_transaction_type_check
  CHECK (transaction_type IN ('sale', 'lease', 'rent'));

-- 3. Ensure all detail columns exist (idempotent)
ALTER TABLE projects
  ADD COLUMN IF NOT EXISTS property_category    text,
  ADD COLUMN IF NOT EXISTS main_use             text,
  ADD COLUMN IF NOT EXISTS rooms_count          integer,
  ADD COLUMN IF NOT EXISTS bathrooms_count      integer,
  ADD COLUMN IF NOT EXISTS land_area            decimal(10,2),
  ADD COLUMN IF NOT EXISTS total_area           decimal(10,2),
  ADD COLUMN IF NOT EXISTS approval_date        text,
  ADD COLUMN IF NOT EXISTS parking_legal        integer,
  ADD COLUMN IF NOT EXISTS parking_actual       integer,
  ADD COLUMN IF NOT EXISTS move_in_date         text,
  ADD COLUMN IF NOT EXISTS management_fee_detail text,
  ADD COLUMN IF NOT EXISTS building_condition   text,
  ADD COLUMN IF NOT EXISTS floor_composition    text,
  ADD COLUMN IF NOT EXISTS rental_status        text,
  ADD COLUMN IF NOT EXISTS deposit              bigint,
  ADD COLUMN IF NOT EXISTS key_money            bigint;
