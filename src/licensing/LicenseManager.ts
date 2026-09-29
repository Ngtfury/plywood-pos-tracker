import {
  LicenseState,
  LicensePayload,
  StoredLicenseToken,
  LicenseActionResult,
} from "./LicenseTypes";
import { tauriGetMachineId } from "./LicenseTauri";
import { verifyLicenseSignature } from "./LicenseCrypto";
import { loadStoredLicense, saveStoredLicense, clearStoredLicense } from "./LicenseStorage";
import { licenseApi, LicenseServerError } from "./LicenseApi";

class LicenseManager {
  private state: LicenseState = "BOOTING";
  private machineId: string = "";
  private currentToken: StoredLicenseToken | null = null;
  private errorMessage: string | null = null;
  private listeners: Set<(state: LicenseState) => void> = new Set();
  private validationIntervalId: any = null;

  public subscribe(listener: (state: LicenseState) => void): () => void {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  }

  private setState(newState: LicenseState, errorMsg: string | null = null) {
    this.state = newState;
    this.errorMessage = errorMsg;
    this.listeners.forEach(fn => fn(this.state));
  }

  public getState(): LicenseState {
    return this.state;
  }

  public getErrorMessage(): string | null {
    return this.errorMessage;
  }

  public getLicense(): LicensePayload | null {
    return this.currentToken?.payload || null;
  }

  public getMachineId(): string {
    return this.machineId;
  }

  public getLastValidatedAt(): string | null {
    return this.currentToken?.last_validated_at || null;
  }

  /**
   * Initializes the licensing layer upon application startup.
   */
  public async initialize(): Promise<LicenseState> {
    this.setState("CHECKING_LICENSE");

    try {
      this.machineId = await tauriGetMachineId();
      console.log("[Licensing] Device fingerprint resolved successfully.");

      const stored = await loadStoredLicense();
      if (!stored) {
        console.log("[Licensing] No local license found on device.");
        this.setState("ACTIVATION_REQUIRED");
        return this.state;
      }

      this.currentToken = stored;

      // 1. Verify cryptographic signature
      const isSigValid = await verifyLicenseSignature(stored.payload_json, stored.signature);
      if (!isSigValid) {
        console.warn("[Licensing] Local license cryptographic signature is invalid or tampered.");
        this.setState("LICENSE_INVALID", "License cryptographic signature could not be verified.");
        return this.state;
      }

      // 2. Verify machine binding
      if (stored.payload.machine_id !== this.machineId) {
        console.warn("[Licensing] License machine binding mismatch.");
        this.setState(
          "DEVICE_NOT_AUTHORIZED",
          "This license is registered to another computer."
        );
        return this.state;
      }

      // 3. Verify total expiration date
      const now = new Date();
      const expiresAt = new Date(stored.payload.expires_at);
      if (now > expiresAt) {
        console.warn("[Licensing] License has expired.");
        this.setState("LICENSE_EXPIRED", "Your software license has expired.");
        return this.state;
      }

      // 4. Always verify license status with licensing authority on every application launch
      // If the license has been revoked, expired, or deactivated on the server, the ERP locks immediately.
      console.log("[Licensing] App launch: Verifying license status with authority...");
      await this.validateOnline(false);

      this.startBackgroundValidationTimer();
      return this.state;
    } catch (err: any) {
      console.error("[Licensing] Initialization error:", err);
      this.setState("ACTIVATION_REQUIRED", "Failed to initialize licensing module.");
      return this.state;
    }
  }

  /**
   * Activates a new license key on this device.
   */
  public async activate(licenseKey: string): Promise<LicenseActionResult> {
    if (!licenseKey || !licenseKey.trim()) {
      return { success: false, message: "Please enter a valid license key." };
    }

    this.setState("ACTIVATING");
    try {
      if (!this.machineId) {
        this.machineId = await tauriGetMachineId();
      }

      const response = await licenseApi.activate({
        license_key: licenseKey.trim(),
        machine_id: this.machineId,
        device_name: "This Windows PC",
        platform: "windows",
        app_version: "0.1.0",
      });

      if (!response.success || !response.license || !response.signature) {
        let state: LicenseState = "ACTIVATION_REQUIRED";
        if (response.error_code === "DEVICE_NOT_AUTHORIZED") {
          state = "DEVICE_NOT_AUTHORIZED";
        } else if (response.error_code === "EXPIRED") {
          state = "LICENSE_EXPIRED";
        } else if (response.error_code === "REVOKED") {
          state = "LICENSE_REVOKED";
        }

        const msg = response.message || "License activation rejected by server.";
        this.setState(state, msg);
        return { success: false, message: msg, state };
      }

      // Verify the cryptographic signature returned by the backend
      const payloadJson = JSON.stringify(response.license);
      const isSigValid = await verifyLicenseSignature(payloadJson, response.signature);
      if (!isSigValid) {
        this.setState("LICENSE_INVALID", "Invalid signature received from license server.");
        return { success: false, message: "License server response failed cryptographic verification." };
      }

      // Save to secure local storage
      const token: StoredLicenseToken = {
        payload: response.license,
        payload_json: payloadJson,
        signature: response.signature,
        last_validated_at: new Date().toISOString(),
      };

      await saveStoredLicense(token);
      this.currentToken = token;

      // Ensure Supabase database onboarding is presented immediately after license activation
      try {
        localStorage.removeItem("plywood_supabase_configured");
      } catch (e) {
        // ignore in non-browser env
      }

      console.log("[Licensing] License activated successfully on device. Transitioning to database setup.");
      this.setState("LICENSE_ACTIVE");
      this.startBackgroundValidationTimer();
      return { success: true, message: "License activated successfully!" };
    } catch (err: any) {
      if (err instanceof LicenseServerError && err.isNetworkOrServerDown) {
        this.setState("LICENSE_SERVER_UNAVAILABLE", err.message);
        return { success: false, message: err.message };
      }

      this.setState("ACTIVATION_REQUIRED", err.message || "Failed to activate license.");
      return { success: false, message: err.message || "Failed to activate license." };
    }
  }

