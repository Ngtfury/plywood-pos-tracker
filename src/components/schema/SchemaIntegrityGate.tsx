// =========================================================================
// PLYWOOD POS & ERP - STARTUP SCHEMA INTEGRITY GATE
// src/components/schema/SchemaIntegrityGate.tsx
// Verifies and auto-updates the Supabase database schema on startup.
// =========================================================================

import React, { useEffect, useState } from "react";
import {
  Database,
  CheckCircle2,
  AlertTriangle,
  Copy,
  ExternalLink,
  RefreshCw,
  Sparkles,
  ChevronDown,
  ChevronUp,
  ShieldAlert,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { IosSpinner } from "@/components/ui/IosSpinner";
import { getStoredCredentials } from "@/lib/supabase";
import { checkSchemaHealth, applyMasterSchema, SchemaHealthResult } from "@/lib/db/schemaSync";
import { MASTER_SCHEMA_SQL } from "@/lib/db/masterSchemaSql";

interface SchemaIntegrityGateProps {
  children: React.ReactNode;
}

export function SchemaIntegrityGate({ children }: SchemaIntegrityGateProps) {
  const [checking, setChecking] = useState(true);
  const [autoMigrating, setAutoMigrating] = useState(false);
  const [health, setHealth] = useState<SchemaHealthResult | null>(null);
  const [copied, setCopied] = useState(false);
  const [showDetails, setShowDetails] = useState(false);
  const [feedback, setFeedback] = useState<{ type: "success" | "error" | "info"; text: string } | null>(null);

  const { url } = getStoredCredentials();

  // Extract Supabase project ref if available for direct deep linking
  let projectRef = "";
  try {
    if (url && url.includes(".supabase.co")) {
      const match = url.match(/https:\/\/([^.]+)\.supabase\.co/);
      if (match && match[1]) {
        projectRef = match[1];
      }
    }
  } catch {
    // fallback
  }

  const sqlEditorUrl = projectRef
    ? `https://supabase.com/dashboard/project/${projectRef}/sql/new`
    : "https://supabase.com/dashboard";

  // Initial startup verification
  useEffect(() => {
    runInitialCheck();
  }, []);

  const runInitialCheck = async () => {
    setChecking(true);
    setFeedback(null);

    try {
      const result = await checkSchemaHealth();
      setHealth(result);

      if (result.isFit) {
        setChecking(false);
        return;
      }

      // Schema is not fit -> automatically attempt running supabase.sql
      setAutoMigrating(true);
      const applyResult = await applyMasterSchema();

      if (applyResult.success) {
        const recheck = await checkSchemaHealth();
        setHealth(recheck);
        if (recheck.isFit) {
          setChecking(false);
          setAutoMigrating(false);
          return;
        }
      }

      // Automatic run could not complete (e.g. initial exec_sql RPC missing in Postgres)
      setAutoMigrating(false);
      setChecking(false);
      setFeedback({
        type: "error",
        text: applyResult.message || "Database schema is missing required ERP tables or functions.",
      });
    } catch (err: any) {
      setChecking(false);
      setAutoMigrating(false);
      setFeedback({
        type: "error",
        text: err.message || "Failed to inspect database schema.",
      });
    }
  };

  const handleManualAutoUpdate = async () => {
    setAutoMigrating(true);
    setFeedback({ type: "info", text: "Applying master schema to Supabase database..." });

    try {
      const applyResult = await applyMasterSchema();
      if (applyResult.success) {
        const recheck = await checkSchemaHealth();
        setHealth(recheck);
        if (recheck.isFit) {
          setFeedback({ type: "success", text: "Schema updated and verified successfully! Launching ERP..." });
          setTimeout(() => {
            // Unlock
            setHealth({ ...recheck, isFit: true });
          }, 800);
          return;
        }
      }

      setFeedback({
        type: "error",
        text: applyResult.message,
      });
    } catch (err: any) {
      setFeedback({ type: "error", text: err.message || "Failed to apply schema." });
    } finally {
      setAutoMigrating(false);
    }
  };

  const handleRecheck = async () => {
    setChecking(true);
    setFeedback(null);
    try {
      const recheck = await checkSchemaHealth();
      setHealth(recheck);
      if (recheck.isFit) {
        setFeedback({ type: "success", text: "Database verified! All tables and functions are ready." });
      } else {
        setFeedback({
          type: "error",
          text: `Schema remains incomplete. Missing: ${[...recheck.missingTables, ...recheck.missingColumns, ...recheck.missingFunctions].join(", ")}`,
        });
      }
    } catch (err: any) {
      setFeedback({ type: "error", text: err.message || "Verification failed." });
    } finally {
      setChecking(false);
    }
  };

  const handleCopySql = () => {
    navigator.clipboard.writeText(MASTER_SCHEMA_SQL);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  // 1. Loading state during probe or background auto-migration
  if (checking || autoMigrating) {
    return (
      <div className="min-h-screen w-full bg-zinc-950 flex flex-col items-center justify-center p-6 text-center select-none">
        <div className="relative mb-6">
          <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
            <Database className="w-8 h-8 animate-pulse" />
          </div>
          <span className="absolute -top-1 -right-1 flex h-4 w-4">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-4 w-4 bg-emerald-500" />
          </span>
        </div>
        <h2 className="text-xl font-bold tracking-tight text-white mb-2">
          {autoMigrating ? "Syncing Database Schema..." : "Verifying Supabase Schema..."}
        </h2>
        <p className="text-sm text-zinc-400 max-w-sm mb-4">
          {autoMigrating
            ? "Applying master schema and verifying enterprise accounting invariants."
            : "Checking all 24 ERP tables, atomic functions, and double-entry ledgers."}
        </p>
        <IosSpinner size="md" className="text-emerald-500" />
      </div>
    );
  }

  // 2. If schema is fit, render full application
  if (health && health.isFit) {
    return <>{children}</>;
  }

  // 3. Schema is NOT fit -> Present actionable repair screen
  const totalMissing =
    (health?.missingTables.length || 0) +
    (health?.missingColumns.length || 0) +
    (health?.missingFunctions.length || 0);

  return (
    <div className="min-h-screen w-full bg-zinc-950 text-foreground flex items-center justify-center p-4 sm:p-6 relative overflow-hidden selection:bg-amber-500/30 selection:text-amber-200">
      {/* Background ambient lighting */}
      <div className="absolute -top-40 -left-40 w-96 h-96 bg-amber-500/10 rounded-full blur-[140px] pointer-events-none" />
      <div className="absolute -bottom-40 -right-40 w-96 h-96 bg-emerald-500/10 rounded-full blur-[140px] pointer-events-none" />

      <div className="w-full max-w-xl relative z-10 animate-in fade-in zoom-in-95 duration-300">
        <div className="bg-zinc-900/80 border border-zinc-800 backdrop-blur-2xl rounded-3xl shadow-2xl p-6 sm:p-8 space-y-6">
          {/* Header */}
          <div className="text-center space-y-3">
            <div className="mx-auto w-16 h-16 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shadow-lg shadow-amber-500/10">
              <ShieldAlert className="w-8 h-8" />
            </div>
            <div>
              <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-medium mb-2">
                <AlertTriangle className="w-3.5 h-3.5" />
                Schema Update Required ({totalMissing} Items)
              </div>
              <h1 className="text-2xl sm:text-3xl font-bold tracking-tight text-white">
                Update Database Schema
              </h1>
              <p className="text-xs sm:text-sm text-zinc-400 max-w-md mx-auto mt-2 leading-relaxed">
                Your connected Supabase database is missing required ERP tables or stored procedures.
                Run the master schema to enable all manufacturing, inventory, and accounting features.
              </p>
            </div>
          </div>

          {/* Feedback banner */}
          {feedback && (
            <div
              className={`p-3.5 rounded-2xl text-xs flex items-start gap-2.5 ${
                feedback.type === "success"
                  ? "bg-emerald-950/40 border border-emerald-800/80 text-emerald-300"
                  : feedback.type === "info"
                  ? "bg-blue-950/40 border border-blue-800/80 text-blue-300"
                  : "bg-amber-950/40 border border-amber-800/80 text-amber-300"
              }`}
            >
              {feedback.type === "success" ? (
                <CheckCircle2 className="w-4 h-4 shrink-0 mt-0.5 text-emerald-400" />
              ) : (
                <AlertTriangle className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
              )}
              <span className="leading-relaxed">{feedback.text}</span>
            </div>
          )}

          {/* Action Cards */}
          <div className="space-y-3">
            {/* Action 1: Attempt auto-migration */}
            <div className="p-4 rounded-2xl bg-zinc-950/50 border border-zinc-800/80 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div>
                <p className="text-xs font-semibold text-zinc-200">Attempt In-App Migration</p>
                <p className="text-[11px] text-zinc-400">
                  Tries running the master schema directly via Supabase RPC.
                </p>
              </div>
              <Button
                size="sm"
                onClick={handleManualAutoUpdate}
                disabled={autoMigrating}
                className="bg-emerald-600 hover:bg-emerald-500 text-white font-medium text-xs px-4 h-9 rounded-xl shadow cursor-pointer shrink-0"
              >
                {autoMigrating ? <IosSpinner size="sm" className="mr-1.5" /> : <Sparkles className="w-3.5 h-3.5 mr-1.5" />}
                Run Auto-Update
              </Button>
            </div>

            {/* Action 2: 1-Click Copy and SQL Editor link */}
            <div className="p-4 rounded-2xl bg-zinc-950/50 border border-zinc-800/80 space-y-3">
              <div>
                <p className="text-xs font-semibold text-zinc-200">Run in Supabase SQL Editor</p>
                <p className="text-[11px] text-zinc-400">
                  Recommended: Copy the failsafe master schema and run it in your Supabase dashboard.
                </p>
              </div>

              <div className="flex flex-wrap gap-2">
                <Button
                  size="sm"
                  variant="outline"
                  onClick={handleCopySql}
                  className="text-xs border-zinc-700 hover:bg-zinc-800 text-zinc-200 cursor-pointer h-9 rounded-xl"
                >
                  <Copy className="w-3.5 h-3.5 mr-1.5 text-amber-400" />
                  {copied ? "Copied supabase.sql!" : "Copy supabase.sql"}
                </Button>

                <Button
                  size="sm"
                  variant="outline"
                  asChild
                  className="text-xs border-zinc-700 hover:bg-zinc-800 text-zinc-200 cursor-pointer h-9 rounded-xl"
                >
                  <a href={sqlEditorUrl} target="_blank" rel="noopener noreferrer">
                    <ExternalLink className="w-3.5 h-3.5 mr-1.5 text-emerald-400" />
                    Open Supabase SQL Editor
                  </a>
                </Button>
              </div>
            </div>
          </div>

          {/* Collapsible Missing Items Details */}
          <div className="pt-1">
            <button
              type="button"
              onClick={() => setShowDetails(!showDetails)}
              className="w-full flex items-center justify-between text-xs text-zinc-400 hover:text-zinc-200 py-1 cursor-pointer transition-colors"
            >
              <span>View Missing Tables &amp; Functions ({totalMissing})</span>
              {showDetails ? <ChevronUp className="w-4 h-4" /> : <ChevronDown className="w-4 h-4" />}
            </button>

            {showDetails && health && (
              <div className="mt-2 p-3.5 rounded-2xl bg-zinc-950/80 border border-zinc-800/80 text-[11px] space-y-2 max-h-48 overflow-y-auto font-mono text-zinc-400">
                {health.missingTables.length > 0 && (
                  <div>
                    <span className="text-amber-400 font-semibold">Missing Tables ({health.missingTables.length}):</span>
                    <p className="text-zinc-300 mt-0.5">{health.missingTables.join(", ")}</p>
                  </div>
                )}
                {health.missingColumns.length > 0 && (
                  <div>
                    <span className="text-amber-400 font-semibold">Missing Columns:</span>
                    <p className="text-zinc-300 mt-0.5">{health.missingColumns.join(", ")}</p>
                  </div>
                )}
                {health.missingFunctions.length > 0 && (
                  <div>
                    <span className="text-amber-400 font-semibold">Missing Functions:</span>
                    <p className="text-zinc-300 mt-0.5">{health.missingFunctions.join(", ")}</p>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Verification & Continue Button */}
          <div className="pt-2">
            <Button
              onClick={handleRecheck}
              disabled={checking}
              className="w-full h-11 bg-emerald-600 hover:bg-emerald-500 text-white font-semibold rounded-xl shadow-lg shadow-emerald-950 transition-all cursor-pointer flex items-center justify-center gap-2"
            >
              {checking ? (
                <>
                  <IosSpinner size="sm" className="text-white" />
                  <span>Verifying Schema...</span>
                </>
              ) : (
                <>
                  <RefreshCw className="w-4 h-4" />
                  <span>Verify Schema &amp; Continue</span>
                </>
              )}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

