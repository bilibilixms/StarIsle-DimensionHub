CREATE TABLE buyer_favorite (
    buyer_id BIGINT NOT NULL,
    product_id BIGINT NOT NULL,
    is_favorite BOOLEAN NOT NULL,
    PRIMARY KEY (buyer_id, product_id),
    CONSTRAINT fk_favorite_buyer FOREIGN KEY (buyer_id) REFERENCES app_account (id) ON DELETE CASCADE,
    CONSTRAINT fk_favorite_product FOREIGN KEY (product_id) REFERENCES catalog_product (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
