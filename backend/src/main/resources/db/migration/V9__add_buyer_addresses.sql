ALTER TABLE app_account ADD COLUMN address_book_version BIGINT NOT NULL DEFAULT 0;

CREATE TABLE buyer_address (
    id BIGINT NOT NULL AUTO_INCREMENT,
    buyer_id BIGINT NOT NULL,
    name VARCHAR(30) NOT NULL,
    phone CHAR(11) NOT NULL,
    address VARCHAR(200) NOT NULL,
    is_default BOOLEAN NULL,
    PRIMARY KEY (id),
    KEY idx_buyer_address (buyer_id, id),
    UNIQUE KEY uk_buyer_default_address (buyer_id, is_default),
    CONSTRAINT chk_buyer_address_default CHECK (is_default IS NULL OR is_default = TRUE),
    CONSTRAINT fk_buyer_address_account FOREIGN KEY (buyer_id) REFERENCES app_account (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE buyer_address_creation (
    buyer_id BIGINT NOT NULL,
    operation_key VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    address_id BIGINT NOT NULL,
    payload_digest BINARY(32) NOT NULL,
    PRIMARY KEY (buyer_id, operation_key),
    CONSTRAINT fk_buyer_address_creation_account FOREIGN KEY (buyer_id) REFERENCES app_account (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
