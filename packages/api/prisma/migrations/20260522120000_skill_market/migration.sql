-- CreateTable
CREATE TABLE `skill_market_assets` (
    `id` INTEGER NOT NULL AUTO_INCREMENT,
    `display_name` VARCHAR(300) NOT NULL,
    `file_type` VARCHAR(16) NOT NULL,
    `original_filename` VARCHAR(500) NOT NULL,
    `storage_rel_path` VARCHAR(512) NOT NULL,
    `file_size` INTEGER NOT NULL,
    `uploader` VARCHAR(64) NOT NULL,
    `created_at` DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    `updated_at` DATETIME(3) NOT NULL,

    INDEX `skill_market_assets_created_at_idx`(`created_at`),
    PRIMARY KEY (`id`)
) DEFAULT CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci;
