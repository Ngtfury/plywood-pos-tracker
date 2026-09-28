# Plywood POS - Licensing & Device Activation Backend API Specification

This document defines the REST API contract for the separate licensing backend server.
The client Tauri ERP application interacts with these endpoints to activate, validate, and deactivate device licenses.

---

## 1. Overview & Security Architecture

1. **Authority**: The backend server is the authoritative source for license status, device seat allocations, and revocations.
2. **Asymmetric Cryptography (Ed25519)**:
   - The backend holds the **Private Key** used to cryptographically sign license payloads.
   - The client application embeds **ONLY the Public Verification Key** (`45c783323732ccea635bea4bd23dfa1f57a0ad6592945c450e1383df9807dbb0`).
   - The client verifies signatures locally upon startup and offline validation.
3. **Machine Binding**:
   - Each license seat is cryptographically bound to a unique, stable SHA-256 `machine_id` generated on the client Windows PC.
   - Copying the local license file to another computer will result in immediate rejection (`DEVICE_NOT_AUTHORIZED`).
4. **Temporary Offline Grace Period**:
   - The signed license payload includes `offline_until` (e.g. 14 to 30 days from issuance or last successful online check).
   - If the client PC has no internet connectivity, the application continues normal operation until `offline_until` expires.

---

## 2. API Endpoints

### 2.1 Activate License

Registers and binds a license key to the requesting device.

- **Method**: `POST`
- **Path**: `/api/v1/licenses/activate`
- **Content-Type**: `application/json`

#### Request Payload
```json
{
  "license_key": "PLY-2026-ABCD-EFGH-IJKL",
  "machine_id": "c6a28bf2c37e9b380f7823e590d64115163351ec30689b910126cae75069d255",
  "device_name": "This Windows PC",
  "platform": "windows",
  "app_version": "0.1.0"
}
```

#### Success Response (`200 OK`)
```json
{
  "success": true,
  "license": {
    "license_id": "PLY-2026-ABCD-EFGH-IJKL",
    "company_id": "COMP-10492",
    "company_name": "Balaji Timber & Plywood Works",
    "plan": "Enterprise POS",
    "machine_id": "c6a28bf2c37e9b380f7823e590d64115163351ec30689b910126cae75069d255",
    "device_name": "Main Office Terminal 1",
    "issued_at": "2026-09-28T18:00:00Z",
    "expires_at": "2027-09-28T23:59:59Z",
    "offline_until": "2026-10-28T23:59:59Z",
    "features": [
      "inventory",
      "accounting",
      "credits",
      "analytics",
      "export"
    ]
  },
  "signature": "base64_encoded_64_byte_ed25519_signature_of_canonical_license_json"
}
```

#### Error Responses
- `400 Bad Request` / `404 Not Found` (Invalid license key):
  ```json
  {
    "success": false,
    "error_code": "INVALID_KEY",
    "message": "The entered license key does not exist or has an invalid format."
  }
  ```
- `403 Forbidden` (License Expired):
  ```json
  {
    "success": false,
    "error_code": "EXPIRED",
    "message": "This software license expired on 2026-08-31."
  }
  ```
- `403 Forbidden` (License Revoked):
  ```json
  {
    "success": false,
    "error_code": "REVOKED",
    "message": "This license has been revoked by your organization administrator."
  }
  ```
- `409 Conflict` (Max device seats exceeded):
  ```json
  {
    "success": false,
    "error_code": "DEVICE_NOT_AUTHORIZED",
    "message": "All authorized device seats for this license key are in use. Deactivate an existing device first."
  }
  ```

---

### 2.2 Validate License (Periodic / Background Sync)

Called periodically (every 24 hours) or when the user clicks "Verify Now" in Settings.

- **Method**: `POST`
- **Path**: `/api/v1/licenses/validate`
- **Content-Type**: `application/json`

#### Request Payload
```json
{
  "license_id": "PLY-2026-ABCD-EFGH-IJKL",
  "machine_id": "c6a28bf2c37e9b380f7823e590d64115163351ec30689b910126cae75069d255",
  "app_version": "0.1.0"
}
```

