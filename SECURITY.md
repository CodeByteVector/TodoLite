# Security Policy

TodoLite takes security seriously. Your data stays on your machine — this
policy describes how vulnerabilities are handled.

## Reporting a vulnerability

**Do not open a public issue for security problems.**

Use GitHub's **private vulnerability reporting** on this repository:

1. Go to the [Security tab](https://github.com/CodeByteVector/TodoLite/security) of the repository.
2. Click **"Report a vulnerability"** → **"New draft security advisory"**.
3. Include:
   - affected component (client, installer, keyring, database layer, …),
   - a reproducer or the steps you took,
   - the impact you observed.

Reports are handled confidentially and acknowledged within 5 business days.
We keep you updated until the issue is triaged and fixed.

## File formats / components in scope

- `src-tauri/` — Rust backend, SQLCipher DB layer, keyring (DPAPI/scrypt/AES-GCM), Tauri IPC
- `src/` — React frontend (XSS, CSP bypasses, sensitive data leaks)
- Installer & uninstaller (NSIS, MSI)
- Build configuration (`tauri.conf.json`, capabilities, GitHub Actions)

## Supported versions

| Version | Supported          |
| ------- | ------------------ |
| 1.0.x   | ✅ yes             |

Older versions are not supported and users are encouraged to update.

## Known design facts

- The database is fully encrypted on disk (AES-256 via SQLCipher). There is no
  plaintext database file at any time.
- The database key is wrapped with Windows DPAPI; when the optional PIN is set
  it is sealed with scrypt + AES-256-GCM instead, and the DPAPI copy is removed.
- The app makes no network calls by design.