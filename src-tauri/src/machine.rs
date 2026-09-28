use sha2::{Digest, Sha256};
use std::process::Command;

/// Generates a stable, unique machine identifier for the device.
/// Gathers Windows-specific hardware and OS identifiers without exposing raw values.
/// Hashes the combined entropy with an application salt using SHA-256.
pub fn get_stable_machine_id() -> String {
    let mut raw_data = String::new();

    // 1. Windows MachineGuid from Registry (stable across restarts & updates)
    #[cfg(target_os = "windows")]
    {
        if let Ok(output) = Command::new("reg")
            .args(["query", "HKLM\\SOFTWARE\\Microsoft\\Cryptography", "/v", "MachineGuid"])
            .output()
        {
            let text = String::from_utf8_lossy(&output.stdout);
            for line in text.lines() {
                if line.contains("MachineGuid") {
                    if let Some(val) = line.split_whitespace().last() {
                        raw_data.push_str(val.trim());
                    }
                }
            }
        }

        // 2. Motherboard / BIOS UUID via WMIC
        if let Ok(output) = Command::new("wmic")
            .args(["csproduct", "get", "uuid"])
            .output()
        {
            let text = String::from_utf8_lossy(&output.stdout);
            for line in text.lines() {
                let trimmed = line.trim();
                if !trimmed.is_empty() && trimmed.to_lowercase() != "uuid" {
                    raw_data.push_str(trimmed);
                    break;
                }
            }
        }

        // 3. System Drive Volume Serial Number
        if let Ok(output) = Command::new("cmd")
            .args(["/c", "vol", "C:"])
            .output()
        {
            let text = String::from_utf8_lossy(&output.stdout);
            for line in text.lines() {
                if line.contains("Serial Number") {
                    if let Some(val) = line.split_whitespace().last() {
                        raw_data.push_str(val.trim());
                    }
                }
            }
        }
    }

    // 4. Stable environment identifiers (Host & User Domain)
    if let Ok(val) = std::env::var("COMPUTERNAME") {
        raw_data.push_str(&val);
    }
    if let Ok(val) = std::env::var("USERDOMAIN") {
        raw_data.push_str(&val);
    }

    // Fallback if all lookups failed
    if raw_data.is_empty() {
        raw_data.push_str("plywood-default-device-identifier");
    }

    // Application-specific salt prevents hardware ID correlation across different apps
    let salt = "com.plywood.pos.licensing.salt.v1.2026";
    let mut hasher = Sha256::new();
    hasher.update(raw_data.as_bytes());
    hasher.update(salt.as_bytes());
    let hash = hasher.finalize();

    hex::encode(hash)
}
