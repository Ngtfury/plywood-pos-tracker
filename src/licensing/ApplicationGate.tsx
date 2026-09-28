import React from "react";
import { useLicense } from "./LicenseContext";
import { ActivationScreen } from "./ui/ActivationScreen";
import { IosSpinner } from "@/components/ui/IosSpinner";

export const ApplicationGate: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { licenseState, isLicensed } = useLicense();

  // 1. Startup verification phase
  if (licenseState === "BOOTING" || licenseState === "CHECKING_LICENSE") {
    return (
      <div className="min-h-screen w-full bg-zinc-950 flex flex-col items-center justify-center p-6 text-foreground">
        <div className="flex flex-col items-center gap-4 animate-in fade-in duration-300">
          <div className="w-12 h-12 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 p-0.5 shadow-xl shadow-emerald-500/10 flex items-center justify-center">
            <div className="w-full h-full bg-zinc-950/60 rounded-[14px] flex items-center justify-center">
              <IosSpinner size="md" className="text-emerald-400" />
            </div>
          </div>
          <p className="text-xs uppercase tracking-widest text-zinc-400 font-medium">
            Verifying Software License...
          </p>
        </div>
      </div>
    );
  }

  // 2. Authorized license state (Active or Valid Offline Grace) -> Launch existing ERP
  if (isLicensed) {
    return <>{children}</>;
  }

  // 3. Unlicensed or invalid -> Render activation screen
  return <ActivationScreen />;
};
