import { describe, it, expect } from "vitest";
import { encrypt, decrypt, maskCredentials } from "@/lib/integrations/encryption";

describe("encryption", () => {
  const testKey = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";

  it("encrypts and decrypts a string", () => {
    const plaintext = JSON.stringify({ apiKey: "sk_live_test123", storeUrl: "mystore.myshopify.com" });
    const encrypted = encrypt(plaintext, testKey);
    expect(encrypted).not.toBe(plaintext);
    expect(encrypted).toContain(":");
    const decrypted = decrypt(encrypted, testKey);
    expect(decrypted).toBe(plaintext);
  });

  it("produces different ciphertext for same plaintext (random IV)", () => {
    const plaintext = "test";
    const a = encrypt(plaintext, testKey);
    const b = encrypt(plaintext, testKey);
    expect(a).not.toBe(b);
  });

  it("throws on invalid ciphertext", () => {
    expect(() => decrypt("invalid", testKey)).toThrow();
  });

  it("masks credential values", () => {
    const creds = { apiKey: "sk_live_test123456", storeUrl: "mystore.myshopify.com" };
    const masked = maskCredentials(creds);
    expect(masked.apiKey).toBe("sk_l****3456");
    expect(masked.storeUrl).toBe("myst****.com");
  });

  it("masks short values", () => {
    const creds = { key: "abc" };
    const masked = maskCredentials(creds);
    expect(masked.key).toBe("****");
  });
});
