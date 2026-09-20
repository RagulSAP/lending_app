-- ============================================================
-- Migration 001 — v1 bootstrap updates (additive only)
-- Run once against the existing lending_db schema
-- ============================================================

-- 1. Seed all roles (IGNORE if already present)
INSERT IGNORE INTO roles (id, role_name) VALUES
  (0, 'SUPER_ADMIN'),
  (1, 'ADMIN'),
  (2, 'MANAGER'),
  (3, 'STAFF'),
  (4, 'COLLECTOR'),
  (5, 'ACCOUNTANT');

-- 2. Add status column to customers (ACTIVE / INACTIVE)
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'ACTIVE';

-- 3. Add id_proof_type column so we know whether id_proof file is PAN or AADHAAR
ALTER TABLE customers
  ADD COLUMN IF NOT EXISTS id_proof_type VARCHAR(10) NULL COMMENT 'PAN or AADHAAR';

-- 4. Reserved SYSTEM organisation for Super Admin account(s)
--    org_id is a fixed well-known UUID — the app uses this constant from config.
INSERT IGNORE INTO organizations (id, org_id, name, address, phone, status, created_at, updated_at)
VALUES (0, '00000000-0000-0000-0000-000000000000', 'SYSTEM', NULL, NULL, 'ACTIVE', NOW(), NOW());

-- 5. Wallet row for the SYSTEM org (balance 0 — never used for transactions)
INSERT IGNORE INTO wallet (id, wallet_id, balance, org_id, created_at, updated_at)
VALUES (0, '00000000-0000-0000-0000-000000000001', 0.00,
        '00000000-0000-0000-0000-000000000000', NOW(), NOW());
