-- AlterTable
ALTER TABLE `tags`
    ADD COLUMN `description` TEXT NULL,
    ADD COLUMN `keywords` JSON NULL,
    ADD COLUMN `min_keyword_matches` INTEGER NOT NULL DEFAULT 2,
    ADD COLUMN `auto_categorize` BOOLEAN NOT NULL DEFAULT false;

-- CreateTable
CREATE TABLE `categorization_configs` (
    `id` CHAR(36) NOT NULL,
    `organization_id` CHAR(36) NOT NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT false,
    `mode` ENUM('auto', 'keywords', 'ai') NOT NULL DEFAULT 'auto',
    `gemini_api_key_enc` TEXT NULL,
    `gemini_api_key_nonce` VARCHAR(191) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    UNIQUE INDEX `categorization_configs_organization_id_key`(`organization_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `categorization_configs` ADD CONSTRAINT `categorization_configs_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
