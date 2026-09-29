const AUTH_SALT_KEY = "plywood_user_auth_salt";
const AUTH_HASH_KEY = "plywood_user_auth_hash";

/**
 * Generates a random cryptographic salt.
 */
function generateSalt(): string {
  const arr = new Uint8Array(16);
  window.crypto.getRandomValues(arr);
  return Array.from(arr)
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Computes salted SHA-256 hash using the Web Crypto API.
 */
async function hashPassword(password: string, salt: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(salt + ":" + password);
  const hashBuffer = await window.crypto.subtle.digest("SHA-256", data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Checks whether an access password has already been created.
 */
export function hasUserPassword(): boolean {
  try {
    return Boolean(localStorage.getItem(AUTH_HASH_KEY) && localStorage.getItem(AUTH_SALT_KEY));
  } catch {
    return false;
  }
}

/**
 * Sets a new master password for the user.
 */
export async function setUserPassword(password: string): Promise<boolean> {
  if (!password || password.trim().length === 0) {
    throw new Error("Password cannot be empty.");
  }
  const salt = generateSalt();
  const hash = await hashPassword(password.trim(), salt);
  localStorage.setItem(AUTH_SALT_KEY, salt);
  localStorage.setItem(AUTH_HASH_KEY, hash);
  return true;
}

/**
 * Verifies if the entered password matches the stored salted hash.
 */
export async function verifyUserPassword(password: string): Promise<boolean> {
  try {
    const salt = localStorage.getItem(AUTH_SALT_KEY);
    const storedHash = localStorage.getItem(AUTH_HASH_KEY);

    if (!salt || !storedHash) {
      return false;
    }

    const computedHash = await hashPassword(password.trim(), salt);
    return computedHash === storedHash;
  } catch {
    return false;
  }
}

/**
 * Changes an existing master password.
 */
export async function changeUserPassword(
  oldPassword: string,
  newPassword: string
): Promise<{ success: boolean; message: string }> {
  const isOldValid = await verifyUserPassword(oldPassword);
  if (!isOldValid) {
    return { success: false, message: "Current password is incorrect." };
  }

  if (!newPassword || newPassword.trim().length < 4) {
    return { success: false, message: "New password must be at least 4 characters long." };
  }

  await setUserPassword(newPassword);
  return { success: true, message: "Master password changed successfully!" };
}

/**
 * Removes the stored password (admin/troubleshooting reset).
 */
export function resetUserPassword(): void {
  localStorage.removeItem(AUTH_SALT_KEY);
  localStorage.removeItem(AUTH_HASH_KEY);
}
