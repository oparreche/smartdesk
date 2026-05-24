-- CreateTable
CREATE TABLE `csat_surveys` (
    `id` CHAR(36) NOT NULL,
    `organization_id` CHAR(36) NOT NULL,
    `ticket_id` CHAR(36) NOT NULL,
    `requester_email` VARCHAR(200) NOT NULL,
    `token` VARCHAR(80) NOT NULL,
    `rating` INTEGER NULL,
    `comment` TEXT NULL,
    `sent_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `submitted_at` DATETIME(3) NULL,
    `ip_address` VARCHAR(45) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),

    UNIQUE INDEX `csat_surveys_token_key`(`token`),
    INDEX `csat_surveys_organization_id_submitted_at_idx`(`organization_id`, `submitted_at`),
    INDEX `csat_surveys_ticket_id_idx`(`ticket_id`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `csat_surveys` ADD CONSTRAINT `csat_surveys_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE `csat_surveys` ADD CONSTRAINT `csat_surveys_ticket_id_fkey` FOREIGN KEY (`ticket_id`) REFERENCES `tickets`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
