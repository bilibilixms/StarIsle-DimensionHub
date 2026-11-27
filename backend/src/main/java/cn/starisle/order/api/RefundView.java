package cn.starisle.order.api;

public record RefundView(String id, String type, String originalStatus, String status, String reason,
                         String reply, String requestedAt, String acceptedAt, String returnedAt, String resolvedAt,
                         OrderView.Recipient returnAddress, String returnCarrier, String returnTracking,
                         Boolean restocked) {}
