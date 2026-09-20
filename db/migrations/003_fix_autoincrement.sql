-- =============================================================
-- Migration 003: Add AUTO_INCREMENT to all integer id columns
-- Root cause: tables created without AUTO_INCREMENT cause every
--             INSERT to get id=0; the second insert fails with
--             "Duplicate entry '0' for key 'PRIMARY'"
-- =============================================================

USE lending_db;

-- ----------------------------------------------------------------
-- Step 1: Re-number any existing id=0 rows before altering.
--         (MySQL won't start AUTO_INCREMENT correctly with a 0 row
--          still in the table in some configurations.)
-- ----------------------------------------------------------------

-- transaction (confirmed affected — re-id any id=0 rows first)
SET @t_next = (SELECT IFNULL(MAX(id), 0) + 1 FROM `transaction` WHERE id > 0);
UPDATE `transaction` SET id = @t_next WHERE id = 0;

-- expense (pre-emptive — same issue if two expenses were ever added)
SET @e_next = (SELECT IFNULL(MAX(id), 0) + 1 FROM `expense` WHERE id > 0);
UPDATE `expense` SET id = @e_next WHERE id = 0;

-- customers
SET @c_next = (SELECT IFNULL(MAX(id), 0) + 1 FROM `customers` WHERE id > 0);
UPDATE `customers` SET id = @c_next WHERE id = 0;

-- loans
SET @l_next = (SELECT IFNULL(MAX(id), 0) + 1 FROM `loans` WHERE id > 0);
UPDATE `loans` SET id = @l_next WHERE id = 0;

-- loan_installments
SET @li_next = (SELECT IFNULL(MAX(id), 0) + 1 FROM `loan_installments` WHERE id > 0);
UPDATE `loan_installments` SET id = @li_next WHERE id = 0;

-- users
SET @u_next = (SELECT IFNULL(MAX(id), 0) + 1 FROM `users` WHERE id > 0);
UPDATE `users` SET id = @u_next WHERE id = 0;

-- expense_categories
SET @ec_next = (SELECT IFNULL(MAX(id), 0) + 1 FROM `expense_categories` WHERE id > 0);
UPDATE `expense_categories` SET id = @ec_next WHERE id = 0;

-- ----------------------------------------------------------------
-- Step 2: Alter all affected tables to add AUTO_INCREMENT.
--         MySQL automatically sets AUTO_INCREMENT = MAX(id) + 1.
--         Rows with id=0 (SYSTEM org, SYSTEM wallet) are left as-is
--         since they won't conflict (AUTO_INCREMENT starts at 1).
-- ----------------------------------------------------------------

ALTER TABLE `transaction`        MODIFY COLUMN `id` INT NOT NULL AUTO_INCREMENT;
ALTER TABLE `expense`            MODIFY COLUMN `id` INT NOT NULL AUTO_INCREMENT;
ALTER TABLE `customers`          MODIFY COLUMN `id` INT NOT NULL AUTO_INCREMENT;
ALTER TABLE `loans`              MODIFY COLUMN `id` INT NOT NULL AUTO_INCREMENT;
ALTER TABLE `loan_installments`  MODIFY COLUMN `id` INT NOT NULL AUTO_INCREMENT;
ALTER TABLE `users`              MODIFY COLUMN `id` INT NOT NULL AUTO_INCREMENT;
ALTER TABLE `expense_categories` MODIFY COLUMN `id` INT NOT NULL AUTO_INCREMENT;

-- organizations and wallet keep their id=0 rows (SYSTEM org / wallet)
-- AUTO_INCREMENT is still safe to add — MySQL starts from MAX(id)+1 = 1
ALTER TABLE `organizations` MODIFY COLUMN `id` INT NOT NULL AUTO_INCREMENT;
ALTER TABLE `wallet`        MODIFY COLUMN `id` INT NOT NULL AUTO_INCREMENT;
