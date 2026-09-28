import { isTauriEnvironment, tauriVerifySignature } from "./LicenseTauri";

/**
 * Public Verification Key for Plywood POS Licensing System (Ed25519).
 * ONLY this public key is embedded in client applications.
 * The private signing key is stored exclusively on the secure backend server.
 */
export const EMBEDDED_PUBLIC_KEY_HEX = "45c783323732ccea635bea4bd23dfa1f57a0ad6592945c450e1383df9807dbb0";

function hexToUint8Array(hexString: string): Uint8Array {
  const bytes = new Uint8Array(hexString.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hexString.substr(i * 2, 2), 16);
  }
  return bytes;
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binaryString = atob(base64.trim());
  const bytes = new Uint8Array(binaryString.length);
  for (let i = 0; i < binaryString.length; i++) {
    bytes[i] = binaryString.charCodeAt(i);
  }
  return bytes;
}

/**
 * Verifies an Ed25519 digital signature against the provided canonical JSON payload string.
 * Uses native Tauri Rust verification if running inside desktop app;
 * otherwise utilizes the browser's native Web Crypto API.
 */
export async function verifyLicenseSignature(
  payloadJson: string,
  signatureB64: string
): Promise<boolean> {
  if (!payloadJson || !signatureB64) {
    return false;
  }

  // 1. Desktop native verification through Rust
  if (isTauriEnvironment()) {
    try {
      const result = await tauriVerifySignature(payloadJson, signatureB64);
      return result;
    } catch (err) {
      console.error("Native signature verification error:", err);
    }
  }

  // 2. WebCrypto verification fallback
  try {
    const pubKeyBytes = hexToUint8Array(EMBEDDED_PUBLIC_KEY_HEX);
    const sigBytes = base64ToUint8Array(signatureB64);
    const dataBytes = new TextEncoder().encode(payloadJson);

    const cryptoKey = await window.crypto.subtle.importKey(
      "raw",
      pubKeyBytes,
      { name: "Ed25519" },
      false,
      ["verify"]
    );

    const isValid = await window.crypto.subtle.verify(
      { name: "Ed25519" },
      cryptoKey,
      sigBytes,
      dataBytes
    );

    return isValid;
  } catch (err) {
    console.error("WebCrypto Ed25519 signature verification failed:", err);
    return false;
  }
}
