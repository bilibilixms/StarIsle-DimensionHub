ALTER TABLE market_order
    DROP CHECK chk_order_status;

ALTER TABLE market_order
    ADD CONSTRAINT chk_order_status
        CHECK (status IN ('PAID', 'SHIPPED', 'COMPLETED', 'REFUND_PENDING', 'REFUNDED'));

CREATE TABLE market_order_refund (
    id BIGINT NOT NULL AUTO_INCREMENT,
    order_id BIGINT NOT NULL,
    operation_key VARCHAR(100) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    original_status VARCHAR(16) NOT NULL,
    type VARCHAR(16) NOT NULL,
    status VARCHAR(16) NOT NULL DEFAULT 'PENDING',
    reason VARCHAR(200) NOT NULL,
    reply VARCHAR(200),
    return_name VARCHAR(30),
    return_phone CHAR(11),
    return_address VARCHAR(200),
    return_carrier VARCHAR(30),
    return_tracking VARCHAR(24),
    restocked BOOLEAN,
    requested_at TIMESTAMP(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
    accepted_at TIMESTAMP(6) NULL,
    returned_at TIMESTAMP(6) NULL,
    resolved_at TIMESTAMP(6) NULL,
    PRIMARY KEY (id),
    UNIQUE KEY uk_refund_operation (order_id, operation_key),
    KEY idx_refund_order (order_id, id),
    CONSTRAINT fk_refund_order FOREIGN KEY (order_id) REFERENCES market_order (id) ON DELETE CASCADE,
    CONSTRAINT chk_refund_original_status CHECK (original_status IN ('PAID', 'SHIPPED', 'COMPLETED')),
    CONSTRAINT chk_refund_type CHECK (type IN ('REFUND_ONLY', 'RETURN_REFUND')),
    CONSTRAINT chk_refund_status
        CHECK (status IN ('PENDING', 'WAIT_RETURN', 'WAIT_RECEIPT', 'APPROVED', 'REJECTED', 'CANCELLED'))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;
