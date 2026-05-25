-- AlterTable
ALTER TABLE `users` ADD COLUMN `default_ticket_view` ENUM('list', 'kanban') NOT NULL DEFAULT 'list';
