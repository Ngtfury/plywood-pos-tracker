import { useState } from "react";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Layout } from "./components/layout/Layout";
import { Dashboard } from "./pages/dashboard/Dashboard";
import { Transactions } from "./pages/transactions/Transactions";
import { Credits } from "./pages/credits/Credits";
import { Entities } from "./pages/entities/Entities";
import { Categories } from "./pages/categories/Categories";
import { Analytics } from "./pages/analytics/Analytics";
import { Settings } from "./pages/settings/Settings";
import { Onboarding } from "./components/Onboarding";
import { isSupabaseConfigured } from "./lib/supabase";
import { LicenseProvider, ApplicationGate } from "./licensing";
import { UserAuthProvider, useUserAuth } from "./auth/UserAuthContext";
import { AuthGate } from "./components/auth/AuthGate";
import { SchemaIntegrityGate } from "./components/schema/SchemaIntegrityGate";
import { useStore } from "./store";

// ERP Module Pages
import { BusinessEntities } from "./pages/business-entities/BusinessEntities";
import { Inventory } from "./pages/inventory/Inventory";
import { Products } from "./pages/inventory/Products";
import { Production } from "./pages/production/Production";
import { SalesVoucher } from "./pages/vouchers/SalesVoucher";
import { PurchaseVoucher } from "./pages/vouchers/PurchaseVoucher";
import { ReceiptVoucher } from "./pages/vouchers/ReceiptVoucher";
import { PaymentVoucher } from "./pages/vouchers/PaymentVoucher";
import { ExpenseVoucher } from "./pages/vouchers/ExpenseVoucher";
import { Salary } from "./pages/salary/Salary";
import { Journal } from "./pages/journal/Journal";
import { Banking } from "./pages/banking/Banking";
import { Reports } from "./pages/reports/Reports";
import { Masters } from "./pages/masters/Masters";

/**
 * Existing ERP Application Shell with User Password Authentication.
 */
function ERPApplication() {
  const [configured, setConfigured] = useState(() => isSupabaseConfigured());
  const { isAuthenticated } = useUserAuth();

  // 1. Supabase database onboarding (if not yet configured)
  if (!configured) {
    return (
      <Onboarding
        onComplete={() => {
          setConfigured(true);
          useStore.getState().triggerRefresh();
        }}
      />
    );
  }

  // 2. User Authentication Gate (Password required on each app launch)
  if (!isAuthenticated) {
    return <AuthGate />;
  }

  // 3. Schema Integrity Gate (Verified on startup right after master password unlock)
  return (
    <SchemaIntegrityGate>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Layout />}>
            {/* ── Existing Routes (PRESERVED) ── */}
            <Route index element={<Dashboard />} />
            <Route path="transactions" element={<Transactions />} />
            <Route path="credits" element={<Credits />} />
            <Route path="entities" element={<Entities />} />
            <Route path="categories" element={<Categories />} />
            <Route path="analytics" element={<Analytics />} />
            <Route path="settings" element={<Settings onDisconnect={() => setConfigured(false)} />} />

            {/* ── ERP Module Routes ── */}
            <Route path="business-entities" element={<BusinessEntities />} />
            <Route path="inventory" element={<Inventory />} />
            <Route path="inventory/products" element={<Products />} />
            <Route path="production" element={<Production />} />
            <Route path="vouchers/sales" element={<SalesVoucher />} />
            <Route path="vouchers/purchase" element={<PurchaseVoucher />} />
            <Route path="vouchers/receipt" element={<ReceiptVoucher />} />
            <Route path="vouchers/payment" element={<PaymentVoucher />} />
            <Route path="vouchers/expense" element={<ExpenseVoucher />} />
            <Route path="salary" element={<Salary />} />
            <Route path="journal" element={<Journal />} />
            <Route path="banking" element={<Banking />} />
            <Route path="reports" element={<Reports />} />
            <Route path="masters" element={<Masters />} />
          </Route>
        </Routes>
      </BrowserRouter>
    </SchemaIntegrityGate>
  );
}

/**
 * Main Application Root with Licensing & User Authentication Gates.
 */
function App() {
  return (
    <LicenseProvider>
      <ApplicationGate>
        <UserAuthProvider>
          <ERPApplication />
        </UserAuthProvider>
      </ApplicationGate>
    </LicenseProvider>
  );
}

export default App;
