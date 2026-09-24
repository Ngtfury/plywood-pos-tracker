import { BrowserRouter, Routes, Route } from "react-router-dom";
import { Layout } from "./components/layout/Layout";
import { Dashboard } from "./pages/dashboard/Dashboard";
import { Transactions } from "./pages/transactions/Transactions";
import { Entities } from "./pages/entities/Entities";
import { Categories } from "./pages/categories/Categories";
import { Analytics } from "./pages/analytics/Analytics";
import { Settings } from "./pages/settings/Settings";

function App() {
  return (
    <BrowserRouter>
      <Routes>
        <Route path="/" element={<Layout />}>
          <Route index element={<Dashboard />} />
          <Route path="transactions" element={<Transactions />} />
          <Route path="entities" element={<Entities />} />
          <Route path="categories" element={<Categories />} />
          <Route path="analytics" element={<Analytics />} />
          <Route path="settings" element={<Settings />} />
        </Route>
      </Routes>
    </BrowserRouter>
  );
}

export default App;
