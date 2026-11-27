CREATE TABLE app_account (
    id BIGINT NOT NULL AUTO_INCREMENT,
    phone CHAR(11) NOT NULL,
    password_hash VARCHAR(255) NOT NULL,
    created_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    PRIMARY KEY (id),
    UNIQUE KEY uk_account_phone (phone)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE app_account_role (
    account_id BIGINT NOT NULL,
    role VARCHAR(16) NOT NULL,
    PRIMARY KEY (account_id, role),
    CONSTRAINT fk_account_role_account FOREIGN KEY (account_id) REFERENCES app_account (id) ON DELETE CASCADE,
    CONSTRAINT chk_account_role CHECK (role IN ('user', 'merchant', 'admin'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE app_account_session (
    token_digest BINARY(32) NOT NULL,
    account_id BIGINT NOT NULL,
    role VARCHAR(16) NOT NULL,
    expires_at TIMESTAMP(6) NOT NULL,
    PRIMARY KEY (token_digest),
    KEY idx_account_session_expiry (expires_at),
    CONSTRAINT fk_account_session_role FOREIGN KEY (account_id, role)
        REFERENCES app_account_role (account_id, role) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

ALTER TABLE merchant_shop
    ADD COLUMN owner_account_id BIGINT NULL,
    ADD UNIQUE KEY uk_shop_owner (owner_account_id),
    ADD CONSTRAINT fk_shop_owner FOREIGN KEY (owner_account_id) REFERENCES app_account (id);

ALTER TABLE catalog_product
    ADD COLUMN description VARCHAR(2000) NOT NULL DEFAULT '';

CREATE TABLE catalog_sku (
    id BIGINT NOT NULL AUTO_INCREMENT,
    product_id BIGINT NOT NULL,
    name VARCHAR(48) NOT NULL,
    price DECIMAL(12,2) NOT NULL,
    stock INT NOT NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_sku_product_name (product_id, name),
    CONSTRAINT fk_sku_product FOREIGN KEY (product_id) REFERENCES catalog_product (id) ON DELETE CASCADE,
    CONSTRAINT chk_sku_price CHECK (price >= 0),
    CONSTRAINT chk_sku_stock CHECK (stock >= 0)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
