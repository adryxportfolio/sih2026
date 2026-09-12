# Samiksha Workspace — demo setup (Windows + Docker)

The workspace is a five-service stack, not a static site. This is what the demo
machine needs and the order that avoids the failures that are painful to debug
in front of judges.

Everything below has been verified on macOS except where a line says otherwise.
Docker was not installed on the development machine, so the container-backed
features — agent computers, browser, terminal, desktop and screen recording —
are configured but were **not** exercised end to end. Budget an hour on the
demo machine before you need them.

---

## 1. Prerequisites

| Tool | Version | Note |
|---|---|---|
| Docker Desktop | latest | **WSL2 backend**, not Hyper-V. Agent computers are Linux containers. |
| Node | 22.22+, 24+, or 26+ | `node -v` |
| pnpm | 9+ | `npm i -g pnpm` |
| Postgres | 16+ | Or let compose run it (§4a). |

Give Docker Desktop at least **8 GB RAM** in Settings → Resources. Each agent
computer is a container running an X11 desktop and a browser; two or three at
once is what a demo actually uses, and the default 2 GB will not carry it.

## 2. Environment

```bash
cd workspace
cp .env.example .env
```

Fill in, at minimum:

```
DATABASE_URL=postgres://samiksha:<password>@127.0.0.1:5433/samiksha_workspace
BETTER_AUTH_SECRET=<32+ random chars>
ENCRYPTION_KEY=<64 hex chars>
SANDBOX_SUPERVISOR_TOKEN=<32+ random chars>
SCREEN_PROXY_SECRET=<32+ random chars>

OPENROUTER_API_KEY=<your key>
PI_DEFAULT_PROVIDER=openrouter
PI_DEFAULT_MODEL=deepseek/deepseek-v4-flash

SIGNUPS_ENABLED=false
SUPABASE_URL=https://<project>.supabase.co
SUPABASE_ANON_KEY=<anon key>
SUPABASE_SERVICE_ROLE_KEY=<service role key>

SAMIKSHA_COMPUTER_MEMORY=2g
SAMIKSHA_COMPUTER_CPUS=2
SAMIKSHA_COMPUTER_PIDS_LIMIT=512
```

**The three resource values must not be blank.** An empty
`SAMIKSHA_COMPUTER_MEMORY` does not mean "unlimited" — the supervisor rejects it
at boot and the whole stack comes up without agent computers. This is the first
thing to check if computers do not start.

`SIGNUPS_ENABLED=false` is deliberate: officers never self-register, the
administrator provisions them in the mobile app, and the workspace verifies
those credentials against Supabase on every sign-in.

## 3. Build the agent computer image

```bash
pnpm install
pnpm db:generate
pnpm sandbox:build
```

`sandbox:build` is a large image (X11, fluxbox, a browser). Do it the night
before, not on demo morning.

## 4. Run it

### 4a. Everything in Docker (simplest)

```bash
pnpm compose:up
```

### 4b. Services on the host, Docker only for agent computers

```bash
createdb samiksha_workspace
pnpm db:migrate
pnpm dev
```

Either way you should see four services: `web` on 5173, `api` on 3100,
`worker`, and `supervisor` on 7091. If the supervisor is missing, re-read §2.

## 5. Reaching it from the Android phone

This is the step that quietly breaks demos. The phone cannot resolve
`127.0.0.1` — that is the phone itself.

Find the PC's LAN address (`ipconfig` → IPv4, e.g. `192.168.1.24`) and set
**all** of these to it, not just the first:

```
API_HOST=0.0.0.0
API_URL=http://192.168.1.24:3100
WEB_ORIGIN=http://192.168.1.24:5173
BETTER_AUTH_URL=http://192.168.1.24:5173
```

`BETTER_AUTH_URL` and `WEB_ORIGIN` feed Better Auth's trusted origins. Leave
them on loopback and the phone will load the page and then fail every sign-in
with a CORS error that does not obviously say "wrong origin".

Then in the repo root `.env`:

```
EXPO_PUBLIC_WORKSPACE_URL=http://192.168.1.24:5173
```

and `node scripts/sync-env.mjs` before building the APK. The floating mascot
opens this URL.

Both devices must be on the same network. Phone hotspot is more reliable than
venue wifi, which often isolates clients from each other.

## 6. Smoke test before the judges arrive

1. Sign in with an officer account the admin provisioned in the mobile app.
   You should land straight in the workspace with three agents and no
   onboarding.
2. Send one message to Data Analyst. A reply proves OpenRouter, the key and
   DeepSeek are all good.
3. Ask it to open a computer and take a screenshot. This is the first thing
   that touches Docker — if it fails, everything else still demos.
4. On the phone, tap the mascot. The workspace should open inside Samiksha.

## 7. Feature surface and what each needs

| Feature | Needs |
|---|---|
| Persistent bots, memory, history, routines | Postgres only — works now |
| Competency-aware agents | Supabase keys — **verified working** |
| Delegation recorded against competencies | Supabase keys — **verified working** |
| Bot → peer bot and subagent delegation | Model key only |
| Browser, terminal, file, desktop access | Docker + `pnpm sandbox:build` |
| Screen recording → taught skill | Docker (runs inside an agent computer) |
| Team and private computers | Docker |
| Voice: speak, dictate, call | Per-officer key in Settings → Voice. Fish Audio, ElevenLabs, OpenAI and Cartesia are all supported; no env var |
| Composio app integrations | `COMPOSIO_API_KEY` |
| Pipedream Connect | `PIPEDREAM_*` |
| E2B / Daytona / Box compute | Their API keys; `SANDBOX_PROVIDER` |

Docker is the single dependency that gates the most impressive half of the
demo. If it is not working on the day, the agents still reason, draft and cite
— lead with the competency loop instead, which needs nothing but the model key.
