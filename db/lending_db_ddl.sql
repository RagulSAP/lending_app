CREATE TABLE `organizations` (
  `id` int PRIMARY KEY,
  `org_id` varchar(36) UNIQUE NOT NULL,
  `name` varchar(100) NOT NULL,
  `address` varchar(100),
  `phone` varchar(100),
  `status` varchar(100),
  `created_at` timestamp,
  `updated_at` timestamp
);

CREATE TABLE `roles` (
  `id` int PRIMARY KEY,
  `role_name` varchar(50) NOT NULL
);

CREATE TABLE `users` (
  `id` int PRIMARY KEY,
  `user_id` varchar(36) UNIQUE NOT NULL,
  `org_id` varchar(36) NOT NULL,
  `name` varchar(100) NOT NULL,
  `phone` varchar(100),
  `password_hash` varchar(225) NOT NULL,
  `role_id` int NOT NULL,
  `status` int NOT NULL,
  `last_login` timestamp,
  `created_at` timestamp,
  `updated_at` timestamp
);

CREATE TABLE `customers` (
  `id` int PRIMARY KEY,
  `customer_id` varchar(36) UNIQUE NOT NULL,
  `org_id` varchar(36) NOT NULL,
  `name` varchar(100) NOT NULL,
  `phone` varchar(100),
  `address` varchar(255),
  `city` varchar(100),
  `state` varchar(100),
  `pincode` varchar(6),
  `aadhaar` varchar(100),
  `pan` varchar(20),
  `user_id` varchar(36),
  `photo` varchar(225),
  `id_proof` varchar(225),
  `created_at` timestamp,
  `updated_at` timestamp
);

CREATE TABLE `loans` (
  `id` int PRIMARY KEY,
  `loan_id` varchar(36) UNIQUE NOT NULL,
  `customer_id` varchar(36) NOT NULL,
  `org_id` varchar(36) NOT NULL,
  `disbursement_amount` numeric(10,2) NOT NULL,
  `interest_type` varchar(100),
  `interest_rate` numeric(10,2),
  `processing_fee` numeric(10,2),
  `disbursement_date` date,
  `due_date` date,
  `installment_type` varchar(100),
  `installment_amount` numeric(10,2),
  `total_payable` numeric(10,2),
  `total_paid` numeric(10,2),
  `balance_amount` numeric(10,2),
  `status` varchar(100),
  `remarks` varchar(100),
  `created_by` varchar(100),
  `created_at` timestamp,
  `updated_at` timestamp
);

CREATE TABLE `loan_installments` (
  `id` int PRIMARY KEY,
  `installment_id` varchar(36) UNIQUE NOT NULL,
  `loan_id` varchar(36) NOT NULL,
  `installment_number` int NOT NULL,
  `due_date` date NOT NULL,
  `principal_amount` decimal(12,2) NOT NULL,
  `interest_amount` decimal(12,2),
  `penalty_amount` decimal(12,2),
  `total_amount` decimal(12,2) NOT NULL,
  `paid_amount` decimal(12,2),
  `balance_amount` decimal(12,2),
  `status` varchar(20),
  `paid_date` date,
  `created_at` timestamp,
  `updated_at` timestamp
);

CREATE TABLE `transaction` (
  `id` int PRIMARY KEY,
  `transaction_id` varchar(36) UNIQUE NOT NULL,
  `loan_id` varchar(36),
  `customer_id` varchar(36),
  `installment_id` varchar(36),
  `user_id` varchar(36),
  `org_id` varchar(36) NOT NULL,
  `transaction_type` varchar(100) NOT NULL,
  `transaction_date` date NOT NULL,
  `amount` numeric(10,2) NOT NULL,
  `payment_mode` varchar(100),
  `wallet_id` varchar(36),
  `remarks` varchar(225),
  `created_at` timestamp,
  `updated_at` timestamp
);

