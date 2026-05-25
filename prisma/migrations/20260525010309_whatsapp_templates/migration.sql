-- CreateTable
CREATE TABLE `whatsapp_templates` (
    `id` CHAR(36) NOT NULL,
    `organization_id` CHAR(36) NOT NULL,
    `connection_id` CHAR(36) NOT NULL,
    `name` VARCHAR(64) NOT NULL,
    `language` VARCHAR(20) NOT NULL,
    `category` ENUM('marketing', 'utility', 'authentication') NOT NULL,
    `meta_template_id` VARCHAR(64) NULL,
    `status` ENUM('draft', 'pending', 'approved', 'rejected', 'paused', 'disabled') NOT NULL DEFAULT 'draft',
    `rejection_reason` TEXT NULL,
    `components` JSON NOT NULL,
    `variables_schema` JSON NULL,
    `created_by_user_id` CHAR(36) NULL,
    `submitted_at` DATETIME(3) NULL,
    `approved_at` DATETIME(3) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `whatsapp_templates_organization_id_status_idx`(`organization_id`, `status`),
    UNIQUE INDEX `whatsapp_templates_connection_id_name_language_key`(`connection_id`, `name`, `language`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `whatsapp_template_sends` (
    `id` CHAR(36) NOT NULL,
    `organization_id` CHAR(36) NOT NULL,
    `template_id` CHAR(36) NOT NULL,
    `connection_id` CHAR(36) NOT NULL,
    `ticket_id` CHAR(36) NULL,
    `sent_by_user_id` CHAR(36) NULL,
    `recipient_phone` VARCHAR(40) NOT NULL,
    `recipient_name` VARCHAR(200) NULL,
    `variables` JSON NULL,
    `wa_message_id` VARCHAR(128) NULL,
    `wa_conversation_id` VARCHAR(128) NULL,
    `status` ENUM('queued', 'sent', 'delivered', 'read', 'failed') NOT NULL DEFAULT 'queued',
    `failure_reason` TEXT NULL,
    `pricing_category` VARCHAR(40) NULL,
    `pricing_model` VARCHAR(40) NULL,
    `cost_amount` DECIMAL(10, 6) NULL,
    `cost_currency` VARCHAR(3) NULL,
    `sent_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `delivered_at` DATETIME(3) NULL,
    `read_at` DATETIME(3) NULL,
    `failed_at` DATETIME(3) NULL,

    INDEX `whatsapp_template_sends_organization_id_template_id_sent_at_idx`(`organization_id`, `template_id`, `sent_at`),
    INDEX `whatsapp_template_sends_wa_message_id_idx`(`wa_message_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `whatsapp_templates` ADD CONSTRAINT `whatsapp_templates_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `whatsapp_templates` ADD CONSTRAINT `whatsapp_templates_connection_id_fkey` FOREIGN KEY (`connection_id`) REFERENCES `whatsapp_connections`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `whatsapp_templates` ADD CONSTRAINT `whatsapp_templates_created_by_user_id_fkey` FOREIGN KEY (`created_by_user_id`) REFERENCES `users`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `whatsapp_template_sends` ADD CONSTRAINT `whatsapp_template_sends_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `whatsapp_template_sends` ADD CONSTRAINT `whatsapp_template_sends_template_id_fkey` FOREIGN KEY (`template_id`) REFERENCES `whatsapp_templates`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `whatsapp_template_sends` ADD CONSTRAINT `whatsapp_template_sends_connection_id_fkey` FOREIGN KEY (`connection_id`) REFERENCES `whatsapp_connections`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
