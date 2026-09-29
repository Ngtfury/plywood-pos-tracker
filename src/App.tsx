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
import { useStore } from "./store";

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

  // 3. Authenticated ERP Routes
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="transactions" element={<Transactions />} />
          <Route path="credits" element={<Credits />} />
          <Route path="entities" element={<Entities />} />
          <Route path="categories" element={<Categories />} />
          <Route path="analytics" element={<Analytics />} />
          <Route path="settings" element={<Settings onDisconnect={() => setConfigured(false)} />} />
        </Route>
      </Routes>
    </BrowserRouter>
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

