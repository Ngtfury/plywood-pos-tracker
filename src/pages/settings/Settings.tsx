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
import { seedDatabase } from "@/lib/db/seed";
import { clearDb } from "@/lib/db/index";
import { getCustomFields, addCustomField, deleteCustomFields, CustomFieldDef } from "@/lib/db/queries";
import { 
  getStoredCredentials, 
  resetSupabaseClient, 
  testConnection, 
  clearStoredCredentials 
} from "@/lib/supabase";
import { useStore } from "@/store";
import { Trash2, Database, Globe, Key, CheckCircle2, XCircle, RefreshCw, RotateCcw } from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

export function Settings() {
  const [seeding, setSeeding] = useState(false);
  const [fields, setFields] = useState<CustomFieldDef[]>([]);
  const [newFieldName, setNewFieldName] = useState("");
  const [newFieldType, setNewFieldType] = useState<"text" | "number">("text");
  const [newFieldApplyTo, setNewFieldApplyTo] = useState<"IN" | "OUT" | "BOTH">("BOTH");

  // Supabase connection state
  const initialCreds = getStoredCredentials();
  const [supabaseUrl, setSupabaseUrl] = useState(initialCreds.url);
  const [supabaseKey, setSupabaseKey] = useState(initialCreds.key);
  const [testingConn, setTestingConn] = useState(false);
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
    try {
      resetSupabaseClient(supabaseUrl, supabaseKey);
      setConnStatus({ success: true, message: 'Saved and reconnected to new database successfully!' });
      triggerRefresh();
    } catch (e: any) {
      setConnStatus({ success: false, message: 'Failed to update credentials: ' + e.message });
    }
  };

  const handleResetSupabaseConfig = () => {
    clearStoredCredentials();
    const defaults = getStoredCredentials();
    setSupabaseUrl(defaults.url);
    setSupabaseKey(defaults.key);
    resetSupabaseClient(defaults.url, defaults.key);
    setConnStatus({ success: true, message: 'Reset database credentials to default .env values.' });
    triggerRefresh();
  };

  const handleSeed = async () => {
    setSeeding(true);
    try {
      await seedDatabase();
      triggerRefresh();
      alert("Database seeded successfully with production demo data!");
    } catch (e: any) {
      console.error(e);
      alert("Error seeding database: " + (e.message || e));
    } finally {
      setSeeding(false);
    }
  };

  const handleClean = async () => {
    if (!window.confirm("Are you sure you want to completely erase all tables in Supabase? This cannot be undone.")) return;
    try {
      await clearDb();
      triggerRefresh();
      alert("Database wiped clean!");
    } catch (e: any) {
      console.error(e);
      alert("Error wiping database: " + (e.message || e));
    }
  };

  const handleAddField = async () => {
    if (!newFieldName) return;
    await addCustomField({ name: newFieldName, type: newFieldType, apply_to: newFieldApplyTo });
    setNewFieldName("");
    triggerRefresh();
  };

  const handleDeleteField = async (id: string) => {
    if (!window.confirm("Delete this custom field? Existing data in transactions will be orphaned.")) return;
    await deleteCustomFields([id]);
    triggerRefresh();
  };

  return (
    <div className="space-y-6">
      <h2 className="text-3xl font-bold tracking-tight">Settings</h2>
      <p className="text-muted-foreground">Configure your Supabase database connection, custom fields, and data tools.</p>
      
      {/* 1. SUPABASE CONNECTION SETTINGS */}
      <Card>
        <CardHeader className="flex flex-row items-center justify-between">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5 text-emerald-400" />
              Supabase Production Database
            </CardTitle>
            <CardDescription>
              Connect to your live Supabase cloud database instance. Changes take effect immediately.
            </CardDescription>
          </div>
          <Button variant="outline" size="sm" onClick={handleResetSupabaseConfig} title="Reset to .env defaults">
            <RotateCcw className="h-4 w-4 mr-2" />
            Reset Defaults
          </Button>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-2">
              <Label className="flex items-center gap-1.5">
                <Globe className="h-4 w-4 text-muted-foreground" />
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
                <Key className="h-4 w-4 text-muted-foreground" />
                Publishable / Anon API Key
              </Label>
              <Input 
                type="password"
                value={supabaseKey}
                onChange={e => setSupabaseKey(e.target.value)}
                placeholder="sb_publishable_..."
              />
            </div>
          </div>

          {connStatus && (
            <div className={`p-3 rounded-lg flex items-center gap-2 text-sm ${
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

          <div className="flex gap-3 pt-2">
            <Button onClick={handleSaveSupabaseConfig} className="bg-emerald-600 hover:bg-emerald-500 text-white">
              <RefreshCw className="h-4 w-4 mr-2" />
              Save & Connect Database
            </Button>
            <Button variant="secondary" onClick={handleTestConnection} disabled={testingConn}>
              {testingConn ? "Testing..." : "Test Connection"}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 2. CUSTOM FIELDS */}
      <Card>
        <CardHeader>
          <CardTitle>Custom Transaction Fields</CardTitle>
          <CardDescription>
            Define custom fields that will appear when adding income or expense entries (e.g. "Invoice Number", "Thickness").
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
                  <SelectItem value="BOTH">Income & Expense</SelectItem>
                  <SelectItem value="IN">Income Only</SelectItem>
                  <SelectItem value="OUT">Expense Only</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleAddField} disabled={!newFieldName}>Add Field</Button>
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

      {/* 3. DATA & SEED TOOLS */}
      <Card>
        <CardHeader>
          <CardTitle>Database Management</CardTitle>
          <CardDescription>
            Populate your Supabase tables with demo transactions or clear all table data.
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4">
            <Button onClick={handleSeed} disabled={seeding}>
              {seeding ? "Seeding..." : "Seed Demo Database"}
            </Button>
            <Button onClick={handleClean} variant="destructive">
              Wipe Database Tables
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
