ALTER TABLE app_account ADD COLUMN demo_account BOOLEAN NOT NULL DEFAULT FALSE;

ALTER TABLE merchant_shop ADD COLUMN description VARCHAR(2000) NOT NULL DEFAULT '';

ALTER TABLE catalog_product
    ADD COLUMN subtitle VARCHAR(120) NOT NULL DEFAULT '',
    ADD COLUMN category VARCHAR(8) NOT NULL DEFAULT '周边',
    ADD COLUMN tags JSON NULL,
    ADD COLUMN images JSON NULL,
    ADD COLUMN sold INT NOT NULL DEFAULT 0,
    ADD COLUMN creation_key VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin NULL,
    ADD COLUMN creation_digest BINARY(32) NULL,
    ADD UNIQUE KEY uk_product_creation (shop_id, creation_key);

ALTER TABLE catalog_sku ADD COLUMN sold INT NOT NULL DEFAULT 0;

INSERT INTO catalog_sku (product_id, name, price, stock)
SELECT p.id, '标准版', p.price, p.stock
FROM catalog_product p
WHERE NOT EXISTS (SELECT 1 FROM catalog_sku sku WHERE sku.product_id = p.id);
