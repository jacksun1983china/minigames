/**
 * crypto-client.ts
 * Browser-side cryptographic utilities for the Minigame Hub.
 *
 * Uses the native Web Crypto API (available in all modern browsers).
 * Mirrors the server-side logic in server/crypto-utils.ts.
 *
 * Security model:
 *  1. Request integrity  – HMAC-SHA256 signature on (apiKey + timestamp + nonce + bodyHash)
 *  2. Replay protection  – 30-second timestamp window + unique nonce per request
 *  3. Response privacy   – AES-256-GCM decryption of sensitive game results
 *  4. Key derivation     – HKDF-SHA256 from (sessionToken + serverSecret) — server side only
 *
 * NOTE: The server-side signing secret is NEVER sent to the client.
 *       The client only signs requests; the server verifies them.
 *       Response decryption uses a session key derived server-side and
 *       returned once (encrypted) at session start.
 */

// ─── Helpers ──────────────────────────────────────────────────────────────────

/** Convert ArrayBuffer to hex string */
function bufToHex(buf: ArrayBuffer): string {
  return Array.from(new Uint8Array(buf))
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/** Convert hex string to Uint8Array */
function hexToBuf(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(hex.slice(i, i + 2), 16);
  }
  return bytes;
}

/** Convert base64url string to Uint8Array */
function base64urlToBuf(b64: string): Uint8Array {
  const base64 = b64.replace(/-/g, "+").replace(/_/g, "/");
  const padded = base64 + "=".repeat((4 - (base64.length % 4)) % 4);
  const binary = atob(padded);
  return Uint8Array.from(binary, (c) => c.charCodeAt(0));
}

/** Generate a cryptographically random hex nonce */
function randomNonce(): string {
  const bytes = new Uint8Array(16);
  crypto.getRandomValues(bytes);
  return Array.from(bytes)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

// ─── HMAC-SHA256 request signing ──────────────────────────────────────────────

/**
 * Compute SHA-256 hash of a JSON body string.
 * Used as the bodyHash component of the request signature.
 */
export async function hashBody(body: string): Promise<string> {
  const encoded = new TextEncoder().encode(body);
  const hash = await crypto.subtle.digest("SHA-256", encoded);
  return bufToHex(hash);
}

/**
 * Generate HMAC-SHA256 request signature headers.
 *
 * The signing secret is the VITE_GAME_CLIENT_SECRET env var.
 * This is a *public* client secret used only to prevent casual tampering;
 * the real security comes from the server-side HMAC verification against
 * its own GAME_SIGNING_SECRET (which is never exposed to the client).
 *
 * In production, the client secret should be rotated periodically and
 * distributed via the tenant API key provisioning flow.
 */
export async function signRequest(params: {
  apiKey: string;
  bodyHash: string;
}): Promise<{ "X-Timestamp": string; "X-Nonce": string; "X-Signature": string }> {
  const { apiKey, bodyHash } = params;
  const timestamp = Date.now().toString();
  const nonce = randomNonce();

  // Import the client signing secret as a CryptoKey
  const secretStr = import.meta.env.VITE_GAME_CLIENT_SECRET || "minigame-client-default-secret";
  const rawSecret = new TextEncoder().encode(secretStr);
  const keyMaterial = await crypto.subtle.importKey(
    "raw",
    rawSecret.buffer as ArrayBuffer,
    { name: "HMAC", hash: "SHA-256" },
    false,
    ["sign"]
  );

  // Sign: apiKey:timestamp:nonce:bodyHash
  const message = `${apiKey}:${timestamp}:${nonce}:${bodyHash}`;
  const msgBuf = new TextEncoder().encode(message);
  const sigBuf = await crypto.subtle.sign("HMAC", keyMaterial, msgBuf.buffer as ArrayBuffer);
  const signature = bufToHex(sigBuf);

  return {
    "X-Timestamp": timestamp,
    "X-Nonce": nonce,
    "X-Signature": signature,
  };
}

// ─── AES-256-GCM response decryption ─────────────────────────────────────────

/**
 * Import a raw 32-byte AES-256-GCM key from a hex string.
 * The hex key is returned by the server at session start (encrypted under TLS).
 */
async function importAesKey(hexKey: string): Promise<CryptoKey> {
  const raw = hexToBuf(hexKey);
  return crypto.subtle.importKey(
    "raw",
    raw.buffer as ArrayBuffer,
    { name: "AES-GCM" },
    false,
    ["decrypt"]
  );
}

/**
 * Decrypt an AES-256-GCM payload produced by server/crypto-utils.ts#encryptPayload.
 *
 * @param encoded  base64url string: iv(12B) || tag(16B) || ciphertext
 * @param hexKey   32-byte AES key as hex string (from session start response)
 */
export async function decryptPayload<T = unknown>(encoded: string, hexKey: string): Promise<T> {
  const combined = base64urlToBuf(encoded);
  if (combined.length < 28) throw new Error("Invalid encrypted payload");

  const iv = combined.slice(0, 12);
  // AES-GCM in Web Crypto expects tag appended to ciphertext
  const ciphertextWithTag = combined.slice(12); // tag(16B) + ciphertext, but Web Crypto wants ciphertext + tag

  // Web Crypto AES-GCM expects: ciphertext || tag (tag is last 16 bytes)
  // Server format: iv(12) || tag(16) || ciphertext
  // Rearrange: ciphertext || tag
  const tag = combined.slice(12, 28);
  const ciphertext = combined.slice(28);
  const ciphertextAndTag = new Uint8Array(ciphertext.length + tag.length);
  ciphertextAndTag.set(ciphertext);
  ciphertextAndTag.set(tag, ciphertext.length);

  const key = await importAesKey(hexKey);
  const plainBuf = await crypto.subtle.decrypt(
    { name: "AES-GCM", iv: iv.buffer as ArrayBuffer, tagLength: 128 },
    key,
    ciphertextAndTag.buffer as ArrayBuffer
  );

  const plain = new TextDecoder().decode(plainBuf);
  return JSON.parse(plain) as T;
}

// ─── Rate limiting (client-side) ─────────────────────────────────────────────

/**
 * Simple token-bucket rate limiter to prevent accidental rapid-fire requests.
 * Max 1 playRound request per 150ms (configurable).
 */
class RateLimiter {
  private lastCall = 0;
  private readonly minIntervalMs: number;

  constructor(minIntervalMs = 150) {
    this.minIntervalMs = minIntervalMs;
  }

  /** Returns true if the call is allowed, false if it should be throttled. */
  allow(): boolean {
    const now = Date.now();
    if (now - this.lastCall >= this.minIntervalMs) {
      this.lastCall = now;
      return true;
    }
    return false;
  }

  /** Wait until the next allowed call time, then mark it. */
  async waitAndAllow(): Promise<void> {
    const now = Date.now();
    const wait = this.minIntervalMs - (now - this.lastCall);
    if (wait > 0) await new Promise((r) => setTimeout(r, wait));
    this.lastCall = Date.now();
  }
}

/** Shared rate limiter for playRound calls (150ms minimum interval) */
export const playRoundLimiter = new RateLimiter(150);
