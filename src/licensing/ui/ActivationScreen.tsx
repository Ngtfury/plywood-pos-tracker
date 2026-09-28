import React, { useState } from "react";
import { 
  Key, 
  ShieldAlert, 
  ShieldCheck, 
  Laptop, 
  Building2, 
  AlertCircle, 
  RefreshCw, 
  HelpCircle,
  ArrowRight
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { IosSpinner } from "@/components/ui/IosSpinner";
import { useLicense } from "../LicenseContext";
import { isLicenseMockEnabled } from "../LicenseMock";

export function ActivationScreen() {
  const { licenseState, errorMessage, machineId, activate, validate } = useLicense();
  const [licenseKey, setLicenseKey] = useState("");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [localFeedback, setLocalFeedback] = useState<{ success: boolean; message: string } | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!licenseKey.trim()) return;

    setIsSubmitting(true);
    setLocalFeedback(null);

    const res = await activate(licenseKey.trim());
    setIsSubmitting(false);

    if (!res.success) {
      setLocalFeedback({ success: false, message: res.message || "License activation failed." });
    }
  };

  const handleRetryValidate = async () => {
    setIsSubmitting(true);
    setLocalFeedback(null);
    const res = await validate(true);
    setIsSubmitting(false);
    if (!res.success) {
      setLocalFeedback({ success: false, message: res.message || "Verification failed." });
    }
  };

  const displayError = localFeedback?.message || errorMessage;
  const isMock = isLicenseMockEnabled();

  return (
    <div className="min-h-screen w-full bg-zinc-950 text-foreground flex items-center justify-center p-4 sm:p-6 relative overflow-hidden selection:bg-emerald-500/30 selection:text-emerald-200">
      
      {/* Ambient Radial Background Glows matching ERP theme */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-emerald-500/10 rounded-full blur-[130px] pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-teal-500/10 rounded-full blur-[140px] pointer-events-none" />

      <div className="w-full max-w-lg relative z-10 animate-in fade-in zoom-in-95 duration-200">
        
        <div className="bg-zinc-900/80 border border-zinc-800/80 backdrop-blur-2xl rounded-3xl shadow-2xl p-7 sm:p-9 relative overflow-hidden">
          
          {/* Subtle Top Inner Highlight */}
          <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-emerald-500/40 to-transparent" />

          {/* Header & Logo */}
          <div className="text-center space-y-3 mb-6">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 p-0.5 shadow-lg shadow-emerald-500/20 flex items-center justify-center">
              <div className="w-full h-full bg-zinc-950/40 rounded-[14px] flex items-center justify-center backdrop-blur-sm">
                <ShieldCheck className="w-7 h-7 text-white" />
              </div>
            </div>

            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white">
                Plywood Tracker
              </h1>
              <p className="text-xs uppercase tracking-wider text-emerald-400 font-semibold mt-0.5">
                Software License Activation
              </p>
            </div>
          </div>

          {/* STATE-SPECIFIC NOTICE BANNERS */}
          {licenseState === "DEVICE_NOT_AUTHORIZED" && (
            <div className="p-4 mb-5 rounded-2xl bg-amber-950/30 border border-amber-800/50 text-amber-200 space-y-2 text-xs">
              <div className="flex items-center gap-2 font-semibold text-amber-300">
                <ShieldAlert className="w-4 h-4 shrink-0" />
                <span>Device Not Authorized</span>
              </div>
              <p className="text-zinc-300 leading-relaxed">
                This license is currently registered to another computer. Each installation requires an authorized device seat.
              </p>
            </div>
          )}

          {licenseState === "LICENSE_EXPIRED" && (
            <div className="p-4 mb-5 rounded-2xl bg-rose-950/30 border border-rose-800/50 text-rose-200 space-y-2 text-xs">
              <div className="flex items-center gap-2 font-semibold text-rose-300">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>License Expired</span>
              </div>
              <p className="text-zinc-300 leading-relaxed">
                Your ERP license has expired. Please contact your organization administrator or enter a renewed license key below.
              </p>
            </div>
          )}

          {licenseState === "LICENSE_REVOKED" && (
            <div className="p-4 mb-5 rounded-2xl bg-rose-950/40 border border-rose-800 text-rose-200 space-y-2 text-xs">
              <div className="flex items-center gap-2 font-semibold text-rose-300">
                <AlertCircle className="w-4 h-4 shrink-0" />
                <span>License Unavailable</span>
              </div>
              <p className="text-zinc-300 leading-relaxed">
                Your organization's ERP license is no longer active or was revoked by the system administrator.
              </p>
            </div>
          )}

          {licenseState === "LICENSE_SERVER_UNAVAILABLE" && (
            <div className="p-4 mb-5 rounded-2xl bg-zinc-800/40 border border-zinc-700 text-zinc-200 space-y-2 text-xs">
              <div className="flex items-center gap-2 font-semibold text-zinc-300">
                <RefreshCw className="w-4 h-4 shrink-0" />
                <span>License Server Unavailable</span>
              </div>
              <p className="text-zinc-400 leading-relaxed">
                Unable to reach the licensing authority. Please ensure you are connected to the internet and try again.
              </p>
              <Button 
                type="button" 
                variant="outline" 
                size="sm" 
                onClick={handleRetryValidate} 
                disabled={isSubmitting}
                className="mt-1 h-7 text-xs border-zinc-600"
              >
                {isSubmitting ? "Retrying..." : "Retry Connection"}
              </Button>
            </div>
          )}

          {/* Error Message */}
          {displayError && licenseState !== "DEVICE_NOT_AUTHORIZED" && licenseState !== "LICENSE_EXPIRED" && licenseState !== "LICENSE_REVOKED" && licenseState !== "LICENSE_SERVER_UNAVAILABLE" && (
            <div className="p-3 mb-5 rounded-xl bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs flex items-start gap-2">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{displayError}</span>
            </div>
          )}

          {/* Activation Form */}
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="space-y-1.5">
              <Label htmlFor="licenseKey" className="text-xs font-medium text-zinc-300 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Key className="w-3.5 h-3.5 text-emerald-400" />
                  License Key
                </span>
                {isMock && (
                  <span className="text-[10px] text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded-full border border-emerald-500/20">
                    Mock Dev Mode
                  </span>
                )}
              </Label>
              <Input
                id="licenseKey"
                type="text"
                placeholder="e.g. PLY-XXXX-XXXX-XXXX-XXXX"
                value={licenseKey}
                onChange={(e) => setLicenseKey(e.target.value.toUpperCase())}
                autoFocus
                required
                className="h-11 bg-zinc-950/60 border-zinc-800 focus-visible:ring-emerald-500/40 font-mono tracking-wider text-sm"
              />
              <p className="text-[11px] text-zinc-400">
                Enter the product license key issued to your company or business.
              </p>
            </div>

            <Button
              type="submit"
              disabled={isSubmitting || !licenseKey.trim()}
              className="w-full h-11 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-xl shadow-lg shadow-emerald-950 transition-all cursor-pointer flex items-center justify-center gap-2 group mt-2"
            >
              {isSubmitting ? (
                <>
                  <IosSpinner size="sm" className="text-white" />
                  <span>Activating License...</span>
                </>
              ) : (
                <>
                  <span>Activate License</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </>
              )}
            </Button>
          </form>

          {/* Hardware & Version Metadata Section */}
          <div className="mt-6 pt-5 border-t border-zinc-800/80 space-y-2 text-xs text-zinc-400">
            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Laptop className="w-3.5 h-3.5 text-zinc-500" />
                Device:
              </span>
              <span className="text-zinc-300 font-medium">This Windows PC</span>
            </div>

            <div className="flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-zinc-500" />
                Application:
              </span>
              <span className="text-zinc-300 font-medium">Plywood POS &amp; ERP</span>
            </div>

            <div className="flex items-center justify-between">
              <span>Version:</span>
              <span className="font-mono text-zinc-300">0.1.0</span>
            </div>

            {machineId && (
              <div className="flex items-center justify-between pt-1">
                <span>Device Fingerprint:</span>
                <span className="font-mono text-[10px] text-zinc-400 bg-zinc-950 px-2 py-0.5 rounded border border-zinc-800">
                  {machineId.substring(0, 16)}...
                </span>
              </div>
            )}
          </div>

          {/* Footer Assistance */}
          <div className="mt-5 text-center">
            <p className="text-[11px] text-zinc-400 flex items-center justify-center gap-1.5">
              <HelpCircle className="w-3.5 h-3.5" />
              Need help? Contact your organization administrator.
            </p>
          </div>

        </div>
      </div>
    </div>
  );
}
