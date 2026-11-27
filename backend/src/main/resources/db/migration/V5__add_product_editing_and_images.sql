ALTER TABLE catalog_product
    ADD COLUMN management_version BIGINT NOT NULL DEFAULT 0,
    ADD COLUMN last_edit_key VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin NULL,
    ADD COLUMN last_edit_digest BINARY(32) NULL;

CREATE TABLE catalog_image (
    id CHAR(36) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    shop_id BIGINT NOT NULL,
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    CONSTRAINT fk_catalog_image_shop FOREIGN KEY (shop_id) REFERENCES merchant_shop (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
