-- AlterTable
ALTER TABLE `ticket_messages` ADD COLUMN `channel` ENUM('email', 'whatsapp', 'form', 'manual', 'internal', 'system') NULL,
    ADD COLUMN `wa_connection_id` CHAR(36) NULL,
    ADD COLUMN `wa_context_id` VARCHAR(255) NULL,
    ADD COLUMN `wa_from` VARCHAR(40) NULL,
    ADD COLUMN `wa_message_id` VARCHAR(255) NULL,
    ADD COLUMN `wa_to` VARCHAR(40) NULL,
    MODIFY `type` ENUM('public_reply', 'internal_note', 'incoming_email', 'incoming_whatsapp', 'outgoing_whatsapp', 'system_event') NOT NULL;

-- AlterTable
ALTER TABLE `tickets` MODIFY `origin` ENUM('gmail', 'whatsapp', 'form', 'api', 'manual') NOT NULL;

-- CreateTable
CREATE TABLE `whatsapp_connections` (
    `id` CHAR(36) NOT NULL,
    `organization_id` CHAR(36) NOT NULL,
    `display_phone_number` VARCHAR(40) NOT NULL,
    `phone_number_id` VARCHAR(64) NOT NULL,
    `business_account_id` VARCHAR(64) NOT NULL,
    `access_token_enc` TEXT NOT NULL,
    `access_token_nonce` VARCHAR(191) NOT NULL,
    `app_secret_enc` TEXT NULL,
    `app_secret_nonce` VARCHAR(191) NULL,
    `webhook_verify_token` VARCHAR(128) NOT NULL,
    `status` ENUM('active', 'disabled', 'error') NOT NULL DEFAULT 'active',
    `last_received_at` DATETIME(3) NULL,
    `last_error` TEXT NULL,
    `last_error_at` DATETIME(3) NULL,
    `inbound_filter_rules` JSON NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    UNIQUE INDEX `whatsapp_connections_organization_id_phone_number_id_key`(`organization_id`, `phone_number_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateIndex
CREATE INDEX `requesters_organization_id_phone_idx` ON `requesters`(`organization_id`, `phone`);

-- CreateIndex
CREATE INDEX `ticket_messages_wa_message_id_idx` ON `ticket_messages`(`wa_message_id`);

-- AddForeignKey
ALTER TABLE `whatsapp_connections` ADD CONSTRAINT `whatsapp_connections_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
