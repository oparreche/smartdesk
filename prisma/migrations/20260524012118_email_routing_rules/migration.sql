-- CreateTable
CREATE TABLE `email_routing_rules` (
    `id` CHAR(36) NOT NULL,
    `organization_id` CHAR(36) NOT NULL,
    `pattern` VARCHAR(255) NOT NULL,
    `action` ENUM('ignore', 'tag') NOT NULL,
    `tag_name` VARCHAR(60) NULL,
    `enabled` BOOLEAN NOT NULL DEFAULT true,
    `note` VARCHAR(500) NULL,
    `match_count` INTEGER NOT NULL DEFAULT 0,
    `last_matched_at` DATETIME(3) NULL,
    `created_by_id` CHAR(36) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `email_routing_rules_organization_id_enabled_deleted_at_idx`(`organization_id`, `enabled`, `deleted_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `email_routing_rules` ADD CONSTRAINT `email_routing_rules_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
