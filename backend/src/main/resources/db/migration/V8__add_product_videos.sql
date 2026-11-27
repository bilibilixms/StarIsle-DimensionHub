CREATE TABLE catalog_video (
    id CHAR(36) NOT NULL,
    shop_id BIGINT NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_catalog_video_shop FOREIGN KEY (shop_id) REFERENCES merchant_shop (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

ALTER TABLE catalog_product
    ADD COLUMN video_id CHAR(36) NULL,
    ADD CONSTRAINT fk_catalog_product_video FOREIGN KEY (video_id) REFERENCES catalog_video (id) ON DELETE SET NULL;
