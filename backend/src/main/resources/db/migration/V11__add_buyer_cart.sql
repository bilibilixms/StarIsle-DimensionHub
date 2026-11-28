ALTER TABLE app_account ADD COLUMN cart_version BIGINT NOT NULL DEFAULT 0;

CREATE TABLE buyer_cart_item (
    buyer_id BIGINT NOT NULL,
    product_id BIGINT NOT NULL,
    sku_id BIGINT NOT NULL,
    title VARCHAR(200) NOT NULL,
    sku_name VARCHAR(48) NOT NULL,
    quantity INT NOT NULL,
    selected BOOLEAN NOT NULL,
    PRIMARY KEY (buyer_id, product_id, sku_id),
    CONSTRAINT fk_cart_buyer FOREIGN KEY (buyer_id) REFERENCES app_account (id) ON DELETE CASCADE,
    CONSTRAINT fk_cart_product FOREIGN KEY (product_id) REFERENCES catalog_product (id) ON DELETE CASCADE,
    CONSTRAINT chk_cart_quantity CHECK (quantity BETWEEN 0 AND 999999)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
