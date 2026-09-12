# Moving development to Windows

The code moves by `git clone`. The only things that do not are the three `.env`
files, because they are deliberately git-ignored — they hold live credentials.
Everything else, including all 1.8 GB of `node_modules`, is regenerated.

---

## 1. Install

| Tool | Version | Notes |
|---|---|---|
| Git for Windows | latest | During install choose **"Checkout as-is, commit Unix-style"**. The repo's `.gitattributes` handles endings; letting Git also rewrite them can double-convert. |
| Node | 22.22+, 24+, or 26+ | The workspace `engines` field rejects anything older. |
| pnpm | 9+ | `npm i -g pnpm` |
| Docker Desktop | latest | **WSL2 backend.** Agent computers are Linux containers. |
| PostgreSQL | 16+ | Or let Docker Compose run it. |
| Android Studio | latest | Only if you want an emulator; a USB phone works without it. |

## 2. Clone

```bash
git clone https://github.com/adryxportfolio/sih2026.git
cd sih2026
```

## 3. Bring the secrets across

Three files, none of them in git:

| File | Holds |
|---|---|
| `.env` | Supabase URL, anon key, service role key, OpenRouter key, YouTube key |
| `mobile/.env` | Generated from the root `.env` — do not write by hand |
| `workspace/.env` | Workspace DB URL, auth secrets, Supabase keys, model config |

Copy `.env` and `workspace/.env` across on a **USB stick or a password manager**,
not email or chat. `mobile/.env` is regenerated:

```bash
node scripts/sync-env.mjs
```

Then fix the machine-specific lines in `workspace/.env`, which currently point
at the Mac:

```
POSTGRES_USER=postgres
DATABASE_URL=postgres://postgres:<password>@127.0.0.1:5432/samiksha_workspace
```

**Rotate the Supabase service role key before the demo.** It was pasted into a
chat window early in this project, so it should be treated as compromised
regardless of how carefully it is moved now. Supabase dashboard → Project
Settings → API → rotate, then update both `.env` files.

## 4. Mobile app

```bash
cd mobile
pnpm install          # or npm install
pnpm web              # browser preview
pnpm android          # USB phone with developer mode on
```

The APK itself is built by GitHub Actions, not locally — push a `v*` tag or run
the workflow by hand. Nothing about that changes on Windows.

## 5. Workspace

Follow [workspace-demo-setup.md](workspace-demo-setup.md). The short version:

```bash
cd workspace
pnpm install
pnpm db:generate
createdb samiksha_workspace     # or psql -U postgres -c "create database samiksha_workspace"
pnpm db:migrate
pnpm sandbox:build              # large image — do this the night before
pnpm dev
```

## 6. Windows-specific things that actually bite

**Line endings in container scripts.** `workspace/infra/sandboxes/computer/start.sh`
is copied into a Linux image. With CRLF it fails as `bad interpreter`. Both
`.gitattributes` files pin these to LF, so this is handled — but if you ever see
that error, check the endings first.

**Long paths.** pnpm nests deeply and Windows caps paths at 260 characters. If
install fails with `ENAMETOOLONG`, enable long paths once as Administrator:

```powershell
git config --system core.longpaths true
New-ItemProperty -Path "HKLM:\SYSTEM\CurrentControlSet\Control\FileSystem" `
  -Name "LongPathsEnabled" -Value 1 -PropertyType DWORD -Force
```

Cloning to `C:\dev\sih2026` rather than a deep `Documents` path avoids most of it.

**Docker memory.** Settings → Resources → at least 8 GB. Each agent computer is
a container running an X11 desktop and a browser.

**`bash` scripts.** Only `pnpm test:compose-smoke` needs a real shell. Run it
from Git Bash or WSL if you need it; it is not part of the demo.

## 7. Confirm the move worked

```bash
cd mobile     && pnpm typecheck    # expect clean
cd ../workspace && pnpm check      # expect 20 successful
```

Then sign in to the workspace with an officer account provisioned in the mobile
app. Landing straight in a workspace with three agents and no onboarding means
the Supabase identity bridge survived the move, which is the part most likely to
be misconfigured.
