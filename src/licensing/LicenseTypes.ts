/**
 * Core domain types and API contracts for the Plywood POS Licensing System.
 */

export type LicenseState =
  | "BOOTING"
  | "CHECKING_LICENSE"
  | "ACTIVATION_REQUIRED"
  | "ACTIVATING"
  | "LICENSE_ACTIVE"
  | "LICENSE_OFFLINE"
  | "LICENSE_EXPIRED"
  | "LICENSE_REVOKED"
  | "LICENSE_INVALID"
  | "DEVICE_NOT_AUTHORIZED"
  | "LICENSE_SERVER_UNAVAILABLE"
  | "ERP_READY";

export type LicenseErrorCode =
  | "INVALID_KEY"
  | "DEVICE_NOT_AUTHORIZED"
  | "EXPIRED"
  | "REVOKED"
  | "MAX_DEVICES_REACHED"
  | "SERVER_UNAVAILABLE"
  | "NETWORK_ERROR"
  | "UNKNOWN_ERROR";

export interface LicensePayload {
  license_id: string;
  company_id: string;
  company_name: string;
  plan: string;
  machine_id: string;
  device_name?: string;
  issued_at: string;
  expires_at: string;
  offline_until: string;
  features: string[];
}

export interface StoredLicenseToken {
  payload: LicensePayload;
  payload_json: string;
  signature: string;
  last_validated_at: string;
  is_mock?: boolean;
}

export interface ActivationRequest {
  license_key: string;
  machine_id: string;
  device_name: string;
  platform: "windows" | "macos" | "linux";
  app_version: string;
}

export interface ActivationResponse {
  success: boolean;
  license?: LicensePayload;
  signature?: string;
  error_code?: LicenseErrorCode;
  message?: string;
}

export interface ValidationRequest {
  license_id: string;
  machine_id: string;
  app_version: string;
}

export interface ValidationResponse {
  success: boolean;
  status?: "ACTIVE" | "EXPIRED" | "REVOKED" | "DEVICE_NOT_AUTHORIZED" | "INVALID";
  license?: LicensePayload;
  signature?: string;
  message?: string;
}

export interface DeactivationRequest {
  license_id: string;
  machine_id: string;
}

export interface DeactivationResponse {
  success: boolean;
  message?: string;
}

export interface LicenseActionResult {
  success: boolean;
  message?: string;
  state?: LicenseState;
}
