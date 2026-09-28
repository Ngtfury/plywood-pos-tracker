use ed25519_dalek::{Signature, Verifier, VerifyingKey};
use std::fs;
use std::path::PathBuf;

/// Official Public Verification Key for Plywood POS Licensing (Ed25519).
/// Only the public key is present in client software. The private key resides exclusively
/// on the authorized licensing backend server.
pub const PUBLIC_KEY_HEX: &str = "45c783323732ccea635bea4bd23dfa1f57a0ad6592945c450e1383df9807dbb0";

/// Verifies an Ed25519 cryptographic signature against the canonical JSON payload string.
pub fn verify_signature(payload_json: &str, signature_b64: &str) -> Result<bool, String> {
    // 1. Parse public key
    let pub_key_bytes = hex::decode(PUBLIC_KEY_HEX)
        .map_err(|e| format!("Invalid embedded public key hex: {}", e))?;
    
    let key_array: [u8; 32] = pub_key_bytes
        .try_into()
        .map_err(|_| "Public key must be exactly 32 bytes".to_string())?;

    let verifying_key = VerifyingKey::from_bytes(&key_array)
        .map_err(|e| format!("Failed to parse public verification key: {}", e))?;

    // 2. Decode base64 signature
    let clean_sig = signature_b64.trim();
    let sig_bytes = base64::Engine::decode(&base64::engine::general_purpose::STANDARD, clean_sig)
        .map_err(|e| format!("Invalid base64 signature format: {}", e))?;

    let sig_array: [u8; 64] = sig_bytes
        .try_into()
        .map_err(|_| "Signature must be exactly 64 bytes".to_string())?;

    let signature = Signature::from_bytes(&sig_array);

    // 3. Cryptographic verification
    verifying_key
        .verify(payload_json.as_bytes(), &signature)
        .map(|_| true)
        .map_err(|e| format!("Cryptographic signature verification failed: {}", e))
}

/// Resolves the secure OS storage directory for the license file.
fn get_storage_path() -> PathBuf {
    let mut base = if let Ok(appdata) = std::env::var("APPDATA") {
        PathBuf::from(appdata)
    } else if let Ok(home) = std::env::var("USERPROFILE") {
        PathBuf::from(home).join("AppData").join("Roaming")
    } else {
        std::env::temp_dir()
    };
    base.push("com.plywood.software");
    base
}

/// Securely writes the verified license token to the OS application data directory.
pub fn save_license(token_json: &str) -> Result<(), String> {
    let dir = get_storage_path();
    if !dir.exists() {
        fs::create_dir_all(&dir)
            .map_err(|e| format!("Failed to create license storage directory: {}", e))?;
    }
    let file_path = dir.join("license.lic");
    fs::write(file_path, token_json)
        .map_err(|e| format!("Failed to write license file: {}", e))
}

/// Loads the stored license token from OS application data directory if it exists.
pub fn load_license() -> Result<Option<String>, String> {
    let file_path = get_storage_path().join("license.lic");
    if !file_path.exists() {
        return Ok(None);
    }
    match fs::read_to_string(file_path) {
        Ok(content) => Ok(Some(content)),
        Err(e) => Err(format!("Failed to read license file: {}", e)),
    }
}

/// Securely deletes the stored license file upon device deactivation.
pub fn delete_license() -> Result<(), String> {
    let file_path = get_storage_path().join("license.lic");
    if file_path.exists() {
        fs::remove_file(file_path)
            .map_err(|e| format!("Failed to delete license file: {}", e))?;
    }
    Ok(())
}
