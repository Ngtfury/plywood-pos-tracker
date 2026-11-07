# Plywood POS & Credit Tracker (Tauri + React + Rust)

Enterprise Point of Sale, Credit & Ledger Management software engineered for Plywood, Timber, and Building Material businesses. Built with Tauri v2, React 19, TypeScript, and Supabase.

---

## Software Licensing & Device Activation Architecture

The application includes a production-ready software licensing and hardware-bound activation gate:

```
Tauri Startup
      ↓
License Manager
      ↓
Check Local Signed License (AppData / OS-Backed Storage)
      ↓
Verify Cryptographic Signature (Ed25519)
      ↓
Check Machine ID Binding (SHA-256 Windows MachineGuid + Hardware UUID)
      ↓
Check Hard Expiration Date
      ↓
Check Offline Grace Period (offline_until)
      ↓
[Valid] ───────────────► Launch ERP Application (Onboarding / Main POS)
[Invalid / Unlicensed] ─► Show Activation Screen
```

### Key Security & Architectural Features

1. **Hardware-Bound Machine ID**:
   - Uses Windows Registry `MachineGuid` and BIOS UUID combined with an application salt, hashed with SHA-256.
   - Prevents copied applications or copied license files from running on unauthorized machines.
   - Raw hardware identifiers are never exposed or transmitted.
2. **Asymmetric Cryptography (Ed25519)**:
   - The application contains **ONLY the Public Verification Key** (`45c783323732ccea635bea4bd23dfa1f57a0ad6592945c450e1383df9807dbb0`).
   - The private signing key resides strictly on the separate licensing backend server.
3. **Secure OS Storage**:
   - The signed license token is stored in the OS application data directory (`%APPDATA%/com.plywood.software/license.lic`).
   - Not dependent solely on browser `localStorage`.
4. **Resilient Offline Grace Period**:
   - If the business terminal loses internet connectivity, the application remains fully functional until the `offline_until` date (e.g. 14–30 days).
   - Server outages (HTTP 500, DNS errors, timeouts) do not lock the ERP if within the grace period.
5. **Separation of Concerns**:
   - The licensing layer is completely decoupled from ERP business workflows.
   - Feature flags (`hasFeature("inventory")`, `hasFeature("accounting")`) are available for tiered subscription plans.

---

## Environment Configuration

Configure the licensing parameters in `.env`:

```bash
# Licensing Backend API URL
VITE_LICENSE_API_URL=https://licensing.plywood-erp.com

# Enable mock licensing ONLY during local frontend development
# (Strictly ignored in production builds)
VITE_LICENSE_MOCK=false
```

---

## Development Mock Mode

For local development without an active licensing backend server:

1. Set `VITE_LICENSE_MOCK=true` in `.env`.
2. Start the development server (`npm run dev`).
3. Enter any test license key (e.g. `PLY-TEST-KEY-2026`) in the Activation Screen.
4. The development mock generates a mathematically valid Ed25519 signature signed by the development test key, enabling full local testing of the ERP.
5. **Production Safety**: Mock mode is strictly prohibited and deactivated automatically in production builds (`import.meta.env.PROD`).

---

## Testing

Run the automated 11-scenario licensing test suite:

```bash
npm run test:licensing
```

This verifies:
- Unlicensed device gating (`ACTIVATION_REQUIRED`)
- Valid signed license launch (`LICENSE_ACTIVE`)
- Tampered signature rejection (`LICENSE_INVALID`)
- Machine ID mismatch protection (`DEVICE_NOT_AUTHORIZED`)
- Expired license handling (`LICENSE_EXPIRED`)
- Valid offline grace operation (`LICENSE_OFFLINE`)
- Offline grace expiration (`LICENSE_EXPIRED`)
- Server outage tolerance (`LICENSE_OFFLINE` with active grace)
- Administrative revocation handling (`LICENSE_REVOKED`)
- Device deactivation and cleanup
- Production mock mode protection

---

## Backend API Specification

See [docs/licensing-api.md](docs/licensing-api.md) for the complete REST contract, endpoints (`/activate`, `/validate`, `/deactivate`), and signature implementation examples for backend engineers.

## Plywood ERP MVP setup

The original five tables are preserved and must be created first:

1. Run `supabase_schema.sql` in the Supabase SQL Editor if the legacy schema is not already present.
2. Run `supabase/migrations/004_plywood_erp_mvp.sql`.
3. Do not run `002_extend_plywood_erp.sql` or `003_harden_and_fix_erp.sql` for a new database; the MVP migration is self-contained and corrected.

The MVP migration is additive. It does not delete, recreate, truncate, backfill, or convert data in `categories`, `entities`, `custom_fields`, `transactions`, or `credit_payments`.

After applying the SQL, start the frontend with:

```bash
npm install
npm run dev -- --host 127.0.0.1
```

The development server uses the Vite/Tauri port configured in `vite.config.ts` (normally `http://127.0.0.1:1420`).
