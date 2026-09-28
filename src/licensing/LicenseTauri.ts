/**
 * Bridge layer between the frontend licensing client and Tauri's native Rust subsystem.
 * Gracefully provides secure fallbacks for development in web browser environments.
 */

export function isTauriEnvironment(): boolean {
  return typeof window !== "undefined" && "__TAURI_INTERNALS__" in window;
}

/**
 * Invokes native Tauri get_machine_id or falls back to stable browser device fingerprint in development.
 */
export async function tauriGetMachineId(): Promise<string> {
  if (isTauriEnvironment()) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const id = await invoke<string>("get_machine_id");
      return id;
    } catch (err) {
      console.warn("Tauri get_machine_id invocation failed, falling back to local fingerprint:", err);
    }
  }

  // Stable development/browser fallback
  const BROWSER_MACHINE_KEY = "plywood_dev_machine_id";
  let fallbackId = localStorage.getItem(BROWSER_MACHINE_KEY);
  if (!fallbackId) {
    const randomHex = Array.from(crypto.getRandomValues(new Uint8Array(32)))
      .map(b => b.toString(16).padStart(2, "0"))
      .join("");
    fallbackId = `DEV-${randomHex}`;
    localStorage.setItem(BROWSER_MACHINE_KEY, fallbackId);
  }
  return fallbackId;
}

/**
 * Invokes native Tauri Rust Ed25519 signature verification.
 */
export async function tauriVerifySignature(payloadJson: string, signatureB64: string): Promise<boolean> {
  if (isTauriEnvironment()) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const isValid = await invoke<boolean>("verify_license_signature", {
        payloadJson,
        signatureB64,
      });
      return isValid;
    } catch (err) {
      console.error("Tauri verify_license_signature failed:", err);
      return false;
    }
  }

  return false;
}

/**
 * Invokes native Tauri save_license_data to store token in OS AppData directory.
 */
export async function tauriSaveLicense(tokenJson: string): Promise<void> {
  if (isTauriEnvironment()) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("save_license_data", { tokenJson });
      return;
    } catch (err) {
      console.error("Tauri save_license_data failed:", err);
    }
  }

  // Browser development fallback (stored under secure namespace)
  sessionStorage.setItem("__plywood_secure_lic__", tokenJson);
}

/**
 * Invokes native Tauri load_license_data to retrieve token from OS AppData directory.
 */
export async function tauriLoadLicense(): Promise<string | null> {
  if (isTauriEnvironment()) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      const data = await invoke<string | null>("load_license_data");
      return data;
    } catch (err) {
      console.warn("Tauri load_license_data error:", err);
    }
  }

  // Browser development fallback
  return sessionStorage.getItem("__plywood_secure_lic__");
}

/**
 * Invokes native Tauri delete_license_data to wipe local license on deactivation.
 */
export async function tauriDeleteLicense(): Promise<void> {
  if (isTauriEnvironment()) {
    try {
      const { invoke } = await import("@tauri-apps/api/core");
      await invoke("delete_license_data");
    } catch (err) {
      console.error("Tauri delete_license_data failed:", err);
    }
  }

  sessionStorage.removeItem("__plywood_secure_lic__");
}
