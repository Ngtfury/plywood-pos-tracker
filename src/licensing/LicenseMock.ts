import { LicensePayload, ActivationResponse, ValidationResponse } from "./LicenseTypes";

// Development mock signing key (only active in development when VITE_LICENSE_MOCK=true)
const DEV_SIGNING_KEY_PKCS8_HEX =
  "302e020100300506032b657004220420312a68ad1507727852dfccac88deac9197d7c365aeba84167145bcaeec79959d";

function hexToBytes(hex: string): Uint8Array {
  const bytes = new Uint8Array(hex.length / 2);
  for (let i = 0; i < bytes.length; i++) {
    bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
  }
  return bytes;
}

function bytesToBase64(bytes: Uint8Array): string {
  let binary = "";
  for (let i = 0; i < bytes.length; i++) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary);
}

/**
 * Checks whether mock licensing mode is currently permitted.
 * STRICT SECURITY RULE: NEVER permitted in production builds!
 */
export function isLicenseMockEnabled(): boolean {
  if (import.meta.env.PROD) {
    return false;
  }
  return import.meta.env.VITE_LICENSE_MOCK === "true";
}

/**
 * Creates a mathematically signed mock license for development and local testing.
 */
export async function createMockSignedLicense(
  machineId: string,
  licenseKey: string = "DEV-MOCK-LICENSE"
): Promise<{ payload: LicensePayload; payloadJson: string; signature: string }> {
  if (!isLicenseMockEnabled()) {
    throw new Error("Mock licensing is disabled in this environment.");
  }

  const now = new Date();
  const future10Years = new Date(now.getTime() + 10 * 365 * 86400000).toISOString();

  const payload: LicensePayload = {
    license_id: licenseKey.trim().toUpperCase() || "PLY-DEV-2026-MOCK",
    company_id: "COMP-DEV",
    company_name: "Development Timber Co. (Mock)",
    plan: "Enterprise Suite",
    machine_id: machineId,
    device_name: "Developer PC",
    issued_at: now.toISOString(),
    expires_at: future10Years,
    offline_until: future10Years,
    features: ["inventory", "accounting", "credits", "analytics", "export", "*"],
  };

  const payloadJson = JSON.stringify(payload);

  // Sign payload with the dev Ed25519 key using Web Crypto
  const privKeyBytes = hexToBytes(DEV_SIGNING_KEY_PKCS8_HEX);
  const cryptoKey = await window.crypto.subtle.importKey(
    "pkcs8",
    privKeyBytes,
    { name: "Ed25519" },
    false,
    ["sign"]
  );

  const signatureBuffer = await window.crypto.subtle.sign(
    { name: "Ed25519" },
    cryptoKey,
    new TextEncoder().encode(payloadJson)
  );

  const signature = bytesToBase64(new Uint8Array(signatureBuffer));

  return { payload, payloadJson, signature };
}

/**
 * Mock activation handler.
 */
export async function mockActivateLicense(
  licenseKey: string,
  machineId: string
): Promise<ActivationResponse> {
  if (!isLicenseMockEnabled()) {
    return {
      success: false,
      error_code: "SERVER_UNAVAILABLE",
      message: "Mock licensing is disabled.",
    };
  }

  // Allow testing invalid key by entering "INVALID-KEY"
  if (licenseKey.trim().toUpperCase() === "INVALID-KEY") {
    return {
      success: false,
      error_code: "INVALID_KEY",
      message: "Invalid license key format or key does not exist.",
    };
  }

  // Allow testing expired key by entering "EXPIRED-KEY"
  if (licenseKey.trim().toUpperCase() === "EXPIRED-KEY") {
    return {
      success: false,
      error_code: "EXPIRED",
      message: "This license expired and cannot be activated.",
    };
  }

  const { payload, signature } = await createMockSignedLicense(machineId, licenseKey);

  return {
    success: true,
    license: payload,
    signature,
    message: "Development mock license activated successfully.",
  };
}

/**
 * Mock validation handler.
 */
export async function mockValidateLicense(
  licenseId: string,
  machineId: string
): Promise<ValidationResponse> {
  if (!isLicenseMockEnabled()) {
    return { success: false, status: "INVALID", message: "Mock licensing is disabled." };
  }

  if (licenseId.toUpperCase().includes("REVOKED")) {
    return {
      success: false,
      status: "REVOKED",
      message: "Your organization's license has been revoked by the administrator.",
    };
  }

  const { payload, signature } = await createMockSignedLicense(machineId, licenseId);

  return {
    success: true,
    status: "ACTIVE",
    license: payload,
    signature,
    message: "License validated successfully (Mock).",
  };
}
