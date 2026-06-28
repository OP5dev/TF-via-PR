import { describe, expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { decrypt, encrypt, PlanDecryptError } from "../src/crypto";

describe("crypto round-trip", () => {
  test("encrypt -> decrypt restores the plaintext (incl. binary bytes)", () => {
    const plaintext = Buffer.from([0x00, 0x01, 0xff, 0x42, 0x0a, 0x7e]);
    expect(
      decrypt(encrypt(plaintext, "s3cret"), "s3cret").equals(plaintext),
    ).toBe(true);
  });

  test("ciphertext begins with the OpenSSL 'Salted__' magic (mixed case)", () => {
    const ct = encrypt(Buffer.from("plan"), "pw");
    expect(ct.subarray(0, 8).toString("latin1")).toBe("Salted__");
    // 8-byte magic + 8-byte salt header
    expect(ct.length).toBeGreaterThanOrEqual(16);
  });

  test("each encryption uses a fresh random salt", () => {
    const a = encrypt(Buffer.from("x"), "pw");
    const b = encrypt(Buffer.from("x"), "pw");
    expect(a.subarray(8, 16).equals(b.subarray(8, 16))).toBe(false);
  });
});

describe("OpenSSL compatibility", () => {
  test("decrypts a blob produced by the real `openssl` CLI", () => {
    // Generated with:
    //   printf 'hello-from-openssl\n' | openssl enc -aes-256-ctr -pbkdf2 -salt -pass pass:fixturepass
    const blob = readFileSync(
      join(import.meta.dir, "fixtures", "plan.openssl.enc"),
    );
    expect(decrypt(blob, "fixturepass").toString()).toBe(
      "hello-from-openssl\n",
    );
  });
});

describe("decrypt error handling", () => {
  test("throws PlanDecryptError when the magic header is missing", () => {
    expect(() => decrypt(Buffer.from("not encrypted at all"), "pw")).toThrow(
      PlanDecryptError,
    );
  });

  test("throws PlanDecryptError on a too-short input", () => {
    expect(() => decrypt(Buffer.from("Salted_"), "pw")).toThrow(
      PlanDecryptError,
    );
  });

  test("a wrong passphrase does not throw (CTR has no integrity) but yields garbage", () => {
    const ct = encrypt(Buffer.from("the real plan"), "correct");
    const out = decrypt(ct, "wrong");
    expect(out.toString()).not.toBe("the real plan");
  });
});
