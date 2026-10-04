-- =============================================================
-- LendTrack — Complete Database DDL
-- Incorporates: original schema + 001_v1_updates + 002_add_created_by_and_fix_timestamps + 003_fix_autoincrement
-- Engine: InnoDB  |  Charset: utf8mb4
-- Note: Foreign key constraints removed for dev — re-add before prod
-- =============================================================

-- CREATE DATABASE IF NOT EXISTS lending_db
--   CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
-- USE lending_db;

-- ----------------------------------------------------------------
-- 1. roles
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `roles` (
  `id`        INT         PRIMARY KEY,
  `role_name` VARCHAR(50) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- ----------------------------------------------------------------
-- 2. organizations
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `organizations` (
  `id`         INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `org_id`     VARCHAR(36)  UNIQUE NOT NULL,
  `name`       VARCHAR(100) NOT NULL,
  `address`    VARCHAR(100),
  `phone`      VARCHAR(100),
  `status`     VARCHAR(100) NOT NULL DEFAULT 'ACTIVE',
  `created_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- ----------------------------------------------------------------
-- 3. users
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `users` (
  `id`            INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `user_id`       VARCHAR(36)  UNIQUE NOT NULL,
  `org_id`        VARCHAR(36)  NOT NULL,
  `name`          VARCHAR(100) NOT NULL,
  `phone`         VARCHAR(100),
  `password`      VARCHAR(225) NOT NULL,
  `role_id`       INT          NOT NULL,
  `status`        INT          NOT NULL DEFAULT 1,   -- 1=active, 0=inactive
  `last_login`    DATETIME,
  `created_at`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- ----------------------------------------------------------------
-- 4. customers
--    user_id     → assigned collector (nullable — unassigned by default)
--    created_by  → user who onboarded this customer
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `customers` (
  `id`            INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `customer_id`   VARCHAR(36)  UNIQUE NOT NULL,
  `org_id`        VARCHAR(36)  NOT NULL,
  `name`          VARCHAR(100) NOT NULL,
  `phone`         VARCHAR(100),
  `address`       VARCHAR(255),
  `area`          VARCHAR(100),
  `city`          VARCHAR(100),
  `state`         VARCHAR(100),
  `pincode`       VARCHAR(6),
  `aadhaar`       VARCHAR(100),
  `pan`           VARCHAR(20),
  `user_id`       VARCHAR(36),
  `created_by`    VARCHAR(36),
  `photo`         VARCHAR(225),
  `id_proof`      VARCHAR(225),
  `id_proof_type` VARCHAR(10)  COMMENT 'PAN, AADHAAR, VOTER_ID, PASSPORT, DL',
  `status`        VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE',
  `created_at`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- ----------------------------------------------------------------
-- 5. loans
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `loans` (
  `id`                  INT           NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `loan_id`             VARCHAR(36)   UNIQUE NOT NULL,
  `customer_id`         VARCHAR(36)   NOT NULL,
  `org_id`              VARCHAR(36)   NOT NULL,
  `disbursement_amount` NUMERIC(10,2) NOT NULL,
  `interest_type`       VARCHAR(100),                       -- FLAT / REDUCING (legacy)
  `interest_rate`       NUMERIC(10,2),                      -- annual % (legacy)
  `processing_fee`      NUMERIC(10,2)   DEFAULT 0,
  `disbursement_date`   DATE,
  `due_date`            DATE,
  `installment_type`    VARCHAR(100),                       -- DAILY / WEEKLY / MONTHLY
  `num_installments`    INT,
  `installment_amount`  NUMERIC(10,2),                      -- collection amount per installment
  `total_payable`       NUMERIC(10,2),
  `total_paid`          NUMERIC(10,2)   DEFAULT 0,
  `balance_amount`      NUMERIC(10,2),
  `status`              VARCHAR(100)  NOT NULL DEFAULT 'ACTIVE',
  `remarks`             VARCHAR(100),
  `created_by`          VARCHAR(36),
  `created_at`          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- ----------------------------------------------------------------
-- 6. loan_installments
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `loan_installments` (
  `id`                 INT           NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `installment_id`     VARCHAR(36)   UNIQUE NOT NULL,
  `loan_id`            VARCHAR(36)   NOT NULL,
  `installment_number` INT           NOT NULL,
  `due_date`           DATE          NOT NULL,
  `principal_amount`   DECIMAL(12,2) NOT NULL,
  `interest_amount`    DECIMAL(12,2),
  `penalty_amount`     DECIMAL(12,2) DEFAULT 0,
  `total_amount`       DECIMAL(12,2) NOT NULL,
  `paid_amount`        DECIMAL(12,2) DEFAULT 0,
  `balance_amount`     DECIMAL(12,2),
  `status`             VARCHAR(20)   NOT NULL DEFAULT 'PENDING',
  `paid_date`          DATE,
  `created_at`         DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`         DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- ----------------------------------------------------------------
-- 7. wallet
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `wallet` (
  `id`               INT           NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `wallet_id`        VARCHAR(36)   UNIQUE NOT NULL,
  `invest_balance`   NUMERIC(10,2) NOT NULL DEFAULT 0,
  `rotation_balance` NUMERIC(10,2) NOT NULL DEFAULT 0,
  `interest_balance` NUMERIC(10,2) NOT NULL DEFAULT 0,
  `org_id`           VARCHAR(36)   NOT NULL,
  `created_at`       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- ----------------------------------------------------------------
-- 8. transaction
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `transaction` (
  `id`               INT           NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `transaction_id`   VARCHAR(36)   UNIQUE NOT NULL,
  `loan_id`          VARCHAR(36),
  `customer_id`      VARCHAR(36),
  `installment_id`   VARCHAR(36),
  `user_id`          VARCHAR(36),
  `org_id`           VARCHAR(36)   NOT NULL,
  `transaction_type` VARCHAR(100)  NOT NULL,
  `transaction_date` DATE          NOT NULL,
  `amount`           NUMERIC(10,2) NOT NULL,
  `payment_mode`     VARCHAR(100),
  `wallet_id`        VARCHAR(36),
  `partner_id`       VARCHAR(36),
  `remarks`          VARCHAR(225),
  `created_at`       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- ----------------------------------------------------------------
-- 9. expense_categories
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `expense_categories` (
  `id`          INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `category_id` VARCHAR(36)  UNIQUE NOT NULL,
  `org_id`      VARCHAR(36)  NOT NULL,
  `name`        VARCHAR(100) NOT NULL,
  `description` VARCHAR(255),
  `status`      VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE',
  `created_at`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- ----------------------------------------------------------------
-- 10. expense
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `expense` (
  `id`             INT           NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `expense_id`     VARCHAR(36)   UNIQUE NOT NULL,
  `user_id`        VARCHAR(36)   NOT NULL,
  `category_id`    VARCHAR(36)   NOT NULL,
  `expense_remark` VARCHAR(100),
  `expense_amount` NUMERIC(10,2) NOT NULL,
  `wallet_id`      VARCHAR(36)   NOT NULL,
  `expense_date`   DATETIME      NOT NULL,
  `created_at`     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- ----------------------------------------------------------------
-- 11. partners
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `partners` (
  `id`         INT          NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `partner_id` VARCHAR(36)  UNIQUE NOT NULL,
  `org_id`     VARCHAR(36)  NOT NULL,
  `name`       VARCHAR(100) NOT NULL,
  `phone`      VARCHAR(100),
  `status`     VARCHAR(20)  NOT NULL DEFAULT 'ACTIVE',
  `created_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- ----------------------------------------------------------------
-- 12. loan_status_history
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `loan_status_history` (
  `id`         VARCHAR(36)  PRIMARY KEY,
  `loan_id`    VARCHAR(36)  NOT NULL,
  `old_status` VARCHAR(100),
  `new_status` VARCHAR(100) NOT NULL,
  `changed_by` VARCHAR(36),
  `changed_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `remarks`    VARCHAR(100)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- ----------------------------------------------------------------
-- 13. audit_log
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `audit_log` (
  `id`              BIGINT        NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `log_id`          VARCHAR(36)   UNIQUE NOT NULL,
  `session_id`      VARCHAR(36)   COMMENT 'JWT jti — groups all actions in one login session',
  `org_id`          VARCHAR(36),
  `user_id`         VARCHAR(36),
  `user_name`       VARCHAR(100),
  `role_id`         INT,
  `action`          VARCHAR(100)  NOT NULL,
  `action_category` VARCHAR(50),
  `entity_id`       VARCHAR(100),
  `http_method`     VARCHAR(10),
  `endpoint`        VARCHAR(200),
  `ip_address`      VARCHAR(45),
  `status_code`     INT,
  `created_at`      DATETIME(3)   NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

CREATE INDEX `idx_audit_user`    ON `audit_log` (`user_id`, `created_at`);
CREATE INDEX `idx_audit_session` ON `audit_log` (`session_id`);
CREATE INDEX `idx_audit_org`     ON `audit_log` (`org_id`, `created_at`);


-- ================================================================
-- Seed data
-- ================================================================

-- Roles (fixed IDs — never auto-increment)
INSERT IGNORE INTO `roles` (id, role_name) VALUES
  (0, 'SUPER_ADMIN'),
  (1, 'ADMIN'),
  (2, 'MANAGER'),
  (3, 'STAFF'),
  (4, 'COLLECTOR'),
  (5, 'ACCOUNTANT');

-- SYSTEM organisation (reserved for Super Admin accounts)
INSERT IGNORE INTO `organizations` (id, org_id, name, address, phone, status, created_at, updated_at)
VALUES (0, '00000000-0000-0000-0000-000000000000', 'SYSTEM', NULL, NULL, 'ACTIVE', NOW(), NOW());

-- SYSTEM wallet (balance 0 — placeholder, not used for real transactions)
INSERT IGNORE INTO `wallet` (id, wallet_id, invest_balance, rotation_balance, interest_balance, org_id, created_at, updated_at)
VALUES (0, '00000000-0000-0000-0000-000000000001', 0.00, 0.00, 0.00,
        '00000000-0000-0000-0000-000000000000', NOW(), NOW());

-- ----------------------------------------------------------------
-- Default expense categories
-- Replace '<YOUR_ORG_ID>' with the actual org_id from the organizations table
-- ----------------------------------------------------------------
INSERT IGNORE INTO `expense_categories` (category_id, org_id, name, description, status) VALUES
  (UUID(), '<YOUR_ORG_ID>', 'Office Rent',           'Monthly rent for office or branch premises',           'ACTIVE'),
  (UUID(), '<YOUR_ORG_ID>', 'Staff Salaries',        'Monthly salaries and wages for all staff',             'ACTIVE'),
  (UUID(), '<YOUR_ORG_ID>', 'Travel & Transport',    'Fuel, vehicle hire and field collection travel costs', 'ACTIVE'),
  (UUID(), '<YOUR_ORG_ID>', 'Utilities',             'Electricity, water and internet bills',                'ACTIVE'),
  (UUID(), '<YOUR_ORG_ID>', 'Stationery & Printing', 'Paper, forms, receipts and printing expenses',         'ACTIVE'),
  (UUID(), '<YOUR_ORG_ID>', 'Legal & Compliance',    'Legal fees, audit charges and regulatory filings',     'ACTIVE'),
  (UUID(), '<YOUR_ORG_ID>', 'Bank Charges',          'Bank service fees, transaction charges and penalties', 'ACTIVE'),
  (UUID(), '<YOUR_ORG_ID>', 'Vehicle Maintenance',   'Servicing and repairs for office or field vehicles',   'ACTIVE'),
  (UUID(), '<YOUR_ORG_ID>', 'Marketing',             'Advertising, pamphlets and promotional activities',    'ACTIVE'),
  (UUID(), '<YOUR_ORG_ID>', 'Miscellaneous',         'Other operational expenses not covered above',         'ACTIVE');


-- ----------------------------------------------------------------
-- Migration: rename wallet.balance → invest_balance, add interest_balance
-- Run this on an existing database (skip if starting fresh).
-- ----------------------------------------------------------------
-- ALTER TABLE `wallet`
--   CHANGE COLUMN `balance` `invest_balance` NUMERIC(10,2) NOT NULL DEFAULT 0,
--   ADD COLUMN `interest_balance` NUMERIC(10,2) NOT NULL DEFAULT 0 AFTER `invest_balance`;

-- ----------------------------------------------------------------
-- Migration: add rotation_balance column (run on existing database)
-- ----------------------------------------------------------------
-- ALTER TABLE `wallet`
--   ADD COLUMN `rotation_balance` NUMERIC(10,2) NOT NULL DEFAULT 0 AFTER `invest_balance`;
-- UPDATE `wallet` SET `rotation_balance` = `invest_balance` WHERE `rotation_balance` = 0;
