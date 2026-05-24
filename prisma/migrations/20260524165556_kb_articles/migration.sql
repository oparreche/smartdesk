-- CreateTable
CREATE TABLE `kb_articles` (
    `id` CHAR(36) NOT NULL,
    `organization_id` CHAR(36) NOT NULL,
    `slug` VARCHAR(120) NOT NULL,
    `title` VARCHAR(200) NOT NULL,
    `excerpt` VARCHAR(500) NULL,
    `content` MEDIUMTEXT NOT NULL,
    `category` VARCHAR(80) NULL,
    `tags` VARCHAR(500) NULL,
    `status` ENUM('draft', 'published', 'archived') NOT NULL DEFAULT 'draft',
    `locale` VARCHAR(10) NOT NULL DEFAULT 'pt-BR',
    `view_count` INTEGER NOT NULL DEFAULT 0,
    `helpful_yes` INTEGER NOT NULL DEFAULT 0,
    `helpful_no` INTEGER NOT NULL DEFAULT 0,
    `published_at` DATETIME(3) NULL,
    `created_by_id` CHAR(36) NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,
    `deleted_at` DATETIME(3) NULL,

    INDEX `kb_articles_organization_id_status_deleted_at_idx`(`organization_id`, `status`, `deleted_at`),
    UNIQUE INDEX `kb_articles_organization_id_slug_key`(`organization_id`, `slug`),
    FULLTEXT INDEX `kb_articles_title_excerpt_content_tags_idx`(`title`, `excerpt`, `content`, `tags`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;

-- AddForeignKey
ALTER TABLE `kb_articles` ADD CONSTRAINT `kb_articles_organization_id_fkey` FOREIGN KEY (`organization_id`) REFERENCES `organizations`(`id`) ON DELETE RESTRICT ON UPDATE CASCADE;
