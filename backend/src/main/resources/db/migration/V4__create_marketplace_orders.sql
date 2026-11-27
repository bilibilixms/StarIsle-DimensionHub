CREATE TABLE order_checkout (
    id BIGINT NOT NULL AUTO_INCREMENT,
    buyer_id BIGINT NOT NULL,
    operation_key VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    payload_digest BINARY(32) NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_checkout_operation (buyer_id, operation_key),
    CONSTRAINT fk_checkout_buyer FOREIGN KEY (buyer_id) REFERENCES app_account (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE market_order (
    id BIGINT NOT NULL AUTO_INCREMENT,
    checkout_id BIGINT NOT NULL,
    buyer_id BIGINT NOT NULL,
    shop_id BIGINT NOT NULL,
    shop_name VARCHAR(100) NOT NULL,
    buyer_name VARCHAR(40) NOT NULL,
    recipient_name VARCHAR(30) NOT NULL,
    recipient_phone CHAR(11) NOT NULL,
    recipient_address VARCHAR(200) NOT NULL,
    amount_cents BIGINT NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'PAID',
    carrier VARCHAR(40),
    tracking VARCHAR(64),
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    shipped_at TIMESTAMP(6) NULL,
    completed_at TIMESTAMP(6) NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_order_shop_checkout (checkout_id, shop_id),
    KEY idx_order_buyer (buyer_id, id),
    KEY idx_order_shop (shop_id, id),
    CONSTRAINT fk_order_checkout FOREIGN KEY (checkout_id) REFERENCES order_checkout (id),
    CONSTRAINT fk_order_buyer FOREIGN KEY (buyer_id) REFERENCES app_account (id),
    CONSTRAINT fk_order_shop FOREIGN KEY (shop_id) REFERENCES merchant_shop (id),
    CONSTRAINT chk_order_status CHECK (status IN ('PAID', 'SHIPPED', 'COMPLETED')),
    CONSTRAINT chk_order_amount CHECK (amount_cents >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE market_order_item (
    id BIGINT NOT NULL AUTO_INCREMENT,
    order_id BIGINT NOT NULL,
    product_id BIGINT NOT NULL,
    sku_id BIGINT NOT NULL,
    title VARCHAR(200) NOT NULL,
    variant VARCHAR(48) NOT NULL,
    cover_url VARCHAR(1024),
    unit_price_cents BIGINT NOT NULL,
    quantity INT NOT NULL,
    PRIMARY KEY (id),
    KEY idx_order_item_order (order_id, id),
    CONSTRAINT fk_order_item_order FOREIGN KEY (order_id) REFERENCES market_order (id) ON DELETE CASCADE,
    CONSTRAINT chk_order_item_price CHECK (unit_price_cents >= 0),
    CONSTRAINT chk_order_item_quantity CHECK (quantity > 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
