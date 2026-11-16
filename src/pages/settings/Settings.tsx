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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { clearDb } from "@/lib/db/index";
import { getCustomFields, addCustomField, deleteCustomFields, updateCustomField, CustomFieldDef } from "@/lib/db/queries";
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
  AlertTriangle,
  Lock,
  Check,
  Copy,
  ExternalLink,
  ShieldCheck,
  Layers,
  Building2,
  Mail,
  Phone,
  MapPin,
  Pencil
} from "lucide-react";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { IosSpinner } from "@/components/ui/IosSpinner";
import { LicenseSettingsSection } from "@/licensing";
import { useUserAuth } from "@/auth/UserAuthContext";
import { checkSchemaHealth, applyMasterSchema, SchemaHealthResult } from "@/lib/db/schemaSync";
import { MASTER_SCHEMA_SQL } from "@/lib/db/masterSchemaSql";
import { getBusinessEntities, upsertBusinessEntity, getErpSettings, saveErpSetting } from "@/lib/db/inventory";
import { recordAuditLog } from "@/lib/db/audit";

interface SettingsProps {
  onDisconnect?: () => void;
}

export function Settings({ onDisconnect }: SettingsProps) {
  const triggerRefresh = useStore(s => s.triggerRefresh);
  const refreshTrigger = useStore(s => s.refreshTrigger);

  // Business Profile & Essential Settings state (Section 2.H)
  const [companyEntityId, setCompanyEntityId] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState("");
  const [companyAddress, setCompanyAddress] = useState("");
  const [companyPhone, setCompanyPhone] = useState("");
  const [companyEmail, setCompanyEmail] = useState("");
  const [companyGstin, setCompanyGstin] = useState("");
  const [defaultCreditPeriod, setDefaultCreditPeriod] = useState("30");
  const [defaultTerms, setDefaultTerms] = useState("Payment due within 30 days of invoice date.");
  const [currency, setCurrency] = useState("INR");
  const [loadingProfile, setLoadingProfile] = useState(true);
  const [savingProfile, setSavingProfile] = useState(false);
  const [profileFeedback, setProfileFeedback] = useState<{ success: boolean; message: string } | null>(null);

  // Custom Fields state & Edit Modal
  const [fields, setFields] = useState<CustomFieldDef[]>([]);
  const [newFieldName, setNewFieldName] = useState("");
  const [newFieldType, setNewFieldType] = useState<"text" | "number">("text");
  const [newFieldApplyTo, setNewFieldApplyTo] = useState<"IN" | "OUT" | "BOTH">("BOTH");

  const [editFieldModalOpen, setEditFieldModalOpen] = useState(false);
  const [editingField, setEditingField] = useState<CustomFieldDef | null>(null);
  const [editFieldName, setEditFieldName] = useState("");
  const [editFieldType, setEditFieldType] = useState<"text" | "number">("text");
  const [editFieldApplyTo, setEditFieldApplyTo] = useState<"IN" | "OUT" | "BOTH">("BOTH");
  const [savingField, setSavingField] = useState(false);
  const [fieldError, setFieldError] = useState<string | null>(null);

  // User Auth & Master Password state
  const { lock, changePassword } = useUserAuth();
  const [showPasswordChange, setShowPasswordChange] = useState(false);
  const [currentPass, setCurrentPass] = useState("");
  const [newPass, setNewPass] = useState("");
  const [confirmPass, setConfirmPass] = useState("");
  const [passSubmitting, setPassSubmitting] = useState(false);
  const [passFeedback, setPassFeedback] = useState<{ success: boolean; message: string } | null>(null);

  // Supabase connection state
  const initialCreds = getStoredCredentials();
  const [supabaseUrl, setSupabaseUrl] = useState(initialCreds.url);
  const [supabaseKey, setSupabaseKey] = useState(initialCreds.key);
  const [testingConn, setTestingConn] = useState(false);
  const [savingConn, setSavingConn] = useState(false);
  const [wiping, setWiping] = useState(false);
  const [connStatus, setConnStatus] = useState<{ success: boolean; message: string } | null>(null);

  // Schema health & sync state
  const [schemaHealth, setSchemaHealth] = useState<SchemaHealthResult | null>(null);
  const [checkingSchema, setCheckingSchema] = useState(false);
  const [syncingSchema, setSyncingSchema] = useState(false);
  const [syncFeedback, setSyncFeedback] = useState<{ success: boolean; message: string } | null>(null);
  const [copiedSchemaSql, setCopiedSchemaSql] = useState(false);

  const projectRef = supabaseUrl ? supabaseUrl.replace(/^https?:\/\//, '').split('.')[0] : '';
  const sqlEditorUrl = projectRef && projectRef !== 'placeholder' ? `https://supabase.com/dashboard/project/${projectRef}/sql/new` : 'https://supabase.com/dashboard';

  // Load Custom Fields and Business Profile
  useEffect(() => {
    getCustomFields().then(setFields).catch(console.error);
  }, [refreshTrigger]);

  useEffect(() => {
    setLoadingProfile(true);
    Promise.all([
      getErpSettings(),
      getBusinessEntities()
    ]).then(([settings, entities]) => {
      const primaryCompany = entities.find(e => e.entity_type === 'company') || entities[0];
      if (primaryCompany) {
        setCompanyEntityId(primaryCompany.id);
        setCompanyName(primaryCompany.name || settings.company_name || "");
        setCompanyAddress(primaryCompany.address || settings.company_address || "");
        setCompanyPhone(primaryCompany.phone || settings.company_phone || "");
        setCompanyGstin(primaryCompany.gstin || settings.company_gstin || "");
        setCurrency(settings.currency || "INR");
      } else {
        setCompanyName(settings.company_name || "");
        setCompanyAddress(settings.company_address || "");
        setCompanyPhone(settings.company_phone || "");
        setCompanyGstin(settings.company_gstin || "");
        setCurrency(settings.currency || "INR");
      }
      setCompanyEmail(settings.company_email || "");
      if (settings.default_credit_period) setDefaultCreditPeriod(settings.default_credit_period);
      if (settings.default_terms) setDefaultTerms(settings.default_terms);
    }).catch(console.error).finally(() => setLoadingProfile(false));
  }, [refreshTrigger]);

  const handleSaveBusinessProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!companyName.trim()) {
      setProfileFeedback({ success: false, message: "Business / Enterprise name is required." });
      return;
    }
    setSavingProfile(true);
    setProfileFeedback(null);
    try {
      const oldSettings = await getErpSettings();
      // 1. Save all keys in erp_settings
      await Promise.all([
        saveErpSetting("company_name", companyName.trim()),
        saveErpSetting("company_address", companyAddress.trim()),
        saveErpSetting("company_phone", companyPhone.trim()),
        saveErpSetting("company_email", companyEmail.trim()),
        saveErpSetting("company_gstin", companyGstin.trim()),
        saveErpSetting("default_credit_period", defaultCreditPeriod.trim()),
        saveErpSetting("default_terms", defaultTerms.trim()),
        saveErpSetting("currency", currency.trim() || "INR"),
      ]);

      // 2. Synchronize with business_entities table
      const companyPayload: any = {
        name: companyName.trim(),
        entity_type: 'company' as const,
        gstin: companyGstin.trim() || undefined,
        address: companyAddress.trim() || undefined,
        phone: companyPhone.trim() || undefined,
        is_active: true,
      };
      if (companyEntityId) {
        companyPayload.id = companyEntityId;
      }
      const savedEntityId = await upsertBusinessEntity(companyPayload);
      setCompanyEntityId(savedEntityId);

      // 3. Record audit log for business profile update
      await recordAuditLog({
        entity_type: 'business_profile',
        record_id: savedEntityId || 'settings',
        old_values: oldSettings,
        new_values: {
          company_name: companyName.trim(),
          company_address: companyAddress.trim(),
          company_phone: companyPhone.trim(),
          company_email: companyEmail.trim(),
          company_gstin: companyGstin.trim(),
          default_credit_period: defaultCreditPeriod.trim(),
          default_terms: defaultTerms.trim(),
          currency: currency.trim(),
        },
        action: 'UPDATE',
      });

      setProfileFeedback({ success: true, message: "Business profile and essential settings saved successfully!" });
      triggerRefresh();
    } catch (err: any) {
      setProfileFeedback({ success: false, message: err.message || "Failed to save business profile." });
    } finally {
      setSavingProfile(false);
    }
  };

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
    setSupabaseUrl("");
    setSupabaseKey("");
    if (onDisconnect) {
      onDisconnect();
    } else {
      window.location.reload();
    }
  };

  const handleCheckSchema = async () => {
    setCheckingSchema(true);
    setSyncFeedback(null);
    try {
      const res = await checkSchemaHealth();
      setSchemaHealth(res);
    } catch (e: any) {
      setSyncFeedback({ success: false, message: e.message || 'Failed to check schema health.' });
    } finally {
      setCheckingSchema(false);
    }
  };

  const handleApplyMasterSchema = async () => {
    setSyncingSchema(true);
    setSyncFeedback(null);
    try {
      const res = await applyMasterSchema();
      setSyncFeedback(res);
      const health = await checkSchemaHealth();
      setSchemaHealth(health);
      if (res.success) {
        triggerRefresh();
      }
    } catch (e: any) {
      setSyncFeedback({ success: false, message: e.message || 'Schema sync failed.' });
    } finally {
      setSyncingSchema(false);
    }
  };

  const handleCopySchemaSql = () => {
    navigator.clipboard.writeText(MASTER_SCHEMA_SQL);
    setCopiedSchemaSql(true);
    setTimeout(() => setCopiedSchemaSql(false), 2500);
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

  const handleChangePasswordSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setPassFeedback(null);

    if (newPass !== confirmPass) {
      setPassFeedback({ success: false, message: "New passwords do not match." });
      return;
    }

    if (newPass.length < 4) {
      setPassFeedback({ success: false, message: "New password must be at least 4 characters long." });
      return;
    }

    setPassSubmitting(true);
    const res = await changePassword(currentPass, newPass);
    setPassSubmitting(false);

    setPassFeedback(res);
    if (res.success) {
      setCurrentPass("");
      setNewPass("");
      setConfirmPass("");
      setTimeout(() => setShowPasswordChange(false), 2500);
    }
  };

  const handleAddField = async () => {
    if (!newFieldName.trim()) return;
    await addCustomField({ name: newFieldName.trim(), type: newFieldType, apply_to: newFieldApplyTo });
    setNewFieldName("");
    triggerRefresh();
  };

  const handleOpenEditField = (field: CustomFieldDef) => {
    setEditingField(field);
    setEditFieldName(field.name);
    setEditFieldType(field.type);
    setEditFieldApplyTo(field.apply_to);
    setFieldError(null);
    setEditFieldModalOpen(true);
  };

  const handleSaveEditField = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!editingField) return;
    if (!editFieldName.trim()) {
      setFieldError("Field name is required.");
      return;
    }
    setSavingField(true);
    setFieldError(null);
    try {
      await updateCustomField(
        editingField.id,
        {
          name: editFieldName.trim(),
          type: editFieldType,
          apply_to: editFieldApplyTo,
        },
        editingField
      );
      setEditFieldModalOpen(false);
      setEditingField(null);
      triggerRefresh();
    } catch (err: any) {
      setFieldError(err.message || "Failed to update custom field.");
    } finally {
      setSavingField(false);
    }
  };

  const handleDeleteField = async (id: string) => {
    if (!window.confirm("Delete this custom field? Existing data stored in transactions will be orphaned.")) return;
    await deleteCustomFields([id]);
    triggerRefresh();
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-3xl font-bold tracking-tight">Settings &amp; Configuration</h2>
        <p className="text-muted-foreground mt-1">
          Manage your business profile, general credit policies, Supabase database connection, schema health, and custom fields.
        </p>
      </div>

      {/* 0. BUSINESS PROFILE & ESSENTIAL SETTINGS (SECTION 2.H) */}
      <Card className="border-emerald-950/40 bg-zinc-950/30">
        <CardHeader>
          <div className="flex items-center gap-2">
            <Building2 className="h-5 w-5 text-emerald-400" />
            <CardTitle>Business Profile &amp; General Configuration</CardTitle>
          </div>
          <CardDescription>
            Master business identity used across POS receipts, GST tax invoices, credit statements, and ledger vouchers.
          </CardDescription>
        </CardHeader>
        <CardContent>
          {loadingProfile ? (
            <div className="py-8 flex justify-center items-center">
              <IosSpinner size="md" className="text-emerald-400" />
            </div>
          ) : (
            <form onSubmit={handleSaveBusinessProfile} className="space-y-4">
              {profileFeedback && (
                <div
                  className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                    profileFeedback.success
                      ? "bg-emerald-950/40 border border-emerald-800 text-emerald-300"
                      : "bg-amber-950/40 border border-amber-800 text-amber-300"
                  }`}
                >
                  {profileFeedback.success ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                  ) : (
                    <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
                  )}
                  <span>{profileFeedback.message}</span>
                </div>
              )}

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1.5 md:col-span-2">
                  <Label className="text-xs font-semibold">Business / Enterprise Legal Name *</Label>
                  <div className="relative">
                    <Building2 className="absolute left-2.5 top-2.5 h-4 w-4 text-zinc-500" />
                    <Input
                      value={companyName}
                      onChange={(e) => setCompanyName(e.target.value)}
                      placeholder="e.g. Balaji Plywood &amp; Hardware Traders"
                      required
                      className="pl-9 h-9 text-xs"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">GSTIN / Tax Registration No.</Label>
                  <Input
                    value={companyGstin}
                    onChange={(e) => setCompanyGstin(e.target.value.toUpperCase())}
                    placeholder="e.g. 24AAAAA0000A1Z5"
                    className="h-9 text-xs font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                <div className="space-y-1.5 md:col-span-2">
                  <Label className="text-xs font-semibold">Registered Business Address</Label>
                  <div className="relative">
                    <MapPin className="absolute left-2.5 top-2.5 h-4 w-4 text-zinc-500" />
                    <Input
                      value={companyAddress}
                      onChange={(e) => setCompanyAddress(e.target.value)}
                      placeholder="e.g. Plot No. 12, Timber Market, Ring Road, Ahmedabad"
                      className="pl-9 h-9 text-xs"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Operating Currency</Label>
                  <Input
                    value={currency}
                    onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                    placeholder="INR"
                    className="h-9 text-xs font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Contact Phone Number</Label>
                  <div className="relative">
                    <Phone className="absolute left-2.5 top-2.5 h-4 w-4 text-zinc-500" />
                    <Input
                      value={companyPhone}
                      onChange={(e) => setCompanyPhone(e.target.value)}
                      placeholder="e.g. +91 98765 43210"
                      className="pl-9 h-9 text-xs"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Official Email Address</Label>
                  <div className="relative">
                    <Mail className="absolute left-2.5 top-2.5 h-4 w-4 text-zinc-500" />
                    <Input
                      type="email"
                      value={companyEmail}
                      onChange={(e) => setCompanyEmail(e.target.value)}
                      placeholder="e.g. billing@plywoodtraders.com"
                      className="pl-9 h-9 text-xs"
                    />
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-1">
                <div className="space-y-1.5">
                  <Label className="text-xs font-semibold">Default Customer Credit Period (Days)</Label>
                  <Input
                    type="number"
                    min="0"
                    value={defaultCreditPeriod}
                    onChange={(e) => setDefaultCreditPeriod(e.target.value)}
                    placeholder="30"
                    className="h-9 text-xs"
                  />
                </div>

                <div className="space-y-1.5 md:col-span-2">
                  <Label className="text-xs font-semibold">Default Invoice Terms &amp; Conditions</Label>
                  <Input
                    value={defaultTerms}
                    onChange={(e) => setDefaultTerms(e.target.value)}
                    placeholder="Payment due within 30 days. Subject to Ahmedabad jurisdiction."
                    className="h-9 text-xs"
                  />
                </div>
              </div>

              <div className="flex justify-end pt-2">
                <Button
                  type="submit"
                  disabled={savingProfile || !companyName.trim()}
                  className="bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer text-xs h-9"
                >
                  {savingProfile ? (
                    <span className="flex items-center gap-2">
                      <IosSpinner size="sm" className="text-white" />
                      Saving Profile...
                    </span>
                  ) : (
                    <span className="flex items-center gap-1.5">
                      <Check className="h-4 w-4" /> Save Business Profile
                    </span>
                  )}
                </Button>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
      
      {/* 1. SOFTWARE LICENSE & DEVICE SEAT */}
      <LicenseSettingsSection />

      {/* 2. APPLICATION SECURITY & MASTER PASSWORD */}
      <Card className="border-emerald-950/40 bg-zinc-950/30">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Lock className="h-5 w-5 text-emerald-400" />
              Master Access Password &amp; Lock
            </CardTitle>
            <CardDescription className="mt-1">
              Secures your POS &amp; ERP application. The master password must be entered each time the application starts.
            </CardDescription>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={lock}
              className="text-zinc-300 hover:text-white border-zinc-700 hover:bg-zinc-800 cursor-pointer"
            >
              <Lock className="h-3.5 w-3.5 mr-1.5 text-emerald-400" />
              Lock App Now
            </Button>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setShowPasswordChange(!showPasswordChange);
                setPassFeedback(null);
              }}
              className="cursor-pointer"
            >
              {showPasswordChange ? "Cancel" : "Change Password"}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {passFeedback && (
            <div
              className={`p-3 rounded-xl text-xs flex items-center gap-2 ${
                passFeedback.success
                  ? "bg-emerald-950/40 border border-emerald-800 text-emerald-300"
                  : "bg-amber-950/40 border border-amber-800 text-amber-300"
              }`}
            >
              <span>{passFeedback.message}</span>
            </div>
          )}

          {showPasswordChange && (
            <form onSubmit={handleChangePasswordSubmit} className="p-4 rounded-xl border border-zinc-800 bg-zinc-900/50 space-y-3 text-xs max-w-lg">
              <div className="space-y-1">
                <Label className="text-xs">Current Master Password</Label>
                <Input
                  type="password"
                  value={currentPass}
                  onChange={(e) => setCurrentPass(e.target.value)}
                  placeholder="Enter current password"
                  required
                  className="h-9 text-xs"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-xs">New Password</Label>
                  <Input
                    type="password"
                    value={newPass}
                    onChange={(e) => setNewPass(e.target.value)}
                    placeholder="At least 4 chars"
                    required
                    className="h-9 text-xs"
                  />
                </div>
                <div className="space-y-1">
                  <Label className="text-xs">Confirm New Password</Label>
                  <Input
                    type="password"
                    value={confirmPass}
                    onChange={(e) => setConfirmPass(e.target.value)}
                    placeholder="Confirm new password"
                    required
                    className="h-9 text-xs"
                  />
                </div>
              </div>

              <Button
                type="submit"
                disabled={passSubmitting || !currentPass || !newPass}
                className="h-8 text-xs bg-emerald-600 hover:bg-emerald-500 text-white mt-2 cursor-pointer"
              >
                {passSubmitting ? "Updating..." : "Save New Password"}
              </Button>
            </form>
          )}

          <div className="text-xs text-zinc-400 flex items-center gap-2">
            <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse" />
            <span>Master access protection is active. Encrypted locally with salted SHA-256.</span>
          </div>
        </CardContent>
      </Card>

      {/* 3. SUPABASE CONNECTION SETTINGS */}
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

      {/* 4. DATABASE SCHEMA INTEGRITY & MASTER SYNC */}
      <Card className="border-indigo-950/40 bg-zinc-950/30">
        <CardHeader className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
          <div>
            <CardTitle className="flex items-center gap-2">
              <Layers className="h-5 w-5 text-indigo-400" />
              Database Master Schema Integrity
            </CardTitle>
            <CardDescription className="mt-1">
              Validates that your Supabase database has all 24 ERP tables, indexes, constraints, and stored procedures from <code className="text-zinc-300">supabase.sql</code>.
            </CardDescription>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCheckSchema}
              disabled={checkingSchema || syncingSchema}
              className="text-zinc-300 hover:text-white border-zinc-700 hover:bg-zinc-800 cursor-pointer"
            >
              {checkingSchema ? (
                <span className="flex items-center gap-1.5">
                  <IosSpinner size="sm" />
                  Checking Schema...
                </span>
              ) : (
                <span className="flex items-center gap-1.5">
                  <RefreshCw className="h-3.5 w-3.5 text-indigo-400" />
                  Check Schema Status
                </span>
              )}
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopySchemaSql}
              className="text-zinc-300 hover:text-white border-zinc-700 hover:bg-zinc-800 cursor-pointer"
            >
              {copiedSchemaSql ? (
                <span className="flex items-center gap-1.5 text-emerald-400">
                  <Check className="h-3.5 w-3.5" />
                  Copied supabase.sql!
                </span>
              ) : (
                <span className="flex items-center gap-1.5">
                  <Copy className="h-3.5 w-3.5 text-zinc-400" />
                  Copy supabase.sql
                </span>
              )}
            </Button>
          </div>
        </CardHeader>
        <CardContent className="space-y-4">
          {schemaHealth && (
            <div className={`p-4 rounded-xl border text-xs sm:text-sm space-y-2 ${
              schemaHealth.isFit
                ? 'bg-emerald-950/30 border-emerald-800/60 text-emerald-300'
                : 'bg-amber-950/30 border-amber-800/60 text-amber-300'
            }`}>
              <div className="flex items-center gap-2 font-medium">
                {schemaHealth.isFit ? (
                  <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
                ) : (
                  <AlertTriangle className="h-4 w-4 text-amber-400 shrink-0" />
                )}
                <span>
                  {schemaHealth.isFit 
                    ? `Schema is fully up to date (${24 - schemaHealth.missingTables.length}/24 tables verified)` 
                    : `Schema requires attention: ${schemaHealth.summary}`}
                </span>
              </div>
              {!schemaHealth.isFit && (
                <div className="space-y-1 text-xs text-amber-200/80">
                  {schemaHealth.missingTables.length > 0 && (
                    <p><span className="font-semibold text-amber-300">Missing tables:</span> {schemaHealth.missingTables.join(', ')}</p>
                  )}
                  {schemaHealth.missingColumns.length > 0 && (
                    <p><span className="font-semibold text-amber-300">Missing columns:</span> {schemaHealth.missingColumns.join(', ')}</p>
                  )}
                  {schemaHealth.missingFunctions.length > 0 && (
                    <p><span className="font-semibold text-amber-300">Missing functions:</span> {schemaHealth.missingFunctions.join(', ')}</p>
                  )}
                </div>
              )}
            </div>
          )}

          {syncFeedback && (
            <div className={`p-3 rounded-lg flex items-center gap-2 text-xs ${
              syncFeedback.success
                ? 'bg-emerald-950/40 text-emerald-300 border border-emerald-800/60'
                : 'bg-rose-950/40 text-rose-300 border border-rose-800/60'
            }`}>
              {syncFeedback.success ? (
                <CheckCircle2 className="h-4 w-4 text-emerald-400 shrink-0" />
              ) : (
                <XCircle className="h-4 w-4 text-rose-400 shrink-0" />
              )}
              <span>{syncFeedback.message}</span>
            </div>
          )}

          <div className="flex flex-wrap items-center gap-3 pt-1">
            <Button
              onClick={handleApplyMasterSchema}
              disabled={syncingSchema || checkingSchema}
              className="bg-indigo-600 hover:bg-indigo-500 text-white cursor-pointer"
            >
              {syncingSchema ? (
                <span className="flex items-center gap-2">
                  <IosSpinner size="sm" className="text-white" />
                  Applying Master Schema...
                </span>
              ) : (
                <span className="flex items-center gap-2">
                  <ShieldCheck className="h-4 w-4" />
                  Auto-Sync Master Schema (supabase.sql)
                </span>
              )}
            </Button>
            {sqlEditorUrl && (
              <a
                href={sqlEditorUrl}
                target="_blank"
                rel="noreferrer"
                className="inline-flex items-center gap-1.5 px-3 py-2 text-xs font-medium text-zinc-300 hover:text-white bg-zinc-800 hover:bg-zinc-700 rounded-md transition-colors"
              >
                <ExternalLink className="h-3.5 w-3.5 text-zinc-400" />
                Open Supabase SQL Editor
              </a>
            )}
          </div>
          <p className="text-[11px] text-zinc-400">
            Note: All statements in <code className="text-zinc-300">supabase.sql</code> are failsafe (<code className="text-zinc-300">CREATE IF NOT EXISTS</code>, <code className="text-zinc-300">ADD COLUMN IF NOT EXISTS</code>, <code className="text-zinc-300">ON CONFLICT DO NOTHING</code>) and can be executed repeatedly without data loss.
          </p>
        </CardContent>
      </Card>

      {/* 5. CUSTOM FIELDS */}
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
                  <div className="flex items-center gap-1">
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => handleOpenEditField(f)}
                      title="Edit Custom Field"
                      className="cursor-pointer hover:bg-zinc-800 text-zinc-400 hover:text-white"
                    >
                      <Pencil className="h-4 w-4" />
                    </Button>
                    <Button 
                      variant="ghost" 
                      size="icon" 
                      onClick={() => handleDeleteField(f.id)}
                      title="Delete Custom Field"
                      className="cursor-pointer hover:bg-rose-950/40 text-destructive"
                    >
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              ))
            )}
          </div>
        </CardContent>
      </Card>

      {/* Edit Custom Field Modal */}
      <Dialog open={editFieldModalOpen} onOpenChange={setEditFieldModalOpen}>
        <DialogContent className="sm:max-w-[420px]">
          <form onSubmit={handleSaveEditField}>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Pencil className="h-4 w-4 text-emerald-400" />
                Edit Custom Transaction Field
              </DialogTitle>
            </DialogHeader>

            <div className="space-y-4 py-4 text-xs">
              {fieldError && (
                <div className="p-2.5 rounded bg-rose-950/40 border border-rose-800/60 text-rose-300 text-xs">
                  {fieldError}
                </div>
              )}

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Field Name *</Label>
                <Input
                  value={editFieldName}
                  onChange={(e) => setEditFieldName(e.target.value)}
                  placeholder="e.g. Batch Number"
                  required
                  className="h-9 text-xs"
                />
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Data Type</Label>
                <Select
                  value={editFieldType}
                  onValueChange={(v: "text" | "number") => setEditFieldType(v)}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="text">Text (String)</SelectItem>
                    <SelectItem value="number">Number (Numeric)</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div className="space-y-1.5">
                <Label className="text-xs font-semibold">Apply To Workflow</Label>
                <Select
                  value={editFieldApplyTo}
                  onValueChange={(v: "IN" | "OUT" | "BOTH") => setEditFieldApplyTo(v)}
                >
                  <SelectTrigger className="h-9 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="BOTH">Both Income &amp; Expense</SelectItem>
                    <SelectItem value="IN">Income Only (Sales)</SelectItem>
                    <SelectItem value="OUT">Expense Only (Purchases)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <DialogFooter className="gap-2 sm:gap-0">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => setEditFieldModalOpen(false)}
                disabled={savingField}
                className="cursor-pointer text-xs"
              >
                Cancel
              </Button>
              <Button
                type="submit"
                size="sm"
                disabled={savingField || !editFieldName.trim()}
                className="bg-emerald-600 hover:bg-emerald-500 text-white cursor-pointer text-xs"
              >
                {savingField ? (
                  <span className="flex items-center gap-1.5">
                    <IosSpinner size="sm" className="text-white" />
                    Saving Changes...
                  </span>
                ) : (
                  "Save Changes"
                )}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* 6. DATABASE MANAGEMENT (PRODUCTION) */}
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
