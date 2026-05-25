/*
  Warnings:

  - You are about to drop the column `enabled` on the `chatbot_configs` table. All the data in the column will be lost.

*/
-- AlterTable
ALTER TABLE `chatbot_configs` DROP COLUMN `enabled`,
    ADD COLUMN `business_hours_end` VARCHAR(5) NULL,
    ADD COLUMN `business_hours_start` VARCHAR(5) NULL,
    ADD COLUMN `business_timezone` VARCHAR(60) NOT NULL DEFAULT 'America/Sao_Paulo',
    ADD COLUMN `mode` ENUM('off', 'scripted', 'llm') NOT NULL DEFAULT 'off',
    ADD COLUMN `out_of_hours_message` TEXT NULL;

-- AlterTable
ALTER TABLE `chatbot_sessions` ADD COLUMN `ooh_sent` BOOLEAN NOT NULL DEFAULT false;
