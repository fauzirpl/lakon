-- database migration: advanced features upgrade
USE `workplan_db`;

-- 1. Project Members Table
CREATE TABLE IF NOT EXISTS `project_members` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `project_id` INT NOT NULL,
  `user_id` INT NOT NULL,
  `role` VARCHAR(50) DEFAULT 'member',
  UNIQUE KEY `idx_project_member_user` (`project_id`, `user_id`),
  FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Alter Tasks Table: Add Assignee reference, type ENUM, and baseline dates
ALTER TABLE `tasks` 
  ADD COLUMN `assignee_id` INT DEFAULT NULL AFTER `color`,
  ADD COLUMN `type` ENUM('task', 'milestone') DEFAULT 'task' AFTER `parent_id`,
  ADD COLUMN `baseline_start_date` DATE DEFAULT NULL AFTER `type`,
  ADD COLUMN `baseline_end_date` DATE DEFAULT NULL AFTER `baseline_start_date`,
  ADD CONSTRAINT `fk_tasks_assignee_user` FOREIGN KEY (`assignee_id`) REFERENCES `users` (`id`) ON DELETE SET NULL;

-- 3. Task Comments Table
CREATE TABLE IF NOT EXISTS `comments` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `task_id` INT NOT NULL,
  `user_id` INT NOT NULL,
  `content` TEXT NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`task_id`) REFERENCES `tasks` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Attachments Table
CREATE TABLE IF NOT EXISTS `attachments` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `task_id` INT NOT NULL,
  `user_id` INT NOT NULL,
  `filename` VARCHAR(255) NOT NULL,
  `filepath` VARCHAR(255) NOT NULL,
  `filesize` INT NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`task_id`) REFERENCES `tasks` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 5. Audit Logs Table
CREATE TABLE IF NOT EXISTS `audit_logs` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `project_id` INT NOT NULL,
  `user_id` INT NOT NULL,
  `action` VARCHAR(100) NOT NULL,
  `details` TEXT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
