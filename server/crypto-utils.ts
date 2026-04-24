/**
 * crypto-utils.ts
 * Server-side cryptographic utilities for the Minigame Hub API.
 *
 * Security model:
 *  1. Request integrity  – HMAC-SHA256 signature on (timestamp + nonce + body hash)
 *  2. Replay protection  – 30-second timestamp window + nonce dedup (in-memory LRU)
 *  3. Response privacy   – AES-256-GCM encryption of sensitive game results
 *  4. Key derivation     – session-scoped keys derived from (sessionToken + serverSecret)
 */

import crypto from "crypto";

// ─── Constants ────────────────────────────────────────────────────────────────
const REPLAY_WINDOW_MS = 30_000; // 30 seconds
const NONCE_CACHE_TTL_MS = 60_000; // keep nonces for 60 s to cover clock skew
const NONCE_CACHE_MAX = 10_000; // max cached nonces before LRU eviction

// Server-side signing secret (injected from env; falls back to JWT_SECRET)
function getServerSecret(): string {
  return process.env.GAME_SIGNING_SECRET || process.env.JWT_SECRET || "changeme-set-GAME_SIGNING_SECRET";
}

// ─── Nonce cache (simple in-memory LRU) ──────────────────────────────────────
const nonceCache = new Map<string, number>(); // nonce → expiry timestamp

function evictExpiredNonces() {
  const now = Date.now();
  for (const [nonce, expiry] of Array.from(nonceCache.entries())) {
    if (expiry < now) nonceCache.delete(nonce);
  }
}

function checkAndStoreNonce(nonce: string): boolean {
  evictExpiredNonces();
  if (nonceCache.has(nonce)) return false; // already seen → replay
  if (nonceCache.size >= NONCE_CACHE_MAX) {
    // Evict oldest entry
    const firstKey = nonceCache.keys().next().value;
    if (firstKey) nonceCache.delete(firstKey);
  }
  nonceCache.set(nonce, Date.now() + NONCE_CACHE_TTL_MS);
  return true;
}

// ─── HMAC request signature ───────────────────────────────────────────────────
/**
 * Verify a request signature sent by the client.
 *
 * Expected client headers:
 *   X-Timestamp : Unix ms timestamp (string)
 *   X-Nonce     : random 16-byte hex string
 *   X-Signature : HMAC-SHA256( apiKey + ":" + timestamp + ":" + nonce + ":" + bodyHash )
 *
 * @returns true if valid, throws on invalid
 */
export function verifyRequestSignature(params: {
  apiKey: string;
  timestamp: string;
  nonce: string;
  signature: string;
  bodyHash: string; // SHA-256 hex of the raw request body
}): boolean {
  const { apiKey, timestamp, nonce, signature, bodyHash } = params;

  // 1. Timestamp window check
  const ts = parseInt(timestamp, 10);
  if (isNaN(ts) || Math.abs(Date.now() - ts) > REPLAY_WINDOW_MS) {
    return false; // expired or future request
  }

  // 2. Nonce uniqueness check
  if (!checkAndStoreNonce(nonce)) {
    return false; // replay detected
  }

  // 3. HMAC verification
  const message = `${apiKey}:${timestamp}:${nonce}:${bodyHash}`;
  const expected = crypto
    .createHmac("sha256", getServerSecret())
    .update(message)
    .digest("hex");

  // Constant-time comparison to prevent timing attacks
  try {
    return crypto.timingSafeEqual(
      Buffer.from(signature, "hex"),
      Buffer.from(expected, "hex")
    );
  } catch {
    return false;
  }
}

// ─── AES-256-GCM response encryption ─────────────────────────────────────────
/**
 * Derive a 32-byte AES key from the session token using HKDF-SHA256.
 * The key is unique per session and never transmitted over the wire.
 */
export function deriveSessionKey(sessionToken: string): Buffer {
  const derived = crypto.hkdfSync(
    "sha256",
    Buffer.from(sessionToken, "utf8"),
    Buffer.from(getServerSecret(), "utf8"),
    Buffer.from("minigame-session-key-v1", "utf8"),
    32
  );
  return Buffer.from(derived);
}

/**
 * Encrypt a JSON-serialisable payload with AES-256-GCM.
 * Returns a compact base64url string: iv(12B) + tag(16B) + ciphertext
 */
export function encryptPayload(data: unknown, sessionToken: string): string {
  const key = deriveSessionKey(sessionToken);
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", key, iv);
  const plain = Buffer.from(JSON.stringify(data), "utf8");
  const encrypted = Buffer.concat([cipher.update(plain), cipher.final()]);
  const tag = cipher.getAuthTag();
  // Format: base64url( iv || tag || ciphertext )
  const combined = Buffer.concat([iv, tag, encrypted]);
  return combined.toString("base64url");
}

/**
 * Decrypt a payload produced by encryptPayload().
 * Returns the original object, or throws on tampered/invalid data.
 */
export function decryptPayload<T = unknown>(encoded: string, sessionToken: string): T {
  const key = deriveSessionKey(sessionToken);
  const combined = Buffer.from(encoded, "base64url");
  if (combined.length < 28) throw new Error("Invalid encrypted payload");
  const iv = combined.subarray(0, 12);
  const tag = combined.subarray(12, 28);
  const ciphertext = combined.subarray(28);
  const decipher = crypto.createDecipheriv("aes-256-gcm", key, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  return JSON.parse(plain.toString("utf8")) as T;
}

// ─── Client-side signature helper (for reference / testing) ──────────────────
/**
 * Generate the HMAC signature that the client should send.
 * This is the canonical implementation; the TypeScript client mirrors it.
 */
export function generateRequestSignature(params: {
  apiKey: string;
  bodyHash: string;
}): { timestamp: string; nonce: string; signature: string } {
  const timestamp = Date.now().toString();
  const nonce = crypto.randomBytes(16).toString("hex");
  const message = `${params.apiKey}:${timestamp}:${nonce}:${params.bodyHash}`;
  const signature = crypto
    .createHmac("sha256", getServerSecret())
    .update(message)
    .digest("hex");
  return { timestamp, nonce, signature };
}
