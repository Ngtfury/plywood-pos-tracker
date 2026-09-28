import { useState } from "react";
import { 
  ShieldCheck, 
  RefreshCw, 
  LogOut, 
  Building2, 
  Calendar, 
  Clock, 
  Laptop, 
  Key, 
  Layers,
  WifiOff
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { IosSpinner } from "@/components/ui/IosSpinner";
import { useLicense } from "../LicenseContext";

export function LicenseSettingsSection() {
  const { 
    license, 
    isOffline, 
    lastValidatedAt, 
    remainingOfflineDays,
    validate, 
    deactivate 
  } = useLicense();

  const [verifying, setVerifying] = useState(false);
  const [deactivating, setDeactivating] = useState(false);
  const [feedback, setFeedback] = useState<{ success: boolean; message: string } | null>(null);

  if (!license) {
    return null;
  }

  const handleVerify = async () => {
    setVerifying(true);
    setFeedback(null);
    try {
      const res = await validate(true);
      if (res.message) {
        setFeedback({ success: res.success, message: res.message });
      }
    } finally {
      setVerifying(false);
    }
  };

  const handleDeactivate = async () => {
    const confirm = window.confirm(
      "Are you sure you want to deactivate this device? You will be returned to the activation screen and this computer will release its license seat."
    );
    if (!confirm) return;

    setDeactivating(true);
    setFeedback(null);
    try {
      await deactivate();
    } finally {
      setDeactivating(false);
    }
  };

  const formatDateTime = (isoString?: string | null) => {
    if (!isoString) return "Never";
    try {
      return new Date(isoString).toLocaleString();
    } catch {
      return isoString;
    }
  };

  const formatDate = (isoString?: string | null) => {
    if (!isoString) return "Never";
    try {
      return new Date(isoString).toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      });
    } catch {
      return isoString;
    }
  };

  return (
    <Card className="border-emerald-950/40 bg-zinc-950/30">
      <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <CardTitle className="flex items-center gap-2">
            <ShieldCheck className="h-5 w-5 text-emerald-400" />
            Software License &amp; Device Seat
          </CardTitle>
          <CardDescription className="mt-1">
            Current subscription details, authorized device hardware binding, and offline grace parameters.
          </CardDescription>
        </div>
        <div>
          {isOffline ? (
            <Badge variant="outline" className="border-amber-500/40 text-amber-400 bg-amber-500/10 flex items-center gap-1.5 py-1">
              <WifiOff className="w-3.5 h-3.5" />
              <span>OFFLINE GRACE ({remainingOfflineDays} days left)</span>
            </Badge>
          ) : (
            <Badge variant="outline" className="border-emerald-500/40 text-emerald-400 bg-emerald-500/10 flex items-center gap-1.5 py-1">
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
              <span>ACTIVE &amp; VERIFIED</span>
            </Badge>
          )}
        </div>
      </CardHeader>

      <CardContent className="space-y-6">
        {feedback && (
          <div className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
            feedback.success
              ? "bg-emerald-950/40 border border-emerald-800 text-emerald-300"
              : "bg-amber-950/40 border border-amber-800 text-amber-300"
          }`}>
            <span>{feedback.message}</span>
          </div>
        )}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
          
          <div className="p-3.5 rounded-xl border border-zinc-800 bg-zinc-900/40 space-y-2">
            <div className="flex items-center justify-between text-zinc-400">
              <span className="flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-zinc-500" />
                Licensed Company:
              </span>
              <span className="font-semibold text-zinc-200 text-sm">{license.company_name}</span>
            </div>

            <div className="flex items-center justify-between text-zinc-400">
              <span className="flex items-center gap-1.5">
                <Layers className="w-3.5 h-3.5 text-zinc-500" />
                Plan Tier:
              </span>
              <span className="font-medium text-emerald-400 capitalize">{license.plan}</span>
            </div>

            <div className="flex items-center justify-between text-zinc-400">
              <span className="flex items-center gap-1.5">
                <Key className="w-3.5 h-3.5 text-zinc-500" />
                License ID:
              </span>
              <span className="font-mono text-zinc-300">{license.license_id}</span>
            </div>
          </div>

          <div className="p-3.5 rounded-xl border border-zinc-800 bg-zinc-900/40 space-y-2">
            <div className="flex items-center justify-between text-zinc-400">
              <span className="flex items-center gap-1.5">
                <Laptop className="w-3.5 h-3.5 text-zinc-500" />
                Registered Device:
              </span>
              <span className="font-medium text-zinc-200">This Windows PC</span>
            </div>

            <div className="flex items-center justify-between text-zinc-400">
              <span className="flex items-center gap-1.5">
                <Calendar className="w-3.5 h-3.5 text-zinc-500" />
                Expiration Date:
              </span>
              <span className="font-medium text-zinc-200">{formatDate(license.expires_at)}</span>
            </div>

            <div className="flex items-center justify-between text-zinc-400">
              <span className="flex items-center gap-1.5">
                <Clock className="w-3.5 h-3.5 text-zinc-500" />
                Last Verified:
              </span>
              <span className="text-zinc-300">{formatDateTime(lastValidatedAt)}</span>
            </div>
          </div>

        </div>

        {/* Action Buttons */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-2 border-t border-zinc-800/80">
          <Button
            variant="secondary"
            onClick={handleVerify}
            disabled={verifying || deactivating}
            className="cursor-pointer"
          >
            {verifying ? (
              <span className="flex items-center gap-2">
                <IosSpinner size="sm" />
                <span>Verifying with server...</span>
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <RefreshCw className="h-4 w-4" />
                <span>Verify Now</span>
              </span>
            )}
          </Button>

          <Button
            variant="outline"
            onClick={handleDeactivate}
            disabled={verifying || deactivating}
            className="text-rose-400 border-rose-900/50 hover:bg-rose-950/30 cursor-pointer"
          >
            {deactivating ? (
              <span className="flex items-center gap-2">
                <IosSpinner size="sm" className="text-rose-400" />
                <span>Deactivating...</span>
              </span>
            ) : (
              <span className="flex items-center gap-2">
                <LogOut className="h-4 w-4" />
                <span>Deactivate Device</span>
              </span>
            )}
          </Button>
        </div>
      </CardContent>
    </Card>
  );
}
