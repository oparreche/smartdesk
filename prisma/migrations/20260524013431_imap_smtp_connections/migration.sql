-- AlterTable
ALTER TABLE `tickets` MODIFY `origin` ENUM('gmail', 'imap', 'whatsapp', 'form', 'api', 'manual') NOT NULL;

-- CreateTable
CREATE TABLE `imap_smtp_connections` (
    `id` CHAR(36) NOT NULL,
    `organization_id` CHAR(36) NOT NULL,
    `display_name` VARCHAR(120) NOT NULL,
    `email_address` VARCHAR(200) NOT NULL,
    `imap_host` VARCHAR(200) NOT NULL,
    `imap_port` INTEGER NOT NULL,
    `imap_security` VARCHAR(20) NOT NULL,
    `imap_user` VARCHAR(200) NOT NULL,
    `imap_password_enc` JSON NOT NULL,
    `imap_folder` VARCHAR(80) NOT NULL DEFAULT 'INBOX',
    `smtp_host` VARCHAR(200) NOT NULL,
    `smtp_port` INTEGER NOT NULL,
    `smtp_security` VARCHAR(20) NOT NULL,
    `smtp_user` VARCHAR(200) NOT NULL,
    `smtp_password_enc` JSON NOT NULL,
    `smtp_from_name` VARCHAR(120) NULL,
    `status` ENUM('active', 'paused', 'error') NOT NULL DEFAULT 'active',
    `last_synced_at` DATETIME(3) NULL,
    `last_error` TEXT NULL,
    `last_error_at` DATETIME(3) NULL,
    `last_uid` INTEGER NULL,
    `last_uid_validity` BIGINT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `imap_smtp_connections_organization_id_status_deleted_at_idx`(`organization_id`, `status`, `deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `imap_smtp_connections` ADD CONSTRAINT `imap_smtp_connections_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
