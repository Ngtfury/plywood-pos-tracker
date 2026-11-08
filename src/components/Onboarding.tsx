import { useState } from "react";
import { 
  Database, 
  Globe, 
  Key, 
  ArrowRight, 
  CheckCircle2, 
  Copy, 
  Check, 
  ChevronDown, 
  ChevronUp, 
  Sparkles, 
  ShieldCheck, 
  TrendingUp, 
  CreditCard,
  ExternalLink,
  RefreshCw
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { IosSpinner } from "@/components/ui/IosSpinner";
import { testConnection, markSupabaseConfigured } from "@/lib/supabase";
import { MASTER_SCHEMA_SQL } from "@/lib/db/masterSchemaSql";

interface OnboardingProps {
  onComplete: () => void;
}

const PRODUCTION_SQL_SCHEMA = MASTER_SCHEMA_SQL;

export function Onboarding({ onComplete }: OnboardingProps) {
  const [step, setStep] = useState<1 | 2 | 3>(1);
  // Always start with empty credentials so user explicitly enters their own Supabase database
  const [url, setUrl] = useState("");
  const [key, setKey] = useState("");
  const [testing, setTesting] = useState(false);
  const [status, setStatus] = useState<{ success: boolean; message: string; tablesExist?: boolean } | null>(null);
  const [copiedSql, setCopiedSql] = useState(false);
  const [showSqlGuide, setShowSqlGuide] = useState(false);

  const handleCopySql = () => {
    navigator.clipboard.writeText(PRODUCTION_SQL_SCHEMA);
    setCopiedSql(true);
    setTimeout(() => setCopiedSql(false), 2500);
  };

  const handleTestAndSave = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!url || !key) return;

    setTesting(true);
    setStatus(null);
    try {
      const res = await testConnection(url.trim(), key.trim());
      setStatus(res);
      if (res.success) {
        // Save and mark configured
        markSupabaseConfigured(url.trim(), key.trim());
        // Proceed to celebration step
        setTimeout(() => {
          setStep(3);
        }, 600);
      }
    } catch (err: any) {
      setStatus({ success: false, message: err.message || "Failed to connect to Supabase." });
    } finally {
      setTesting(false);
    }
  };

  return (
    <div className="min-h-screen w-full bg-zinc-950 text-foreground flex items-center justify-center p-4 sm:p-6 relative overflow-hidden selection:bg-emerald-500/30 selection:text-emerald-200">
      
      {/* Dynamic Ambient Background Glows */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-emerald-500/10 rounded-full blur-[120px] pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-teal-500/10 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[600px] bg-emerald-950/20 rounded-full blur-[160px] pointer-events-none" />

      {/* Main Glassmorphic Card with Smooth Apple Transition */}
      <div className="w-full max-w-xl relative z-10 transition-all duration-300">
        
        {/* Step Indicator Header */}
        <div className="flex items-center justify-center gap-2 mb-6">
          <div className={`h-1.5 rounded-full transition-all duration-300 ${step === 1 ? 'w-8 bg-emerald-500' : 'w-2 bg-zinc-800'}`} />
          <div className={`h-1.5 rounded-full transition-all duration-300 ${step === 2 ? 'w-8 bg-emerald-500' : 'w-2 bg-zinc-800'}`} />
          <div className={`h-1.5 rounded-full transition-all duration-300 ${step === 3 ? 'w-8 bg-emerald-500' : 'w-2 bg-zinc-800'}`} />
        </div>

        <div className="bg-zinc-900/70 border border-zinc-800/80 backdrop-blur-2xl rounded-3xl shadow-2xl p-6 sm:p-9 relative overflow-hidden transition-all duration-300">
          
          {/* Subtle Top Inner Highlight */}
          <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-emerald-500/30 to-transparent" />

          {/* ========================================================= */}
          {/* STEP 1: WELCOME & OVERVIEW                                */}
          {/* ========================================================= */}
          {step === 1 && (
            <div className="space-y-6 text-center animate-in fade-in zoom-in-95 duration-300">
              {/* App Emblem */}
              <div className="mx-auto w-16 h-16 rounded-2xl bg-gradient-to-tr from-emerald-600 to-teal-500 p-0.5 shadow-lg shadow-emerald-500/20 flex items-center justify-center">
                <div className="w-full h-full bg-zinc-950/40 rounded-[14px] flex items-center justify-center backdrop-blur-sm">
                  <Database className="w-8 h-8 text-white" />
                </div>
              </div>

              <div>
                <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs font-medium mb-3">
                  <Sparkles className="w-3.5 h-3.5" />
                  Production Ready Setup
                </div>
                <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
                  Plywood POS Tracker
                </h1>
                <p className="text-sm text-zinc-400 max-w-md mx-auto mt-2 leading-relaxed">
                  Enterprise-grade Point of Sale, Credit & Ledger Management engineered specifically for Plywood, Timber, and Building Material businesses.
                </p>
              </div>

              {/* Feature Highlights Grid */}
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-left pt-2">
                <div className="p-3.5 rounded-2xl bg-zinc-900/60 border border-zinc-800/60 space-y-1.5">
                  <div className="w-7 h-7 rounded-lg bg-emerald-500/10 flex items-center justify-center text-emerald-400">
                    <Database className="w-4 h-4" />
                  </div>
                  <p className="text-xs font-semibold text-zinc-200">Cloud Sync</p>
                  <p className="text-[11px] text-zinc-400 leading-tight">Live synchronization via Supabase PostgreSQL</p>
                </div>

                <div className="p-3.5 rounded-2xl bg-zinc-900/60 border border-zinc-800/60 space-y-1.5">
                  <div className="w-7 h-7 rounded-lg bg-teal-500/10 flex items-center justify-center text-teal-400">
                    <CreditCard className="w-4 h-4" />
                  </div>
                  <p className="text-xs font-semibold text-zinc-200">Dual Ledgers</p>
                  <p className="text-[11px] text-zinc-400 leading-tight">Separate To-Get (Customers) & To-Give (Suppliers)</p>
                </div>

                <div className="p-3.5 rounded-2xl bg-zinc-900/60 border border-zinc-800/60 space-y-1.5">
                  <div className="w-7 h-7 rounded-lg bg-blue-500/10 flex items-center justify-center text-blue-400">
                    <TrendingUp className="w-4 h-4" />
                  </div>
                  <p className="text-xs font-semibold text-zinc-200">Real Profit</p>
                  <p className="text-[11px] text-zinc-400 leading-tight">Distinguished cash profit and credit balances</p>
                </div>
              </div>

              <div className="pt-4">
                <Button 
                  onClick={() => setStep(2)}
                  className="w-full h-11 bg-emerald-600 hover:bg-emerald-500 text-white font-medium rounded-xl shadow-lg shadow-emerald-950 transition-all cursor-pointer flex items-center justify-center gap-2 group"
                >
                  <span>Connect Your Database</span>
                  <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
                </Button>
              </div>
            </div>
          )}

          {/* ========================================================= */}
          {/* STEP 2: SUPABASE CREDENTIALS SETUP                        */}
          {/* ========================================================= */}
          {step === 2 && (
            <form onSubmit={handleTestAndSave} className="space-y-5 animate-in fade-in zoom-in-95 duration-300">
              <div>
                <span className="text-xs font-semibold uppercase tracking-wider text-emerald-400">Step 2 of 2</span>
                <h2 className="text-xl sm:text-2xl font-bold tracking-tight text-white mt-1">
                  Connect Supabase Database
                </h2>
                <p className="text-xs sm:text-sm text-zinc-400 mt-1">
                  Enter your Supabase project credentials. They are stored securely in your local environment.
                </p>
              </div>

              {/* Form Inputs */}
              <div className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="supabaseUrl" className="text-xs font-medium text-zinc-300 flex items-center gap-1.5">
                    <Globe className="w-3.5 h-3.5 text-emerald-400" />
                    Supabase Project URL
                  </Label>
                  <Input
                    id="supabaseUrl"
                    type="url"
                    value={url}
                    onChange={(e) => setUrl(e.target.value)}
                    placeholder="https://your-project-ref.supabase.co"
                    required
                    autoFocus
                    className="h-10 bg-zinc-950/60 border-zinc-800 focus-visible:ring-emerald-500/40 text-sm"
                  />
                  <p className="text-[11px] text-zinc-500">
                    Find this in Supabase Dashboard &gt; Project Settings &gt; API
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="supabaseKey" className="text-xs font-medium text-zinc-300 flex items-center gap-1.5">
                    <Key className="w-3.5 h-3.5 text-emerald-400" />
                    Publishable / Anon API Key
                  </Label>
                  <Input
                    id="supabaseKey"
                    type="password"
                    value={key}
                    onChange={(e) => setKey(e.target.value)}
                    placeholder="sb_publishable_... or eyJhbGciOi..."
                    required
                    className="h-10 bg-zinc-950/60 border-zinc-800 focus-visible:ring-emerald-500/40 text-sm"
                  />
                  <p className="text-[11px] text-zinc-500">
                    The public 'anon' / publishable client key
                  </p>
                </div>
              </div>

              {/* Collapsible SQL Schema Guide */}
              <div className="rounded-xl border border-zinc-800/80 bg-zinc-950/40 overflow-hidden text-xs">
                <button
                  type="button"
                  onClick={() => setShowSqlGuide(!showSqlGuide)}
                  className="w-full p-3 flex items-center justify-between text-zinc-300 hover:text-white transition-colors cursor-pointer text-left"
                >
                  <span className="flex items-center gap-1.5 font-medium">
                    <ShieldCheck className="w-4 h-4 text-emerald-400" />
                    First time setup? Copy Production SQL Schema
                  </span>
                  {showSqlGuide ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
                </button>

                {showSqlGuide && (
                  <div className="p-3 pt-0 border-t border-zinc-800/60 space-y-3">
                    <p className="text-zinc-400 text-[11px] leading-relaxed">
                      1. Open your Supabase Dashboard &gt; <strong>SQL Editor</strong>.<br />
                      2. Paste the SQL script below and click <strong>Run</strong>.<br />
                      3. Return here and click <strong>Test & Connect Database</strong>.
                    </p>
                    <div className="flex items-center gap-2">
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        onClick={handleCopySql}
                        className="text-xs h-8 bg-zinc-800 hover:bg-zinc-700 text-zinc-200 cursor-pointer"
                      >
                        {copiedSql ? (
                          <>
                            <Check className="w-3.5 h-3.5 mr-1 text-emerald-400" />
                            Copied to Clipboard!
                          </>
                        ) : (
                          <>
                            <Copy className="w-3.5 h-3.5 mr-1" />
                            Copy SQL Schema (1-Click)
                          </>
                        )}
                      </Button>
                      <a 
                        href="https://supabase.com/dashboard" 
                        target="_blank" 
                        rel="noreferrer" 
                        className="inline-flex items-center text-xs text-emerald-400 hover:text-emerald-300 underline underline-offset-2 ml-auto"
                      >
                        Open Supabase <ExternalLink className="w-3 h-3 ml-1" />
                      </a>
                    </div>
                  </div>
                )}
              </div>

              {/* Status Message */}
              {status && (
                <div className={`p-3 rounded-xl flex items-start gap-2.5 text-xs ${
                  status.success 
                    ? 'bg-emerald-950/40 text-emerald-300 border border-emerald-800/60' 
                    : 'bg-rose-950/40 text-rose-300 border border-rose-800/60'
                }`}>
                  {status.success ? (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                  ) : (
                    <RefreshCw className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
                  )}
                  <div className="space-y-0.5">
                    <p className="font-semibold">{status.success ? "Connection Verified" : "Connection Failed"}</p>
                    <p className="text-zinc-300">{status.message}</p>
                  </div>
                </div>
              )}

              {/* Action Buttons */}
              <div className="flex items-center justify-between pt-2 gap-3">
                <Button 
                  type="button" 
                  variant="ghost" 
                  size="sm"
                  onClick={() => setStep(1)} 
                  className="text-zinc-400 hover:text-white"
                >
                  Back
                </Button>
                <Button 
                  type="submit" 
                  disabled={testing || !url || !key}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium px-5 h-10 rounded-xl shadow-lg shadow-emerald-950 transition-all cursor-pointer flex items-center gap-2"
                >
                  {testing ? (
                    <>
                      <IosSpinner size="sm" className="text-white" />
                      <span>Verifying...</span>
                    </>
                  ) : (
                    <>
                      <span>Test & Connect Database</span>
                      <ArrowRight className="w-4 h-4" />
                    </>
                  )}
                </Button>
              </div>
            </form>
          )}

          {/* ========================================================= */}
          {/* STEP 3: CELEBRATION & READY                               */}
          {/* ========================================================= */}
          {step === 3 && (
            <div className="space-y-6 text-center animate-in fade-in zoom-in-95 duration-300 py-2">
              <div className="mx-auto w-16 h-16 rounded-full bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-400 shadow-xl shadow-emerald-500/10 animate-bounce">
                <Check className="w-8 h-8 stroke-[3]" />
              </div>

              <div className="space-y-1.5">
                <h2 className="text-2xl font-bold tracking-tight text-white">
                  Database Connected!
                </h2>
                <p className="text-xs sm:text-sm text-zinc-400 max-w-sm mx-auto">
                  Your Plywood POS Tracker is now securely connected to Supabase and ready for production operations.
                </p>
              </div>

              <div className="p-3.5 rounded-2xl bg-zinc-950/60 border border-zinc-800 text-xs text-left space-y-1.5">
                <div className="flex items-center justify-between text-zinc-400">
                  <span>Project Host:</span>
                  <span className="font-mono text-zinc-200 truncate max-w-[240px]">
                    {url.replace("https://", "")}
                  </span>
                </div>
                <div className="flex items-center justify-between text-zinc-400">
                  <span>Cloud Sync:</span>
                  <span className="text-emerald-400 font-semibold flex items-center gap-1">
                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-ping" />
                    Live & Healthy
                  </span>
                </div>
              </div>

              <Button
                onClick={() => {
                  markSupabaseConfigured(url.trim(), key.trim());
                  onComplete();
                }}
                className="w-full h-11 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl shadow-lg shadow-emerald-950 transition-all cursor-pointer flex items-center justify-center gap-2 group"
              >
                <span>Launch Dashboard</span>
                <ArrowRight className="w-4 h-4 group-hover:translate-x-0.5 transition-transform" />
              </Button>
            </div>
          )}

        </div>
      </div>
    </div>
  );
}
