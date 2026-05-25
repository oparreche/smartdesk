-- CreateTable
CREATE TABLE `chatbot_configs` (
    `id` CHAR(36) NOT NULL,
    `organization_id` CHAR(36) NOT NULL,
    `connection_id` CHAR(36) NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT false,
    `greeting` TEXT NOT NULL,
    `systemPrompt` TEXT NOT NULL,
    `required_fields` JSON NOT NULL,
    `escalation_keywords` JSON NOT NULL,
    `max_turns` INTEGER NOT NULL DEFAULT 20,
    `gemini_api_key_enc` TEXT NULL,
    `gemini_api_key_nonce` VARCHAR(191) NULL,
    `gemini_model` VARCHAR(80) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `chatbot_configs_connection_id_key`(`connection_id`),
    INDEX `chatbot_configs_organization_id_idx`(`organization_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- CreateTable
CREATE TABLE `chatbot_sessions` (
    `id` CHAR(36) NOT NULL,
    `organization_id` CHAR(36) NOT NULL,
    `connection_id` CHAR(36) NOT NULL,
    `from_phone` VARCHAR(40) NOT NULL,
    `requester_id` CHAR(36) NULL,
    `state` ENUM('active', 'escalated', 'abandoned', 'completed') NOT NULL DEFAULT 'active',
    `turns` INTEGER NOT NULL DEFAULT 0,
    `collected_fields` JSON NULL,
    `messages` JSON NOT NULL,
    `ticket_id` CHAR(36) NULL,
    `started_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `last_message_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `completed_at` DATETIME(3) NULL,

    INDEX `chatbot_sessions_organization_id_last_message_at_idx`(`organization_id`, `last_message_at`),
    UNIQUE INDEX `chatbot_sessions_connection_id_from_phone_state_key`(`connection_id`, `from_phone`, `state`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `chatbot_configs` ADD CONSTRAINT `chatbot_configs_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `chatbot_configs` ADD CONSTRAINT `chatbot_configs_connection_id_fkey` FOREIGN KEY (`connection_id`) REFERENCES `whatsapp_connections`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `chatbot_sessions` ADD CONSTRAINT `chatbot_sessions_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `chatbot_sessions` ADD CONSTRAINT `chatbot_sessions_connection_id_fkey` FOREIGN KEY (`connection_id`) REFERENCES `whatsapp_connections`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
