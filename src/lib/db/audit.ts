// =========================================================================
// PLYWOOD POS & ERP - LIGHTWEIGHT EDIT AUDIT LOGGING SERVICE
// src/lib/db/audit.ts
// =========================================================================

import { getSupabase } from "../supabase";

export interface AuditLogEntry {
  id?: string;
  entity_type: string;
  record_id: string;
  user_identifier?: string;
  action?: string;
  old_values?: Record<string, any> | null;
  new_values: Record<string, any>;
  created_at?: string;
}

// Sensitive keys that must NEVER be persisted in audit logs
const REDACTED_KEYS = new Set([
  "password",
  "token",
  "secret",
  "key",
  "client_secret",
  "anon_key",
  "service_role",
]);

function sanitizeData(data: any): any {
  if (!data || typeof data !== "object") return data;
  if (Array.isArray(data)) return data.map(sanitizeData);

  const clean: Record<string, any> = {};
  for (const [k, v] of Object.entries(data)) {
    if (REDACTED_KEYS.has(k.toLowerCase())) {
      clean[k] = "[REDACTED]";
    } else if (v && typeof v === "object") {
      clean[k] = sanitizeData(v);
    } else {
      clean[k] = v;
    }
  }
  return clean;
}

/**
 * Records an audit log entry for essential entity updates and edits.
 * Failsafe: will not throw or break business transactions if audit table is unreachable.
 */
export async function recordAuditLog(params: {
  entity_type: string;
  record_id: string;
  old_values?: Record<string, any> | null;
  new_values: Record<string, any>;
  user_identifier?: string;
  action?: string;
}): Promise<void> {
  try {
    const supabase = getSupabase();
    const cleanOld = params.old_values ? sanitizeData(params.old_values) : null;
    const cleanNew = sanitizeData(params.new_values);

    const logEntry = {
      entity_type: params.entity_type,
      record_id: params.record_id,
      user_identifier: params.user_identifier || "master_operator",
      action: params.action || "UPDATE",
      old_values: cleanOld,
      new_values: cleanNew,
      created_at: new Date().toISOString(),
    };

    const { error } = await supabase.from("edit_audit_logs").insert([logEntry]);
    if (error) {
      // Non-blocking warning: ensures master data edits succeed even if audit table is absent
      console.warn("Audit logging notice (non-blocking):", error.message);
    }
  } catch (err) {
    console.warn("Audit logging exception (non-blocking):", err);
  }
}
