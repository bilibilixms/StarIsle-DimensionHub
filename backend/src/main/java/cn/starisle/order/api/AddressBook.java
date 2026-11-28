package cn.starisle.order.api;

import java.util.List;

public record AddressBook(long revision, List<Address> addresses, String defaultAddressId) {
    public record Address(String id, String name, String phone, String address) {}

    public record Change(AddressBook book, String savedAddressId) {}
}
