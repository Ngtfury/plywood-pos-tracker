import React, { useState } from "react";
import { 
  Lock, 
  Unlock, 
  Key, 
  Eye, 
  EyeOff, 
  ShieldCheck, 
  AlertCircle, 
  ArrowRight,
  ShieldAlert
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { IosSpinner } from "@/components/ui/IosSpinner";
import { useUserAuth } from "@/auth/UserAuthContext";

export function AuthGate() {
  const { hasPassword, login, setupPassword } = useUserAuth();

  // Login form state
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  
  // Setup form state
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showNewPassword, setShowNewPassword] = useState(false);

  const [isLoading, setIsLoading] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [shake, setShake] = useState(false);

  const triggerShake = () => {
    setShake(true);
    setTimeout(() => setShake(false), 500);
  };

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!password.trim() || isLoading) return;

    setIsLoading(true);
    setErrorMsg(null);

    const res = await login(password.trim());
    setIsLoading(false);

    if (!res.success) {
      setErrorMsg(res.message || "Incorrect password.");
      triggerShake();
    }
  };

  const handleSetupSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMsg(null);

    if (!newPassword || newPassword.length < 4) {
      setErrorMsg("Password must be at least 4 characters long.");
      triggerShake();
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMsg("Passwords do not match. Please verify and re-type.");
      triggerShake();
      return;
    }

    setIsLoading(true);
    const res = await setupPassword(newPassword);
    setIsLoading(false);

    if (!res.success) {
      setErrorMsg(res.message || "Failed to set master password.");
      triggerShake();
    }
  };

  return (
    <div className="min-h-screen w-full bg-zinc-950 text-foreground flex items-center justify-center p-4 sm:p-6 relative overflow-hidden selection:bg-emerald-500/30 selection:text-emerald-200">
      
      {/* Ambient Radial Background Glows */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-emerald-500/10 rounded-full blur-[130px] pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-teal-500/10 rounded-full blur-[140px] pointer-events-none" />

      <div 
        className={`w-full max-w-md relative z-10 animate-in fade-in zoom-in-95 duration-200 ${
          shake ? "animate-shake" : ""
        }`}
      >
        <div className="bg-zinc-900/80 border border-zinc-800/80 backdrop-blur-2xl rounded-3xl shadow-2xl p-7 sm:p-9 relative overflow-hidden">
          
          {/* Subtle Top Inner Highlight */}
          <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-emerald-500/40 to-transparent" />

          {/* Header & Icon */}
          <div className="text-center space-y-3 mb-6">
            <div className="mx-auto w-14 h-14 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 p-0.5 shadow-lg shadow-emerald-500/20 flex items-center justify-center">
              <div className="w-full h-full bg-zinc-950/40 rounded-[14px] flex items-center justify-center backdrop-blur-sm">
                {hasPassword ? (
                  <Lock className="w-7 h-7 text-white" />
                ) : (
                  <ShieldAlert className="w-7 h-7 text-white" />
                )}
              </div>
            </div>

            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white">
                {hasPassword ? "Application Locked" : "Create Master Password"}
              </h1>
              <p className="text-xs text-zinc-400 mt-1 max-w-xs mx-auto leading-relaxed">
                {hasPassword
                  ? "Enter your master access password to open Plywood POS."
                  : "Secure your ERP installation. This password will be required each time you start the app."}
              </p>
            </div>
          </div>

          {/* Error Message */}
          {errorMsg && (
            <div className="p-3 mb-5 rounded-xl bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs flex items-start gap-2.5 animate-in fade-in duration-150">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* LOGIN FORM (When password already exists) */}
          {hasPassword ? (
            <form onSubmit={handleLoginSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="masterPassword" className="text-xs font-medium text-zinc-300 flex items-center gap-1.5">
                  <Key className="w-3.5 h-3.5 text-emerald-400" />
                  Master Password
                </Label>
                <div className="relative">
                  <Input
                    id="masterPassword"
                    type={showPassword ? "text" : "password"}
                    placeholder="Enter your master password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    autoFocus
                    required
                    className="h-11 bg-zinc-950/60 border-zinc-800 focus-visible:ring-emerald-500/40 pr-10 text-sm tracking-wide"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors p-1"
                    title={showPassword ? "Hide password" : "Show password"}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <Button
                type="submit"
                disabled={isLoading || !password.trim()}
                className="w-full h-11 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-xl shadow-lg shadow-emerald-950 transition-all cursor-pointer flex items-center justify-center gap-2 group mt-2"
              >
                {isLoading ? (
                  <>
                    <IosSpinner size="sm" className="text-white" />
                    <span>Verifying...</span>
                  </>
                ) : (
                  <>
                    <Unlock className="w-4 h-4" />
                    <span>Unlock Application</span>
                  </>
                )}
              </Button>
            </form>
          ) : (
            /* INITIAL SETUP FORM (First time setup after database onboarding) */
            <form onSubmit={handleSetupSubmit} className="space-y-4">
              <div className="space-y-1.5">
                <Label htmlFor="newPassword" className="text-xs font-medium text-zinc-300 flex items-center gap-1.5">
                  <Key className="w-3.5 h-3.5 text-emerald-400" />
                  Create Master Password
                </Label>
                <div className="relative">
                  <Input
                    id="newPassword"
                    type={showNewPassword ? "text" : "password"}
                    placeholder="At least 4 characters"
                    value={newPassword}
                    onChange={(e) => setNewPassword(e.target.value)}
                    autoFocus
                    required
                    className="h-11 bg-zinc-950/60 border-zinc-800 focus-visible:ring-emerald-500/40 pr-10 text-sm"
                  />
                  <button
                    type="button"
                    onClick={() => setShowNewPassword(!showNewPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 hover:text-zinc-300 transition-colors p-1"
                  >
                    {showNewPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              <div className="space-y-1.5">
                <Label htmlFor="confirmPassword" className="text-xs font-medium text-zinc-300 flex items-center gap-1.5">
                  <ShieldCheck className="w-3.5 h-3.5 text-emerald-400" />
                  Confirm Master Password
                </Label>
                <Input
                  id="confirmPassword"
                  type={showNewPassword ? "text" : "password"}
                  placeholder="Re-type your password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                  className="h-11 bg-zinc-950/60 border-zinc-800 focus-visible:ring-emerald-500/40 text-sm"
                />
              </div>

              <Button
                type="submit"
                disabled={isLoading || !newPassword.trim() || !confirmPassword.trim()}
                className="w-full h-11 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-xl shadow-lg shadow-emerald-950 transition-all cursor-pointer flex items-center justify-center gap-2 group mt-2"
              >
                {isLoading ? (
                  <>
                    <IosSpinner size="sm" className="text-white" />
                    <span>Saving Security Key...</span>
                  </>
                ) : (
                  <>
                    <span>Set Password &amp; Open ERP</span>
                    <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                  </>
                )}
              </Button>
            </form>
          )}

          {/* Footer Security Badge */}
          <div className="mt-6 pt-4 border-t border-zinc-800/80 text-center">
            <p className="text-[11px] text-zinc-500 flex items-center justify-center gap-1.5">
              <ShieldCheck className="w-3.5 h-3.5 text-emerald-500/70" />
              <span>Protected by Salted SHA-256 Local Cryptography</span>
            </p>
          </div>

        </div>
      </div>
    </div>
  );
}
