use std::ptr;

use aes_gcm::aead::{Aead, KeyInit, Payload};
use aes_gcm::{Aes256Gcm, Nonce};
use rand::RngCore;
use scrypt::{scrypt, Params};
use zeroize::Zeroize;

use windows_sys::Win32::Foundation::LocalFree;
use windows_sys::Win32::Security::Cryptography::{
    CryptProtectData, CryptUnprotectData, CRYPT_INTEGER_BLOB, CRYPTPROTECT_UI_FORBIDDEN,
};

pub const MASTER_KEY_LEN: usize = 32;
pub const SALT_LEN: usize = 16;
pub const NONCE_LEN: usize = 12;

// ------------------------------------------------------------------ DPAPI

/// Encrypt bytes with Windows DPAPI, scoped to the current Windows user account.
pub fn dpapi_encrypt(data: &[u8]) -> Result<Vec<u8>, String> {
    let in_blob = CRYPT_INTEGER_BLOB {
        cbData: data.len() as u32,
        pbData: data.as_ptr() as *mut u8,
    };
    let mut out_blob = CRYPT_INTEGER_BLOB { cbData: 0, pbData: ptr::null_mut() };

    unsafe {
        let ok = CryptProtectData(
            &in_blob,
            ptr::null(),
            ptr::null(),
            ptr::null(),
            ptr::null(),
            CRYPTPROTECT_UI_FORBIDDEN,
            &mut out_blob,
        );
        if ok == 0 {
            return Err(format!(
                "CryptProtectData failed, error 0x{:X}",
                std::io::Error::last_os_error().raw_os_error().unwrap_or(0)
            ));
        }
        let out = std::slice::from_raw_parts(out_blob.pbData, out_blob.cbData as usize).to_vec();
        LocalFree(out_blob.pbData as _);
        Ok(out)
    }
}

/// Decrypt bytes that were encrypted with [`dpapi_encrypt`].
pub fn dpapi_decrypt(data: &[u8]) -> Result<Vec<u8>, String> {
    let in_blob = CRYPT_INTEGER_BLOB {
        cbData: data.len() as u32,
        pbData: data.as_ptr() as *mut u8,
    };
    let mut out_blob = CRYPT_INTEGER_BLOB { cbData: 0, pbData: ptr::null_mut() };

    unsafe {
        let ok = CryptUnprotectData(
            &in_blob,
            ptr::null_mut(),
            ptr::null(),
            ptr::null(),
            ptr::null(),
            0,
            &mut out_blob,
        );
        if ok == 0 {
            return Err(format!(
                "CryptUnprotectData failed (error 0x{:X} - the current Windows account may differ)",
                std::io::Error::last_os_error().raw_os_error().unwrap_or(0)
            ));
        }
        let out = std::slice::from_raw_parts(out_blob.pbData, out_blob.cbData as usize).to_vec();
        LocalFree(out_blob.pbData as _);
        Ok(out)
    }
}

// ------------------------------------------------------------------ master key

/// Generate a fresh cryptographically random master key.
pub fn generate_master_key() -> [u8; MASTER_KEY_LEN] {
    let mut key = [0u8; MASTER_KEY_LEN];
    rand::thread_rng().fill_bytes(&mut key);
    key
}

// ------------------------------------------------------------------ PIN derivation

/// Derive a 256-bit key from a PIN using scrypt (memory-hard KDF).
pub fn derive_pin_key(pin: &str, salt: &[u8]) -> Result<[u8; 32], String> {
    let mut key = [0u8; 32];
    let params = Params::new(15, 8, 1, 32).map_err(|e| e.to_string())?;
    scrypt(pin.as_bytes(), salt, &params, &mut key).map_err(|e| e.to_string())?;
    Ok(key)
}

// ------------------------------------------------------------------ AES-256-GCM

/// Encrypt `plaintext` with the given key. Returns (nonce, ciphertext+tag).
pub fn aes_gcm_encrypt(key: &[u8; 32], plaintext: &[u8]) -> Result<(Vec<u8>, Vec<u8>), String> {
    let mut nonce = vec![0u8; NONCE_LEN];
    rand::thread_rng().fill_bytes(&mut nonce);
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|e| e.to_string())?;
    let ct = cipher
        .encrypt(
            Nonce::from_slice(&nonce),
            Payload { msg: plaintext, aad: b"todolite-master-v1" },
        )
        .map_err(|_| "AES-GCM encryption failed".to_string())?;
    Ok((nonce, ct))
}

/// Decrypt a record produced by [`aes_gcm_encrypt`]; fails on tampered input.
pub fn aes_gcm_decrypt(key: &[u8; 32], nonce: &[u8], ciphertext: &[u8]) -> Result<Vec<u8>, String> {
    let cipher = Aes256Gcm::new_from_slice(key).map_err(|e| e.to_string())?;
    cipher
        .decrypt(
            Nonce::from_slice(nonce),
            Payload { msg: ciphertext, aad: b"todolite-master-v1" },
        )
        .map_err(|_| "decryption failed: authentication tag mismatch".to_string())
}

// ------------------------------------------------------------------ util

/// Atomically write a file (write temp, then rename over the target).
pub fn write_atomic(path: &std::path::Path, data: &[u8]) -> std::io::Result<()> {
    let tmp = path.with_extension("tmp");
    std::fs::write(&tmp, data)?;
    std::fs::rename(&tmp, path)?;
    Ok(())
}

/// Securely wipe key material from memory.
pub fn wipe(key: &mut [u8]) {
    key.zeroize();
}

/// Fill a buffer with cryptographically secure random bytes.
pub fn random_bytes(len: usize) -> Vec<u8> {
    let mut out = vec![0u8; len];
    rand::thread_rng().fill_bytes(&mut out);
    out
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn dpapi_roundtrip() {
        let data = b"TodoLite test secret";
        let enc = dpapi_encrypt(data).unwrap();
        assert_ne!(enc, data);
        assert_eq!(dpapi_decrypt(&enc).unwrap(), data);
    }

    #[test]
    fn scrypt_is_deterministic() {
        let salt = [7u8; SALT_LEN];
        let a = derive_pin_key("1234", &salt).unwrap();
        let b = derive_pin_key("1234", &salt).unwrap();
        assert_eq!(a, b);
    }
}