#### Success Response (`200 OK`)
When valid, the server extends `offline_until` and returns a newly signed token.
```json
{
  "success": true,
  "status": "ACTIVE",
  "license": {
    "license_id": "PLY-2026-ABCD-EFGH-IJKL",
    "company_id": "COMP-10492",
    "company_name": "Balaji Timber & Plywood Works",
    "plan": "Enterprise POS",
    "machine_id": "c6a28bf2c37e9b380f7823e590d64115163351ec30689b910126cae75069d255",
    "device_name": "Main Office Terminal 1",
    "issued_at": "2026-09-28T18:00:00Z",
    "expires_at": "2027-09-28T23:59:59Z",
    "offline_until": "2026-10-28T23:59:59Z",
    "features": [
      "inventory",
      "accounting",
      "credits",
      "analytics",
      "export"
    ]
  },
  "signature": "base64_encoded_64_byte_ed25519_signature_of_canonical_license_json"
}
```

#### Failure Responses (Revoked, Expired, or Seat Removed)
```json
{
  "success": false,
  "status": "REVOKED",
  "message": "License was deactivated or revoked by organization admin."
}
```
*(HTTP 500, timeouts, and network connection drops are NOT treated as license failures by the client; the client safely enters `LICENSE_OFFLINE` grace mode).*

---

### 2.3 Deactivate License

Releases the device seat on the backend so another PC can activate.

- **Method**: `POST`
- **Path**: `/api/v1/licenses/deactivate`
- **Content-Type**: `application/json`

#### Request Payload
```json
{
  "license_id": "PLY-2026-ABCD-EFGH-IJKL",
  "machine_id": "c6a28bf2c37e9b380f7823e590d64115163351ec30689b910126cae75069d255"
}
```

#### Success Response (`200 OK`)
```json
{
  "success": true,
  "message": "Device seat successfully released."
}
```

---

## 3. Cryptographic Signature Guide for Backend Engineers

The backend must sign `JSON.stringify(license)` using an Ed25519 private key corresponding to the public verification key:

- **Public Key (HEX)**: `45c783323732ccea635bea4bd23dfa1f57a0ad6592945c450e1383df9807dbb0`
- **Algorithm**: Ed25519 (PureEd25519 / RFC 8032)
- **Signature Output Format**: Standard Base64 (64 raw bytes encoded).

### Node.js Example Implementation
```javascript
const crypto = require('crypto');

// Backend secret Ed25519 private key (stored in secure environment variable)
const privateKey = crypto.createPrivateKey({
  key: Buffer.from(process.env.LICENSE_ED25519_PRIVATE_KEY_DER, 'hex'),
  format: 'der',
  type: 'pkcs8'
});

function signLicensePayload(licensePayloadObject) {
  const payloadString = JSON.stringify(licensePayloadObject);
  const signatureBuffer = crypto.sign(null, Buffer.from(payloadString), privateKey);
  return signatureBuffer.toString('base64');
}
```

### Python Example Implementation
```python
import json
import base64
from cryptography.hazmat.primitives.asymmetric import ed25519

# Load private key from PEM or seed
private_key = ed25519.Ed25519PrivateKey.from_private_bytes(...)

def sign_license_payload(license_dict):
    payload_str = json.dumps(license_dict, separators=(',', ':'))
    signature_bytes = private_key.sign(payload_str.encode('utf-8'))
    return base64.b64encode(signature_bytes).decode('utf-8')
```

---

## 4. Client State Machine Mapping

| Backend Response | Client License State | ERP Access | UI Display |
|---|---|---|---|
| Active & Valid Signature | `LICENSE_ACTIVE` | **Allowed** | Main ERP Dashboard |
| Server Unreachable + Grace Valid | `LICENSE_OFFLINE` | **Allowed** | Main ERP + Offline Badge |
| Server Unreachable + Grace Expired | `LICENSE_EXPIRED` | Blocked | Re-connection prompt |
| Invalid Signature / Tampered File | `LICENSE_INVALID` | Blocked | Activation Screen |
| `status: "DEVICE_NOT_AUTHORIZED"` | `DEVICE_NOT_AUTHORIZED` | Blocked | "Device not authorized" card |
| `status: "EXPIRED"` | `LICENSE_EXPIRED` | Blocked | "License expired" card |
| `status: "REVOKED"` | `LICENSE_REVOKED` | Blocked | "License unavailable" card |
| Deactivated by user | `ACTIVATION_REQUIRED` | Blocked | Activation Screen |