CREATE TABLE `wallet` (
  `id` int PRIMARY KEY,
  `wallet_id` varchar(36) UNIQUE NOT NULL,
  `balance` numeric(10,2) NOT NULL,
  `org_id` varchar(36) NOT NULL,
  `created_at` timestamp,
  `updated_at` timestamp
);

CREATE TABLE `expense_categories` (
  `id` int PRIMARY KEY,
  `category_id` varchar(36) UNIQUE NOT NULL,
  `org_id` varchar(36) NOT NULL,
  `name` varchar(100) NOT NULL,
  `description` varchar(255),
  `status` varchar(20),
  `created_at` timestamp,
  `updated_at` timestamp
);

CREATE TABLE `expense` (
  `id` int PRIMARY KEY,
  `expense_id` varchar(36) UNIQUE NOT NULL,
  `user_id` varchar(36) NOT NULL,
  `category_id` varchar(36) NOT NULL,
  `expense_remark` varchar(100),
  `expense_amount` numeric(10,2) NOT NULL,
  `wallet_id` varchar(36) NOT NULL,
  `expense_date` timestamp NOT NULL,
  `created_at` timestamp,
  `updated_at` timestamp
);

CREATE TABLE `loan_status_history` (
  `id` varchar(36) PRIMARY KEY,
  `loan_id` varchar(36) NOT NULL,
  `old_status` varchar(100),
  `new_status` varchar(100) NOT NULL,
  `changed_by` varchar(100),
  `changed_at` timestamp,
  `remarks` varchar(100)
);

ALTER TABLE `users` ADD FOREIGN KEY (`org_id`) REFERENCES `organizations` (`org_id`);

ALTER TABLE `customers` ADD FOREIGN KEY (`org_id`) REFERENCES `organizations` (`org_id`);

ALTER TABLE `loans` ADD FOREIGN KEY (`org_id`) REFERENCES `organizations` (`org_id`);

ALTER TABLE `transaction` ADD FOREIGN KEY (`org_id`) REFERENCES `organizations` (`org_id`);

ALTER TABLE `wallet` ADD FOREIGN KEY (`org_id`) REFERENCES `organizations` (`org_id`);

ALTER TABLE `expense_categories` ADD FOREIGN KEY (`org_id`) REFERENCES `organizations` (`org_id`);

ALTER TABLE `users` ADD FOREIGN KEY (`role_id`) REFERENCES `roles` (`id`);

ALTER TABLE `customers` ADD FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`);

ALTER TABLE `expense` ADD FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`);

ALTER TABLE `transaction` ADD FOREIGN KEY (`user_id`) REFERENCES `users` (`user_id`);

ALTER TABLE `loans` ADD FOREIGN KEY (`customer_id`) REFERENCES `customers` (`customer_id`);

ALTER TABLE `transaction` ADD FOREIGN KEY (`customer_id`) REFERENCES `customers` (`customer_id`);

ALTER TABLE `loan_installments` ADD FOREIGN KEY (`loan_id`) REFERENCES `loans` (`loan_id`);

ALTER TABLE `transaction` ADD FOREIGN KEY (`loan_id`) REFERENCES `loans` (`loan_id`);

ALTER TABLE `loan_status_history` ADD FOREIGN KEY (`loan_id`) REFERENCES `loans` (`loan_id`);

ALTER TABLE `loans` ADD FOREIGN KEY (`created_by`) REFERENCES `users` (`user_id`);

ALTER TABLE `loan_status_history` ADD FOREIGN KEY (`changed_by`) REFERENCES `users` (`user_id`);

ALTER TABLE `transaction` ADD FOREIGN KEY (`installment_id`) REFERENCES `loan_installments` (`installment_id`);

ALTER TABLE `transaction` ADD FOREIGN KEY (`wallet_id`) REFERENCES `wallet` (`wallet_id`);

ALTER TABLE `expense` ADD FOREIGN KEY (`wallet_id`) REFERENCES `wallet` (`wallet_id`);
