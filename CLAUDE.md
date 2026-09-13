# Samiksha — context for Claude

Read this before running or changing anything. It is written for a fresh session
on the Windows demo machine.

## What this is

Smart India Hackathon 2026, problem statement **SIH26101**: an AI learning
platform for India's Official Statistical System that finds competency gaps,
recommends training against the iGOT Karmayogi ecosystem, and generates quizzes
from uploaded material.

Three deployable parts, one repository:

| Path | What it is | Runs on |
|---|---|---|
| `mobile/` | Expo / React Native. Two APKs from one codebase — officer and administrator. | Android phone |
| `workspace/` | The AI agent workspace. pnpm monorepo: api, web, worker, sandbox supervisor, Electron desktop. | Windows PC |
| `supabase/` | Postgres schema, RLS, edge functions. Single source of truth for identity and competency. | Supabase cloud |

## The idea worth protecting

Two halves that feed each other, and the connection is the point:

- **Learning** measures each officer against the FRAC competencies their post
  requires, and teaches what is missing.
- **The workspace** gives them AI agents to delegate repetitive analytical work to.
- **The loop** joins them. Agents are told where the officer is weak and explain
  the step that matters while they work. Every delegation is recorded against a
  competency, so repeatedly handing over Python work becomes evidence that a
  measured gap is costing real autonomy — surfaced as *"What you are handing to
  your agents"*.

Do not let a change break that link. It is the difference between this and a
quiz generator with a chatbot attached.

## Running it — one command

```bash
node scripts/start.mjs
```

That is the whole thing. It finds this machine's address on the local network,
writes it into every file that needs to agree about it, generates any missing
secrets, checks the model server, and brings the stack up in Docker. Safe to
re-run; it edits values in place.

Add `--native` to run the services directly instead of in containers (faster
for editing code, but agent computers still need Docker).

If someone asks you to "start the app", "run the server" or "set it up", run
that script. Do not hand-edit `.env` networking values — four files have to
agree about one address, and the script is what keeps them agreeing.

### Prerequisites
Docker Desktop (**WSL2 backend**, 8 GB+), Node 22.22+/24+/26+, and an
OpenRouter key in `workspace/.env`. The script checks these and says what is
missing. Every agent run provisions a Docker computer first, so without Docker
the workspace UI loads but agents never reply.

### Secrets
Three git-ignored `.env` files. `.env` and `workspace/.env` must be copied from
the old machine — they hold the Supabase keys. `mobile/.env` is generated.

Never commit them, and never put a service role key in the mobile app: only
`EXPO_PUBLIC_*` values reach the APK, and `scripts/sync-env.mjs` refuses to sync
if a server secret ever carries that prefix.

### The phone
The Android app reaches the workspace at the address the script printed. Both
devices must be on the same network — a phone hotspot is more reliable than
venue wifi, which often isolates clients from each other.

### Mobile development
```bash
cd mobile
pnpm install
pnpm web        # browser preview
pnpm android    # USB phone, developer mode on
```

## Model configuration

One hosted model everywhere: DeepSeek V4 Flash through OpenRouter.

```
# workspace/.env — the agent workspace
PI_DEFAULT_PROVIDER=openrouter
PI_DEFAULT_MODEL=deepseek/deepseek-v4-flash
OPENROUTER_API_KEY=sk-or-...
```

Supabase Edge Functions (Samiksha AI behind the mascot, quiz generation) read
the key from the function secret `OPENROUTER_API_KEY` or, failing that, from
Vault as `openrouter_api_key` via `get_service_secret()` — granted to the
service role only. The live project uses Vault, so no CLI is needed to rotate
it: `select vault.update_secret(id, '<new key>') from vault.secrets where name = 'openrouter_api_key';`

Local inference through Ollama still works (`PI_DEFAULT_PROVIDER=local`,
`SAMIKSHA_LOCAL_MODELS=qwen3:1.7b`); `scripts/start.mjs` only checks for
Ollama when the provider is local.

**Model names must not appear in the UI.** Officers see "Samiksha AI"; the
engine is an operational detail that changes with deployment.

## Things that will waste your afternoon

- **A container cannot reach the host's `127.0.0.1`.** A model served on the
  laptop is only reachable from inside Docker via `host.docker.internal`. This
  is the most confusing failure here, because Ollama is plainly running and
  plainly refusing to answer. `scripts/start.mjs` handles it.
- **Blank `SAMIKSHA_COMPUTER_MEMORY`** stops the sandbox supervisor booting
  entirely. It means "invalid", not "unlimited". The script sets `2g`.
- **`BETTER_AUTH_URL` on loopback** lets the phone load the page and then fail
  every sign-in with a CORS error that never says "wrong origin". The script
  keeps it aligned with the LAN address.
- **CRLF in `workspace/infra/sandboxes/computer/start.sh`** makes the container
  fail with `bad interpreter`. `.gitattributes` pins it to LF; do not override.
- **Long paths.** pnpm nests deeply against the 260-character Windows limit.
  Clone to `C:\dev\sih2026`, not a deep `Documents` path.
- **`Alert.alert` does nothing on react-native-web.** Use `confirmAsync` /
  `notify` from `mobile/src/lib/dialog.ts`.
- **`react-native-webview` is native-only.** It renders a hard error on web, so
  anything using it needs a `Platform.OS === "web"` branch.

## Conventions

- **Colours are monochrome.** White, black and greys. Semantic green/red appear
  only for answer correctness, where colour carries meaning. No brand colour.
- **Officers never self-register.** An administrator provisions every account
  against a verified employee ID; the workspace verifies those same credentials
  against Supabase on each sign-in. `SIGNUPS_ENABLED=false` is deliberate.
- **Agents draft, people decide.** Official statistics are published under a
  person's name. No agent instruction should end in sending, publishing or
  silently correcting a figure.
- Run `pnpm typecheck` (mobile) and `pnpm check` (workspace, expect 20 passing)
  before committing.

## State of play

Verified working: the Supabase identity bridge, the competency loop in both
directions, agent provisioning, adaptive assessment, FSRS review, quiz flow with
page citations, both dashboards.

Samiksha AI (the mascot menu → "Ask a question"): the `assistant` Edge Function.
Officers get a tutor that knows their gaps and assigned material. Administrators
get an operator with read tools over the platform and action tools (publish or
assign material, create / deactivate / reset an account) that return a proposed
action the administrator must confirm. Demo sessions send their own dataset,
never touch the database, and are rate-limited.

Department study material: administrators publish PDFs, PPTX, DOCX, video (≤50 MB,
private `materials` bucket) or YouTube / web links from the Materials tab to all
departments or one, ticking individual officers. Recipients live in
`material_assignments`; officers see them under Library → From your department.

Three APKs from one codebase via `EXPO_PUBLIC_APP_VARIANT`: `learner`, `admin`,
and `demo`, which opens on a choice of the two journeys with no sign-in form.

Migration 0015 restored EXECUTE on the RLS helpers (`is_staff` and friends) for
`authenticated`. 0011 had revoked it, which made every signed-in table read fail
with "permission denied for function is_staff" — demo mode hid this.

Configured but never executed: everything behind Docker — agent computers,
browser, terminal, desktop, screen recording. There was no Docker on the
development machine. Budget an hour on this one before relying on them.

Voice dictation uses the browser's built-in Web Speech API, which is free and
needs no key. The paid voice providers are optional and unused.
