import React, { createContext, useContext, useEffect, useState, useMemo } from "react";
import { LicenseState, LicensePayload, LicenseActionResult } from "./LicenseTypes";
import { licenseManager } from "./LicenseManager";

interface LicenseContextValue {
  license: LicensePayload | null;
  licenseState: LicenseState;
  isLicensed: boolean;
  isOffline: boolean;
  isExpired: boolean;
  machineId: string;
  remainingOfflineDays: number;
  lastValidatedAt: string | null;
  errorMessage: string | null;
  activate: (key: string) => Promise<LicenseActionResult>;
  validate: (force?: boolean) => Promise<LicenseActionResult>;
  deactivate: () => Promise<LicenseActionResult>;
  hasFeature: (feature: string) => boolean;
}

const LicenseContext = createContext<LicenseContextValue | null>(null);

export const LicenseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [state, setState] = useState<LicenseState>(licenseManager.getState());
  const [errorMsg, setErrorMsg] = useState<string | null>(licenseManager.getErrorMessage());

  useEffect(() => {
    const unsubscribe = licenseManager.subscribe((newState) => {
      setState(newState);
      setErrorMsg(licenseManager.getErrorMessage());
    });

    // Run startup license initialization
    licenseManager.initialize().catch(console.error);

    return unsubscribe;
  }, []);

  const isLicensed = useMemo(() => {
    return state === "LICENSE_ACTIVE" || state === "LICENSE_OFFLINE" || state === "ERP_READY";
  }, [state]);

  const isOffline = state === "LICENSE_OFFLINE";
  const isExpired = state === "LICENSE_EXPIRED";

  const contextValue: LicenseContextValue = {
    license: licenseManager.getLicense(),
    licenseState: state,
    isLicensed,
    isOffline,
    isExpired,
    machineId: licenseManager.getMachineId(),
    remainingOfflineDays: licenseManager.getRemainingOfflineDays(),
    lastValidatedAt: licenseManager.getLastValidatedAt(),
    errorMessage: errorMsg,
    activate: (key: string) => licenseManager.activate(key),
    validate: (force?: boolean) => licenseManager.validateOnline(force),
    deactivate: () => licenseManager.deactivate(),
    hasFeature: (feature: string) => licenseManager.hasFeature(feature),
  };

  return <LicenseContext.Provider value={contextValue}>{children}</LicenseContext.Provider>;
};

export function useLicense(): LicenseContextValue {
  const ctx = useContext(LicenseContext);
  if (!ctx) {
    throw new Error("useLicense must be used within a <LicenseProvider>");
  }
  return ctx;
}
