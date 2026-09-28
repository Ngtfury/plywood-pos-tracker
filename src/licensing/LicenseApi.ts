import {
  ActivationRequest,
  ActivationResponse,
  ValidationRequest,
  ValidationResponse,
  DeactivationRequest,
  DeactivationResponse,
} from "./LicenseTypes";
import { isLicenseMockEnabled, mockActivateLicense, mockValidateLicense } from "./LicenseMock";

const BASE_URL = (import.meta.env.VITE_LICENSE_API_URL || "").trim().replace(/\/+$/, "");
const CLIENT_SECRET = (import.meta.env.VITE_APP_CLIENT_SECRET || "ply_client_sec_e7b29a14d8").trim();

/**
 * Custom error class to distinguish server/network unavailability from definitive license errors.
 */
export class LicenseServerError extends Error {
  public isNetworkOrServerDown: boolean;
  public statusCode?: number;

  constructor(message: string, isNetworkOrServerDown: boolean, statusCode?: number) {
    super(message);
    this.name = "LicenseServerError";
    this.isNetworkOrServerDown = isNetworkOrServerDown;
    this.statusCode = statusCode;
  }
}

/**
 * Dedicated License API client.
 */
export const licenseApi = {
  /**
   * Activates a license on the current device.
   */
  async activate(request: ActivationRequest): Promise<ActivationResponse> {
    if (isLicenseMockEnabled()) {
      return mockActivateLicense(request.license_key, request.machine_id);
    }

    if (!BASE_URL) {
      throw new LicenseServerError(
        "License server URL is not configured. Please contact your system administrator.",
        true
      );
    }

    try {
      const response = await fetch(`${BASE_URL}/api/v1/licenses/activate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-app-secret": CLIENT_SECRET,
        },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(12000), // 12s timeout
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (response.status >= 500) {
          throw new LicenseServerError(
            "License server is temporarily unavailable (500). Please try again later.",
            true,
            response.status
          );
        }

        return {
          success: false,
          error_code: data.error_code || "INVALID_KEY",
          message: data.message || "Failed to activate license.",
        };
      }

      return data as ActivationResponse;
    } catch (err: any) {
      if (err instanceof LicenseServerError) throw err;

      // Network down, timeout, or DNS failure
      throw new LicenseServerError(
        "Unable to reach the license server. Please verify your internet connection.",
        true
      );
    }
  },

  /**
   * Periodically validates an active license with the licensing authority.
   */
  async validate(request: ValidationRequest): Promise<ValidationResponse> {
    if (isLicenseMockEnabled()) {
      return mockValidateLicense(request.license_id, request.machine_id);
    }

    if (!BASE_URL) {
      throw new LicenseServerError(
        "License server URL is not configured.",
        true
      );
    }

    try {
      const response = await fetch(`${BASE_URL}/api/v1/licenses/validate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-app-secret": CLIENT_SECRET,
        },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(10000), // 10s timeout
      });

      const data = await response.json().catch(() => ({}));

      if (!response.ok) {
        if (response.status >= 500) {
          throw new LicenseServerError(
            "License validation server returned 5xx.",
            true,
            response.status
          );
        }

        // Definitive rejection from server (e.g. 401/403/409)
        return {
          success: false,
          status: data.status || "INVALID",
          message: data.message || "License validation rejected.",
        };
      }

      return data as ValidationResponse;
    } catch (err: any) {
      if (err instanceof LicenseServerError) throw err;

      // Network / connectivity issue -> server failure, NOT license failure
      throw new LicenseServerError(
        "License validation server is currently unreachable.",
        true
      );
    }
  },

  /**
   * Deactivates the license on the current device.
   */
  async deactivate(request: DeactivationRequest): Promise<DeactivationResponse> {
    if (isLicenseMockEnabled()) {
      return { success: true, message: "Device deactivated (Mock mode)." };
    }

    if (!BASE_URL) {
      return { success: true, message: "Deactivated locally." };
    }

    try {
      const response = await fetch(`${BASE_URL}/api/v1/licenses/deactivate`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-app-secret": CLIENT_SECRET,
        },
        body: JSON.stringify(request),
        signal: AbortSignal.timeout(8000),
      });

      const data = await response.json().catch(() => ({}));
      return {
        success: response.ok,
        message: data.message || (response.ok ? "Device deactivated." : "Deactivation failed on server."),
      };
    } catch (err) {
      // Even if network fails, we still allow local deactivation to proceed
      return { success: true, message: "Deactivated on this device (offline)." };
    }
  },
};
