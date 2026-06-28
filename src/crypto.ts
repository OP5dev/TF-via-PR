import {
  createCipheriv,
  createDecipheriv,
  pbkdf2Sync,
  randomBytes,
} from "node:crypto";

/**
 * Plan-file encryption (Phase 4 of the TypeScript migration).
 *
 * Byte-compatible with the composite action's
 * `openssl enc -aes-256-ctr -pbkdf2 -salt -pass …`, so plan artifacts encrypted
 * by prior releases remain decryptable and vice versa. The on-disk layout is
 * OpenSSL's: the ASCII magic `Salted__`, then the 8-byte salt, then the
 * ciphertext. Key+IV are derived with PBKDF2-HMAC-SHA256 over 10000 iterations
 * (OpenSSL's defaults for `enc -pbkdf2` without `-iter`).
 *
 * Uses `node:crypto` only — no third-party crypto.
 */

const MAGIC = Buffer.from("Salted__", "latin1"); // 8 bytes; note the mixed case
const SALT_LENGTH = 8;
const KEY_LENGTH = 32; // aes-256
const IV_LENGTH = 16;
const ITERATIONS = 10_000; // OpenSSL's default for -pbkdf2
const DIGEST = "sha256"; // OpenSSL's default digest for enc since 1.1.0
const CIPHER = "aes-256-ctr";
const HEADER_LENGTH = MAGIC.length + SALT_LENGTH; // 16

function deriveKeyIv(
  passphrase: string,
  salt: Buffer,
): { key: Buffer; iv: Buffer } {
  const derived = pbkdf2Sync(
    Buffer.from(passphrase, "utf8"),
    salt,
    ITERATIONS,
    KEY_LENGTH + IV_LENGTH,
    DIGEST,
  );
  return {
    key: derived.subarray(0, KEY_LENGTH),
    iv: derived.subarray(KEY_LENGTH),
  };
}

/** Encrypt to OpenSSL's `Salted__` + salt + ciphertext format. */
export function encrypt(plaintext: Buffer, passphrase: string): Buffer {
  const salt = randomBytes(SALT_LENGTH);
  const { key, iv } = deriveKeyIv(passphrase, salt);
  const cipher = createCipheriv(CIPHER, key, iv);
  return Buffer.concat([MAGIC, salt, cipher.update(plaintext), cipher.final()]);
}

/**
 * Decrypt an OpenSSL `Salted__` blob. Throws {@link PlanDecryptError} when the
 * input is structurally not such a blob (missing/short magic header).
 *
 * AES-CTR is a stream cipher with no authentication, so a wrong passphrase does
 * NOT throw here — it yields garbage. The caller surfaces that downstream (the
 * subsequent `terraform show` of the plan fails), per the migration's decision
 * to avoid a custom integrity sentinel.
 */
export function decrypt(ciphertext: Buffer, passphrase: string): Buffer {
  if (
    ciphertext.length < HEADER_LENGTH ||
    !ciphertext.subarray(0, MAGIC.length).equals(MAGIC)
  ) {
    throw new PlanDecryptError(
      "Plan artifact is not an OpenSSL 'Salted__' blob (missing magic header); cannot decrypt.",
    );
  }
  const salt = ciphertext.subarray(MAGIC.length, HEADER_LENGTH);
  const { key, iv } = deriveKeyIv(passphrase, salt);
  const decipher = createDecipheriv(CIPHER, key, iv);
  return Buffer.concat([
    decipher.update(ciphertext.subarray(HEADER_LENGTH)),
    decipher.final(),
  ]);
}

/** Thrown when ciphertext is structurally undecryptable (not the wrong passphrase). */
export class PlanDecryptError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlanDecryptError";
  }
}