  /**
   * Validates the active license with the licensing authority.
   * Gracefully handles server and network outages without locking the application.
   */
  public async validateOnline(isManualUserAction: boolean = false): Promise<LicenseActionResult> {
    if (!this.currentToken) {
      this.setState("ACTIVATION_REQUIRED");
      return { success: false, message: "No active license to validate." };
    }

    try {
      const res = await licenseApi.validate({
        license_id: this.currentToken.payload.license_id,
        machine_id: this.machineId,
        app_version: "0.1.0",
      });

      if (!res.success) {
        // Explicit backend rejection -> permanently clear stored license so it cannot be used offline
        await clearStoredLicense();
        this.currentToken = null;
        this.stopBackgroundValidationTimer();

        // Explicit backend rejection
        if (res.status === "REVOKED") {
          this.setState("LICENSE_REVOKED", res.message || "Your license has been revoked.");
          return { success: false, message: "License has been revoked by your administrator." };
        }
        if (res.status === "EXPIRED") {
          this.setState("LICENSE_EXPIRED", res.message || "Your license has expired.");
          return { success: false, message: "License has expired." };
        }
        if (res.status === "DEVICE_NOT_AUTHORIZED") {
          this.setState("DEVICE_NOT_AUTHORIZED", res.message || "Device authorization revoked.");
          return { success: false, message: "Device is not authorized for this license." };
        }

        this.setState("LICENSE_INVALID", res.message || "License validation failed.");
        return { success: false, message: res.message || "License validation failed." };
      }

      // If backend returned refreshed payload & signature, update local storage
      if (res.license && res.signature) {
        const payloadJson = JSON.stringify(res.license);
        const isSigValid = await verifyLicenseSignature(payloadJson, res.signature);
        if (isSigValid) {
          const updatedToken: StoredLicenseToken = {
            payload: res.license,
            payload_json: payloadJson,
            signature: res.signature,
            last_validated_at: new Date().toISOString(),
          };
          await saveStoredLicense(updatedToken);
          this.currentToken = updatedToken;
        }
      } else {
        // Update validation timestamp
        this.currentToken.last_validated_at = new Date().toISOString();
        await saveStoredLicense(this.currentToken);
      }

      this.setState("LICENSE_ACTIVE");
      return { success: true, message: "License verified successfully with licensing authority." };
    } catch (err: any) {
      // Server down, network timeout, or offline
      console.warn("[Licensing] Server unreachable during validation. Evaluating offline grace period.");

      if (!this.currentToken) {
        this.setState("ACTIVATION_REQUIRED");
        return { success: false, message: "No active license found." };
      }

      const now = new Date();
      const offlineUntil = new Date(this.currentToken.payload.offline_until);

      if (now <= offlineUntil) {
        // Grace period permits normal ERP usage
        this.setState("LICENSE_OFFLINE");
        return {
          success: true,
          message: isManualUserAction
            ? "Server is currently unreachable. Operating under valid offline grace period."
            : undefined,
        };
      } else {
        // Offline grace expired
        this.setState(
          "LICENSE_EXPIRED",
          "Offline grace period expired. Internet connectivity is required to re-verify license."
        );
        return {
          success: false,
          message: "Offline grace period expired. Please connect to the internet to verify your license.",
        };
      }
    }
  }

  /**
   * Deactivates license on current device and resets state.
   */
  public async deactivate(): Promise<LicenseActionResult> {
    if (!this.currentToken) {
      return { success: true };
    }

    try {
      await licenseApi.deactivate({
        license_id: this.currentToken.payload.license_id,
        machine_id: this.machineId,
      });
    } catch (err) {
      console.warn("[Licensing] Server deactivation call encountered error, proceeding locally:", err);
    }

    await clearStoredLicense();
    this.currentToken = null;
    this.stopBackgroundValidationTimer();
    this.setState("ACTIVATION_REQUIRED");
    return { success: true, message: "Device deactivated successfully." };
  }

  /**
   * Feature gating helper.
   */
  public hasFeature(feature: string): boolean {
    if (!this.currentToken) return false;
    const features = this.currentToken.payload.features || [];
    return features.includes("*") || features.includes(feature);
  }

  /**
   * Returns remaining days under offline grace period.
   */
  public getRemainingOfflineDays(): number {
    if (!this.currentToken) return 0;
    const now = new Date().getTime();
    const offlineUntil = new Date(this.currentToken.payload.offline_until).getTime();
    const diffMs = offlineUntil - now;
    if (diffMs <= 0) return 0;
    return Math.ceil(diffMs / (1000 * 60 * 60 * 24));
  }

  private startBackgroundValidationTimer() {
    this.stopBackgroundValidationTimer();
    // Periodically re-verify every 30 minutes while the application remains open
    this.validationIntervalId = setInterval(() => {
      this.validateOnline(false).catch(console.error);
    }, 30 * 60 * 1000);
  }

  private stopBackgroundValidationTimer() {
    if (this.validationIntervalId) {
      clearInterval(this.validationIntervalId);
      this.validationIntervalId = null;
    }
  }
}

export const licenseManager = new LicenseManager();
