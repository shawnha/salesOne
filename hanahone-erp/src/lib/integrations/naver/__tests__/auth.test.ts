import { describe, it, expect } from "vitest";
import { generateClientSecretSign } from "../auth";

describe("generateClientSecretSign", () => {
  it("generates a base64-encoded bcrypt hash", () => {
    const clientId = "test-client-id";
    const clientSecret = "$2a$04$YourTestSaltHere22char";
    const timestamp = 1711670400000;

    const sign = generateClientSecretSign(clientId, clientSecret, timestamp);

    expect(sign).toMatch(/^[A-Za-z0-9+/]+=*$/);

    const decoded = Buffer.from(sign, "base64").toString();
    expect(decoded).toMatch(/^\$2a\$/);
  });

  it("produces different signs for different timestamps", () => {
    const clientId = "test-client-id";
    const clientSecret = "$2a$04$YourTestSaltHere22char";

    const sign1 = generateClientSecretSign(clientId, clientSecret, 1000);
    const sign2 = generateClientSecretSign(clientId, clientSecret, 2000);

    expect(sign1).not.toBe(sign2);
  });
});
