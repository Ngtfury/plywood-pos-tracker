import { StoredLicenseToken } from "./LicenseTypes";
import { tauriSaveLicense, tauriLoadLicense, tauriDeleteLicense } from "./LicenseTauri";

let inMemoryTokenCache: StoredLicenseToken | null = null;

/**
 * Loads the active stored license token from secure OS storage.
 */
export async function loadStoredLicense(): Promise<StoredLicenseToken | null> {
  if (inMemoryTokenCache) {
    return inMemoryTokenCache;
  }

  try {
    const rawData = await tauriLoadLicense();
    if (!rawData) {
      return null;
    }

    const parsed: StoredLicenseToken = JSON.parse(rawData);
    if (!parsed || !parsed.payload || !parsed.signature) {
      return null;
    }

    inMemoryTokenCache = parsed;
    return parsed;
  } catch (err) {
    console.error("Failed to parse stored license token from secure storage:", err);
    return null;
  }
}

/**
 * Saves the validated signed license token to secure OS storage and updates the memory cache.
 */
export async function saveStoredLicense(token: StoredLicenseToken): Promise<void> {
  inMemoryTokenCache = token;
  const tokenJson = JSON.stringify(token);
  await tauriSaveLicense(tokenJson);
}

/**
 * Completely wipes the local license token on deactivation.
 */
export async function clearStoredLicense(): Promise<void> {
  inMemoryTokenCache = null;
  await tauriDeleteLicense();
}
