/**
 * WhatsApp Flows encrypted data-exchange — implements Meta's exact spec for
 * https://developers.facebook.com/docs/whatsapp/flows/guides/implementingyourflowendpoint
 *
 * Request (from Meta): { encrypted_flow_data, encrypted_aes_key, initial_vector }
 *  1. RSA-OAEP(SHA-256) decrypt `encrypted_aes_key` with our private key -> a
 *     128-bit AES key, generated fresh by Meta for this one request.
 *  2. AES-128-GCM decrypt `encrypted_flow_data` with that AES key and
 *     `initial_vector` as the IV. The GCM auth tag is the LAST 16 bytes of
 *     encrypted_flow_data, not sent separately.
 *
 * Response (back to Meta): encrypt the SAME way but with the IV
 * bit-flipped (every byte XORed with 0xFF) — this is Meta's spec, not a
 * choice: reusing the request IV as-is would mean two different messages
 * (the request and our response) both encrypted under the same key+IV
 * pair, which breaks GCM's security guarantee. The response is the raw
 * base64 ciphertext+tag as a PLAIN STRING (Content-Type: text/plain), not
 * JSON — Meta's client expects exactly that.
 *
 * A decryption failure (wrong/rotated key, corrupted payload) must return
 * HTTP 421 — Meta's spec uses that specific status as the signal to the
 * WhatsApp client that the public key needs refreshing, distinct from any
 * other error.
 */
import crypto from "crypto";

export class FlowDecryptionError extends Error {}

export function generateFlowKeyPair() {
  const { publicKey, privateKey } = crypto.generateKeyPairSync("rsa", {
    modulusLength: 2048,
    publicKeyEncoding: { type: "spki", format: "pem" },
    privateKeyEncoding: { type: "pkcs1", format: "pem" },
  });
  return { publicKeyPem: publicKey, privateKeyPem: privateKey };
}

/**
 * Decrypts one incoming request. Returns { body, aesKey, flippedIv } where
 * `body` is the parsed JSON payload ({ version, action, screen, data,
 * flow_token }) and `aesKey`/`flippedIv` are exactly what encryptFlowResponse
 * needs to answer this same request.
 */
export function decryptFlowRequest({ encrypted_flow_data, encrypted_aes_key, initial_vector }, privateKeyPem) {
  let aesKey;
  try {
    aesKey = crypto.privateDecrypt(
      { key: privateKeyPem, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
      Buffer.from(encrypted_aes_key, "base64")
    );
  } catch (err) {
    throw new FlowDecryptionError(`Could not decrypt AES key: ${err.message}`);
  }

  const flowDataBuffer = Buffer.from(encrypted_flow_data, "base64");
  if (flowDataBuffer.length < 17) throw new FlowDecryptionError("encrypted_flow_data too short to contain a GCM auth tag");
  const authTag = flowDataBuffer.subarray(flowDataBuffer.length - 16);
  const ciphertext = flowDataBuffer.subarray(0, flowDataBuffer.length - 16);
  const iv = Buffer.from(initial_vector, "base64");

  let decrypted;
  try {
    const decipher = crypto.createDecipheriv("aes-128-gcm", aesKey, iv);
    decipher.setAuthTag(authTag);
    decrypted = Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch (err) {
    throw new FlowDecryptionError(`Could not decrypt flow data: ${err.message}`);
  }

  let body;
  try {
    body = JSON.parse(decrypted.toString("utf8"));
  } catch (err) {
    throw new FlowDecryptionError(`Decrypted payload is not valid JSON: ${err.message}`);
  }

  // The response IV is the request IV with every bit flipped — precompute
  // it here so callers never have to think about this detail.
  const flippedIv = Buffer.from(iv.map((b) => b ^ 0xff));

  return { body, aesKey, flippedIv };
}

/** Encrypts a response object for the SAME request this aesKey/flippedIv
 * pair came from. Returns a base64 string — send it back as the raw
 * text/plain response body, not wrapped in JSON. */
export function encryptFlowResponse(responseObj, aesKey, flippedIv) {
  const cipher = crypto.createCipheriv("aes-128-gcm", aesKey, flippedIv);
  const plaintext = Buffer.from(JSON.stringify(responseObj), "utf8");
  const encrypted = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return Buffer.concat([encrypted, authTag]).toString("base64");
}
