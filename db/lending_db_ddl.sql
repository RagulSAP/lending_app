-- =============================================================
-- LendTrack — Complete Database DDL
-- Incorporates: original schema + 001_v1_updates + 002_add_created_by_and_fix_timestamps
-- Engine: InnoDB  |  Charset: utf8mb4
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
  `password_hash` VARCHAR(225) NOT NULL,
  `role_id`       INT          NOT NULL,
  `status`        INT          NOT NULL DEFAULT 1,   -- 1=active, 0=inactive
  `last_login`    DATETIME,
  `created_at`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`org_id`)  REFERENCES `organizations` (`org_id`),
  FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`)
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
  `updated_at`    DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`org_id`)     REFERENCES `organizations` (`org_id`),
  FOREIGN KEY (`user_id`)    REFERENCES `users` (`user_id`),
  FOREIGN KEY (`created_by`) REFERENCES `users` (`user_id`)
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
  `interest_type`       VARCHAR(100),                       -- FLAT / REDUCING
  `interest_rate`       NUMERIC(10,2),                      -- annual %
  `processing_fee`      NUMERIC(10,2)   DEFAULT 0,
  `disbursement_date`   DATE,
  `due_date`            DATE,
  `installment_type`    VARCHAR(100),                       -- DAILY / WEEKLY / MONTHLY
  `installment_amount`  NUMERIC(10,2),
  `total_payable`       NUMERIC(10,2),
  `total_paid`          NUMERIC(10,2)   DEFAULT 0,
  `balance_amount`      NUMERIC(10,2),
  `status`              VARCHAR(100)  NOT NULL DEFAULT 'ACTIVE',
  `remarks`             VARCHAR(100),
  `created_by`          VARCHAR(100),
  `created_at`          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`          DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`customer_id`) REFERENCES `customers` (`customer_id`),
  FOREIGN KEY (`org_id`)      REFERENCES `organizations` (`org_id`),
  FOREIGN KEY (`created_by`)  REFERENCES `users` (`user_id`)
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
  `updated_at`         DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`loan_id`) REFERENCES `loans` (`loan_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- ----------------------------------------------------------------
-- 7. wallet
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `wallet` (
  `id`         INT           NOT NULL AUTO_INCREMENT PRIMARY KEY,
  `wallet_id`  VARCHAR(36)   UNIQUE NOT NULL,
  `balance`    NUMERIC(10,2) NOT NULL DEFAULT 0,
  `org_id`     VARCHAR(36)   NOT NULL,
  `created_at` DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`org_id`) REFERENCES `organizations` (`org_id`)
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
  `remarks`          VARCHAR(225),
  `created_at`       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`       DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`org_id`)         REFERENCES `organizations` (`org_id`),
  FOREIGN KEY (`user_id`)        REFERENCES `users` (`user_id`),
  FOREIGN KEY (`customer_id`)    REFERENCES `customers` (`customer_id`),
  FOREIGN KEY (`loan_id`)        REFERENCES `loans` (`loan_id`),
  FOREIGN KEY (`installment_id`) REFERENCES `loan_installments` (`installment_id`),
  FOREIGN KEY (`wallet_id`)      REFERENCES `wallet` (`wallet_id`)
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
  `updated_at`  DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`org_id`) REFERENCES `organizations` (`org_id`)
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
  `updated_at`     DATETIME      NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  FOREIGN KEY (`user_id`)     REFERENCES `users` (`user_id`),
  FOREIGN KEY (`category_id`) REFERENCES `expense_categories` (`category_id`),
  FOREIGN KEY (`wallet_id`)   REFERENCES `wallet` (`wallet_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


-- ----------------------------------------------------------------
-- 11. loan_status_history
-- ----------------------------------------------------------------
CREATE TABLE IF NOT EXISTS `loan_status_history` (
  `id`         VARCHAR(36)  PRIMARY KEY,
  `loan_id`    VARCHAR(36)  NOT NULL,
  `old_status` VARCHAR(100),
  `new_status` VARCHAR(100) NOT NULL,
  `changed_by` VARCHAR(100),
  `changed_at` DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `remarks`    VARCHAR(100),
  FOREIGN KEY (`loan_id`)    REFERENCES `loans` (`loan_id`),
  FOREIGN KEY (`changed_by`) REFERENCES `users` (`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;


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
INSERT IGNORE INTO `wallet` (id, wallet_id, balance, org_id, created_at, updated_at)
VALUES (0, '00000000-0000-0000-0000-000000000001', 0.00,
        '00000000-0000-0000-0000-000000000000', NOW(), NOW());
