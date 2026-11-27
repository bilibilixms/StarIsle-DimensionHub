package cn.starisle.shared;

import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;

public final class Sha256 {
    private Sha256() {}

    public static byte[] digest(byte[] value) {
        try {
            return MessageDigest.getInstance("SHA-256").digest(value);
        } catch (NoSuchAlgorithmException exception) {
            throw new IllegalStateException("SHA-256 unavailable", exception);
        }
    }
}
