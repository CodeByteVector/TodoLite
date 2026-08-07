<div align="center">

<img src="assets/logo.png" alt="TodoLite" width="96" height="96" />

# TodoLite

A beautiful, secure, **100 % local-first** To-Do planner for Windows — iOS-inspired in look and feel.

![Windows](https://img.shields.io/badge/Windows-10%2F11%20x64-0078D6?style=flat-square&logo=windows&logoColor=white)
![Built with](https://img.shields.io/badge/Built%20with-TypeScript%20%2B%20Rust-5E5CE6?style=flat-square)
![License: MIT](https://img.shields.io/badge/License-MIT-30D158?style=flat-square)

Built with **Tauri 2** · **React 19** · **TypeScript** · **Vite** · **Tailwind CSS v4**

**⬇️ Download the latest version in [Releases](../../releases)**

</div>

---

## Features

- **Lists & tasks** — organise work into colored lists; break big tasks into chunks with subtasks
- **Due dates & times** — an iOS-style calendar picker plus quick picks (Today / Tomorrow)
- **Reminders** — native Windows notifications, from 5 minutes to 1 day before the due time
- **Repeat** — daily, weekly, monthly, yearly recurrence
- **Tags** — colour-coded, assignable per task
- **Priorities** — none / low / medium / high with visual coding
- **Smart views** — Today, Next 7 Days, Overdue, All Tasks
- **Drag & drop** — reorder open tasks and create lists on the fly
- **Search** — live filtering across everything
- **Statistics** — completion rings, streaks, last-14-days chart, per-list progress
- **Dark / light mode** and 9 accent colors
- **Quick lock** — optional launch PIN

## Security

- Everything lives on **your PC**. No accounts, no cloud, no telemetry.
- The database is **fully encrypted on disk with AES-256 (SQLCipher)** — pages, journal and temp files.
  There is **no plaintext database at any time**, not even while the app runs.
- The database key is wrapped with **Windows DPAPI**, scoped to your Windows account. An optional
  **launch PIN** seals the key with **scrypt + AES-256-GCM** instead, so the data cannot be unlocked
  without your PIN — even by your own Windows session.
- The app makes no network calls — it cannot phone home.
- Strict **Content-Security-Policy** and a locked-down Tauri capability set.
- Weekly **security audits** (cargo audit + npm audit) run on CI, plus Dependabot and
  private vulnerability reporting — see [SECURITY.md](SECURITY.md).
- **Uninstall is 100% clean** — the uninstaller removes every file and the complete data folder. Nothing is left behind.

## Download

Get the installer from the [**Releases**](../../releases) page:

| File | Description |
|---|---|
| `TodoLite_x.x.x_x64-setup.exe` | NSIS installer — per-user install, no admin rights needed |
| `TodoLite_x.x.x_x64_en-US.msi` | MSI package |

**Requirements:** Windows 10/11 x64 and the [Microsoft Edge WebView2 Runtime](https://developer.microsoft.com/microsoft-edge/webview2/) (preinstalled on Windows 11).

## Development

```bash
# prerequisites: Node.js 18+, Rust (MSVC toolchain)
npm install
npm run tauri dev     # run in development mode
npm run tauri build   # produce release installers in src-tauri/target/release/bundle
```

### Project layout

```
src/                 React frontend (Vite + TypeScript)
  components/           UI building blocks (titlebar, sidebar, sheets, task rows…)
  lib/                  api wrapper, theme, formatting, icons
  store.ts              Zustand store (state + data refresh)
src-tauri/           Rust backend
  src/database.rs       SQLCipher-encrypted schema + CRUD + keyring lifecycle
  src/crypto.rs         AES-256-GCM, scrypt PIN KDF, DPAPI key wrapping
  src/reminders.rs      Windows notification scheduler
  src/lib.rs            Tauri command layer + background loops
```

## How storage security works

TodoLite encrypts the **entire SQLite database** with SQLCipher (AES-256): every page, the rollback
journal and all temp data are ciphertext on disk — while the app runs and after it exits. The 256-bit
master key is generated per installation and stored in `AppData` as:

- `master.dpapi` — the key, wrapped with `CryptProtectData` (Windows DPAPI), so only your Windows
  user account can unwrap it, **or**
- `master.pin` — when a launch PIN is set, the key is sealed with **scrypt** (memory-hard KDF) and
  AES-256-GCM; the DPAPI copy is deleted, so the data is unreadable without the PIN.

Wrong PINs are rejected by the AEAD authentication tag — there is no client-side hash that could be
bypassed. Locking the app closes the connection and wipes the key from memory.

## License

Distributed under the [MIT License](LICENSE). Copyright © 2026 **CodeByteVector**.