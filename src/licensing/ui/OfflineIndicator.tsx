import { WifiOff, ShieldCheck } from "lucide-react";
import { useLicense } from "../LicenseContext";

export function OfflineIndicator() {
  const { isOffline, remainingOfflineDays } = useLicense();

  if (!isOffline) {
    return null;
  }

  return (
    <div className="bg-amber-500/10 border-b border-amber-500/20 text-amber-300 px-4 py-2 text-xs flex items-center justify-between backdrop-blur-sm z-30">
      <div className="flex items-center gap-2">
        <WifiOff className="w-3.5 h-3.5 text-amber-400 shrink-0" />
        <span>
          <strong>Offline Mode</strong> — License verified locally. Operating under authorized offline grace period.
        </span>
      </div>
      <div className="flex items-center gap-2 text-[11px] text-amber-400 font-medium">
        <ShieldCheck className="w-3.5 h-3.5" />
        <span>{remainingOfflineDays} day{remainingOfflineDays === 1 ? "" : "s"} grace remaining</span>
      </div>
    </div>
  );
}
