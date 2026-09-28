import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { 
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { clearDb } from "@/lib/db/index";
import { getCustomFields, addCustomField, deleteCustomFields, CustomFieldDef } from "@/lib/db/queries";
import { 
  getStoredCredentials, 
  markSupabaseConfigured,
  testConnection, 
  disconnectSupabase 
} from "@/lib/supabase";
import { useStore } from "@/store";
import { 
  Trash2, 
  Database, 
  Globe, 
  Key, 
  CheckCircle2, 
  XCircle, 
  RefreshCw, 
  LogOut, 
  AlertTriangle 
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { IosSpinner } from "@/components/ui/IosSpinner";

interface SettingsProps {
  onDisconnect?: () => void;
}

export function Settings({ onDisconnect }: SettingsProps) {
  const [fields, setFields] = useState<CustomFieldDef[]>([]);
  const [newFieldName, setNewFieldName] = useState("");
  const [newFieldType, setNewFieldType] = useState<"text" | "number">("text");
  const [newFieldApplyTo, setNewFieldApplyTo] = useState<"IN" | "OUT" | "BOTH">("BOTH");

  // Supabase connection state
  const initialCreds = getStoredCredentials();
  const [supabaseUrl, setSupabaseUrl] = useState(initialCreds.url);
  const [supabaseKey, setSupabaseKey] = useState(initialCreds.key);
  const [testingConn, setTestingConn] = useState(false);
  const [savingConn, setSavingConn] = useState(false);
  const [wiping, setWiping] = useState(false);
  const [connStatus, setConnStatus] = useState<{ success: boolean; message: string } | null>(null);

  const triggerRefresh = useStore(s => s.triggerRefresh);
  const refreshTrigger = useStore(s => s.refreshTrigger);

  useEffect(() => {
    getCustomFields().then(setFields).catch(console.error);
  }, [refreshTrigger]);

  const handleTestConnection = async () => {
    setTestingConn(true);
    setConnStatus(null);
    try {
      const res = await testConnection(supabaseUrl, supabaseKey);
      setConnStatus(res);
    } catch (e: any) {
      setConnStatus({ success: false, message: e.message || 'Connection test failed.' });
    } finally {
      setTestingConn(false);
    }
  };

  const handleSaveSupabaseConfig = async () => {
    setSavingConn(true);
    try {
      const res = await testConnection(supabaseUrl, supabaseKey);
      if (!res.success) {
        setConnStatus(res);
        setSavingConn(false);
        return;
      }
      markSupabaseConfigured(supabaseUrl, supabaseKey);
      setConnStatus({ success: true, message: 'Saved and verified database connection successfully!' });
      triggerRefresh();
    } catch (e: any) {
      setConnStatus({ success: false, message: 'Failed to update credentials: ' + e.message });
    } finally {
      setSavingConn(false);
    }
  };

  const handleDisconnect = () => {
    if (!window.confirm("Are you sure you want to disconnect from this database and return to onboarding?")) {
      return;
    }
    disconnectSupabase();
    if (onDisconnect) {
      onDisconnect();
    } else {
      window.location.reload();
    }
  };

  const handleClean = async () => {
    const confirmed = window.confirm(
      "DANGER: Are you sure you want to completely wipe all tables in Supabase? All transactions, installments, entities, and custom fields will be permanently deleted."
    );
    if (!confirmed) return;

    setWiping(true);
    try {
      await clearDb(false);
      triggerRefresh();
      alert("Database wiped clean! All tables are now empty and ready for fresh production entries.");
    } catch (e: any) {
      console.error(e);
      alert("Error wiping database: " + (e.message || e));
    } finally {
      setWiping(false);
    }
  };

  const handleAddField = async () => {
    if (!newFieldName.trim()) return;
    await addCustomField({ name: newFieldName.trim(), type: newFieldType, apply_to: newFieldApplyTo });
    setNewFieldName("");
    triggerRefresh();
  };

  const handleDeleteField = async (id: string) => {
    if (!window.confirm("Delete this custom field? Existing data stored in transactions will be orphaned.")) return;
    await deleteCustomFields([id]);
    triggerRefresh();
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Settings</h2>
        <p className="text-muted-foreground mt-1">Configure your production Supabase database connection, custom fields, and database operations.</p>
      </div>
      
      {/* 1. SUPABASE CONNECTION SETTINGS */}
      <Card>
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5 text-emerald-400" />
              Supabase Production Database
            </CardTitle>
            <CardDescription className="mt-1">
              Live cloud database credentials. Modifying credentials updates sync immediately.
            </CardDescription>
          </div>
          <Button 
            variant="outline" 
            size="sm" 
            onClick={handleDisconnect} 
            title="Disconnect current database and re-run onboarding flow"
            className="text-zinc-400 hover:text-white border-zinc-700 hover:bg-zinc-800 self-start sm:self-auto cursor-pointer"
          >
            <LogOut className="h-4 w-4 mr-2 text-rose-400" />
            Disconnect &amp; Re-run Onboarding
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <Globe className="h-4 w-4 text-emerald-400" />
                Supabase Project URL
              </Label>
              <Input 
                value={supabaseUrl}
                onChange={e => setSupabaseUrl(e.target.value)}
                placeholder="https://your-project.supabase.co"
              />
            </div>
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <Key className="h-4 w-4 text-emerald-400" />
                Publishable / Anon API Key
              </Label>
              <Input 
                type="password"
                value={supabaseKey}
                onChange={e => setSupabaseKey(e.target.value)}
                placeholder="sb_publishable_... or eyJhbGci..."
              />
            </div>
          </div>

          {connStatus && (
            <div className={`p-3 rounded-lg flex items-center gap-2.5 text-xs sm:text-sm ${
              connStatus.success 
                ? 'bg-emerald-950/40 text-emerald-300 border border-emerald-800/60' 
                : 'bg-rose-950/40 text-rose-300 border border-rose-800/60'
            }`}>
              {connStatus.success ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
              ) : (
                <XCircle className="h-4 w-4 text-rose-400 shrink-0" />
              )}
              <span>{connStatus.message}</span>
            </div>
          )}

          <div className="flex flex-wrap gap-3 pt-2">
            <Button 
              onClick={handleSaveSupabaseConfig} 
              disabled={savingConn || !supabaseUrl || !supabaseKey}
              className="bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer"
            >
              {savingConn ? (
                <span className="flex items-center gap-2">
                  <IosSpinner size="sm" className="text-white" />
                  Saving &amp; Testing...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <RefreshCw className="h-4 w-4" />
                  Save &amp; Connect Database
                </span>
              )}
            </Button>
            <Button 
              variant="secondary" 
              onClick={handleTestConnection} 
              disabled={testingConn || !supabaseUrl || !supabaseKey}
              className="cursor-pointer"
            >
              {testingConn ? (
                <span className="flex items-center gap-2">
                  <IosSpinner size="sm" />
                  Testing...
                </span>
              ) : (
                "Test Connection"
              )}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 2. CUSTOM FIELDS */}
      <Card>
        <CardHeader>
          <CardTitle>Custom Transaction Fields</CardTitle>
          <CardDescription>
            Define custom fields that will appear when adding income or expense entries (e.g. "Invoice Number", "Sheet Thickness", "Vehicle No").
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-2 flex-1 min-w-[200px]">
              <Label>Field Name</Label>
              <Input 
                value={newFieldName} 
                onChange={e => setNewFieldName(e.target.value)} 
                placeholder="e.g. Plywood Grade" 
              />
            </div>
            <div className="space-y-2 w-48">
              <Label>Field Type</Label>
              <Select value={newFieldType} onValueChange={(v: "text" | "number") => setNewFieldType(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="text">Text</SelectItem>
                  <SelectItem value="number">Number</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2 w-48">
              <Label>Apply To</Label>
              <Select value={newFieldApplyTo} onValueChange={(v: "IN" | "OUT" | "BOTH") => setNewFieldApplyTo(v)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="BOTH">Income &amp; Expense</SelectItem>
                  <SelectItem value="IN">Income Only</SelectItem>
                  <SelectItem value="OUT">Expense Only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleAddField} disabled={!newFieldName.trim()}>Add Field</Button>
          </div>

          <div className="pt-4 space-y-2">
            {fields.length === 0 ? (
              <p className="text-sm text-muted-foreground">No custom fields defined yet.</p>
            ) : (
              fields.map(f => (
                <div key={f.id} className="flex items-center justify-between p-3 border rounded-md bg-zinc-900/50 border-zinc-800">
                  <div>
                    <p className="font-medium">{f.name}</p>
                    <p className="text-sm text-muted-foreground capitalize">
                      {f.type} Field • Applies to {f.apply_to === 'BOTH' ? 'Both' : (f.apply_to === 'IN' ? 'Income' : 'Expense')}
                    </p>
                  </div>
                  <Button variant="ghost" size="icon" onClick={() => handleDeleteField(f.id)}>
                    <Trash2 className="h-4 w-4 text-destructive" />
                  </Button>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* 3. DATABASE MANAGEMENT (PRODUCTION) */}
      <Card className="border-rose-950/40 bg-zinc-950/40">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-rose-400">
            <AlertTriangle className="h-5 w-5 text-rose-500" />
            Danger Zone • Database Management
          </CardTitle>
          <CardDescription>
            Permanently erase all transaction data, installment repayments, entities, and custom fields across your Supabase tables.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="p-4 rounded-xl border border-rose-900/40 bg-rose-950/20 text-xs text-rose-300 space-y-1">
            <p className="font-semibold">Cascade Wipe Safety:</p>
            <p className="text-zinc-400">
              Wiping executes safe foreign-key deletion in cascade order: <br />
              <code className="text-zinc-300">credit_payments → transactions → custom_fields → entities → categories</code>.
            </p>
          </div>

          <div className="flex gap-4">
            <Button 
              onClick={handleClean} 
              variant="destructive"
              disabled={wiping}
              className="bg-rose-600 hover:bg-rose-700 text-white cursor-pointer"
            >
              {wiping ? (
                <span className="flex items-center gap-2">
                  <IosSpinner size="sm" className="text-white" />
                  Wiping All Tables...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <Trash2 className="h-4 w-4" />
                  Wipe Database Tables
                </span>
              )}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
