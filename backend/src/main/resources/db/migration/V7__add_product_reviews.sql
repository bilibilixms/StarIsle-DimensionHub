ALTER TABLE catalog_image
    DROP FOREIGN KEY fk_catalog_image_shop,
    MODIFY COLUMN shop_id BIGINT NULL,
    ADD COLUMN buyer_id BIGINT NULL,
    ADD CONSTRAINT fk_image_shop FOREIGN KEY (shop_id) REFERENCES merchant_shop (id) ON DELETE CASCADE,
    ADD CONSTRAINT fk_image_buyer FOREIGN KEY (buyer_id) REFERENCES app_account (id) ON DELETE CASCADE;

CREATE TABLE product_review (
    id BIGINT NOT NULL AUTO_INCREMENT,
    order_item_id BIGINT NOT NULL,
    operation_key VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    payload_digest BINARY(32) NOT NULL,
    author VARCHAR(40) NOT NULL,
    rating TINYINT NOT NULL,
    content VARCHAR(500) NOT NULL,
    images JSON NOT NULL,
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    reply_content VARCHAR(500),
    replied_at TIMESTAMP(6) NULL,
    reply_operation_key VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_review_item (order_item_id),
    CONSTRAINT fk_review_item FOREIGN KEY (order_item_id) REFERENCES market_order_item (id) ON DELETE CASCADE,
    CONSTRAINT chk_review_rating CHECK (rating BETWEEN 1 AND 5)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
