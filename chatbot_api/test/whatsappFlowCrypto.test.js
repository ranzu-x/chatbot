import { test, describe } from "node:test";
import assert from "node:assert/strict";
import crypto from "node:crypto";
import {
  generateFlowKeyPair,
  decryptFlowRequest,
  encryptFlowResponse,
  FlowDecryptionError,
} from "../utils/whatsappFlowCrypto.js";

/** Builds a request the way Meta's real client does: a fresh random AES-128
 * key + IV, AES-128-GCM encrypt the body, RSA-OAEP(SHA-256) encrypt the AES
 * key with the given public key. */
function buildEncryptedRequest(publicKeyPem, body) {
  const aesKey = crypto.randomBytes(16);
  const iv = crypto.randomBytes(16);
  const cipher = crypto.createCipheriv("aes-128-gcm", aesKey, iv);
  const ciphertext = Buffer.concat([cipher.update(Buffer.from(JSON.stringify(body), "utf8")), cipher.final()]);
  const authTag = cipher.getAuthTag();
  return {
    encrypted_flow_data: Buffer.concat([ciphertext, authTag]).toString("base64"),
    encrypted_aes_key: crypto.publicEncrypt(
      { key: publicKeyPem, padding: crypto.constants.RSA_PKCS1_OAEP_PADDING, oaepHash: "sha256" },
      aesKey
    ).toString("base64"),
    initial_vector: iv.toString("base64"),
    _aesKey: aesKey,
    _iv: iv,
  };
}

/** Decrypts a response the way Meta's real client does: same AES key, IV
 * bit-flipped from the original request IV. */
function decryptResponseAsMetaWould(base64Response, aesKey, requestIv) {
  const flippedIv = Buffer.from(requestIv.map((b) => b ^ 0xff));
  const buf = Buffer.from(base64Response, "base64");
  const authTag = buf.subarray(buf.length - 16);
  const ciphertext = buf.subarray(0, buf.length - 16);
  const decipher = crypto.createDecipheriv("aes-128-gcm", aesKey, flippedIv);
  decipher.setAuthTag(authTag);
  return JSON.parse(Buffer.concat([decipher.update(ciphertext), decipher.final()]).toString("utf8"));
}

describe("generateFlowKeyPair", () => {
  test("produces a usable 2048-bit RSA keypair in PEM format", () => {
    const { publicKeyPem, privateKeyPem } = generateFlowKeyPair();
    assert.match(publicKeyPem, /^-----BEGIN PUBLIC KEY-----/);
    assert.match(privateKeyPem, /^-----BEGIN RSA PRIVATE KEY-----/);
  });
});

describe("decryptFlowRequest / encryptFlowResponse round trip", () => {
  test("decrypts a Meta-shaped request and the response is decryptable the way Meta's client would", () => {
    const { publicKeyPem, privateKeyPem } = generateFlowKeyPair();
    const requestBody = { version: "3.0", action: "data_exchange", screen: "SIGN_UP", data: { name: "Ada" }, flow_token: "tok_abc" };
    const req = buildEncryptedRequest(publicKeyPem, requestBody);

    const { body, aesKey, flippedIv } = decryptFlowRequest(req, privateKeyPem);
    assert.deepEqual(body, requestBody);

    const responseObj = { screen: "SUCCESS", data: { status: "COMPLETED" } };
    const encryptedResponse = encryptFlowResponse(responseObj, aesKey, flippedIv);
    const decryptedByMeta = decryptResponseAsMetaWould(encryptedResponse, req._aesKey, req._iv);
    assert.deepEqual(decryptedByMeta, responseObj);
  });

  test("the response IV is the request IV with every byte bit-flipped, per Meta's spec", () => {
    const { publicKeyPem, privateKeyPem } = generateFlowKeyPair();
    const req = buildEncryptedRequest(publicKeyPem, { action: "ping" });
    const { flippedIv } = decryptFlowRequest(req, privateKeyPem);
    const expected = Buffer.from(req._iv.map((b) => b ^ 0xff));
    assert.equal(Buffer.compare(flippedIv, expected), 0);
  });

  test("rejects a payload encrypted under a different keypair with FlowDecryptionError, not a raw crash", () => {
    const { publicKeyPem } = generateFlowKeyPair();
    const { privateKeyPem: wrongPrivateKey } = generateFlowKeyPair();
    const req = buildEncryptedRequest(publicKeyPem, { action: "ping" });
    assert.throws(() => decryptFlowRequest(req, wrongPrivateKey), FlowDecryptionError);
  });

  test("rejects garbage input with FlowDecryptionError", () => {
    const { privateKeyPem } = generateFlowKeyPair();
    assert.throws(
      () => decryptFlowRequest({ encrypted_flow_data: "not-base64!!", encrypted_aes_key: "also-not-base64!!", initial_vector: "nope" }, privateKeyPem),
      FlowDecryptionError
    );
  });

  test("rejects a tampered ciphertext (GCM auth tag mismatch) with FlowDecryptionError", () => {
    const { publicKeyPem, privateKeyPem } = generateFlowKeyPair();
    const req = buildEncryptedRequest(publicKeyPem, { action: "ping" });
    // Flip a byte in the middle of the flow data — GCM must detect this.
    const tampered = Buffer.from(req.encrypted_flow_data, "base64");
    tampered[0] ^= 0xff;
    assert.throws(
      () => decryptFlowRequest({ ...req, encrypted_flow_data: tampered.toString("base64") }, privateKeyPem),
      FlowDecryptionError
    );
  });
});
