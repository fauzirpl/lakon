-- MySQL Schema for Workplan & Gantt Chart System

CREATE DATABASE IF NOT EXISTS `workplan_db`;
USE `workplan_db`;

-- 1. Users Table
CREATE TABLE IF NOT EXISTS `users` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `username` VARCHAR(50) NOT NULL UNIQUE,
  `password` VARCHAR(255) NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 2. Projects Table
CREATE TABLE IF NOT EXISTS `projects` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `user_id` INT NOT NULL,
  `name` VARCHAR(100) NOT NULL,
  `description` TEXT NULL,
  `start_date` DATE NOT NULL,
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`user_id`) REFERENCES `users` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 3. Tasks Table
CREATE TABLE IF NOT EXISTS `tasks` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `project_id` INT NOT NULL,
  `name` VARCHAR(255) NOT NULL,
  `start_date` DATE NOT NULL,
  `end_date` DATE NOT NULL,
  `progress` INT DEFAULT 0, -- 0 to 100
  `color` VARCHAR(7) DEFAULT '#3b82f6', -- Hex color code
  `assignee` VARCHAR(100) DEFAULT NULL,
  `parent_id` INT DEFAULT NULL, -- Self reference for subtasks
  `created_at` TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (`project_id`) REFERENCES `projects` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`parent_id`) REFERENCES `tasks` (`id`) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- 4. Dependencies Table (Predecessor relationships)
-- task_id depends on predecessor_id (i.e. predecessor_id must complete before task_id starts)
CREATE TABLE IF NOT EXISTS `dependencies` (
  `id` INT AUTO_INCREMENT PRIMARY KEY,
  `task_id` INT NOT NULL,
  `predecessor_id` INT NOT NULL,
  UNIQUE KEY `idx_task_predecessor` (`task_id`, `predecessor_id`),
  FOREIGN KEY (`task_id`) REFERENCES `tasks` (`id`) ON DELETE CASCADE,
  FOREIGN KEY (`predecessor_id`) REFERENCES `tasks` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
