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

## Running it

### Prerequisites
Docker Desktop (**WSL2 backend**, 8 GB+), Node 22.22+/24+/26+, pnpm 9+,
Postgres 16+, Ollama.

### Secrets
Three git-ignored `.env` files. `.env` and `workspace/.env` must be copied from
the old machine; `mobile/.env` is generated:

```bash
node scripts/sync-env.mjs
```

Never commit them, and never put a service role key in the mobile app — only
`EXPO_PUBLIC_*` values reach the APK, and `scripts/sync-env.mjs` refuses to sync
if a server secret ever carries that prefix.

### Mobile
```bash
cd mobile
pnpm install
pnpm web        # browser preview
pnpm android    # USB phone, developer mode on
```

### Workspace
```bash
cd workspace
pnpm install
pnpm db:generate
pnpm db:migrate
pnpm sandbox:build   # large image, do it early
pnpm dev             # web :5173, api :3100, worker, supervisor :7091
```

## Model configuration

Inference runs locally through Ollama — no API key, no per-token cost.

```
PI_DEFAULT_PROVIDER=local
PI_DEFAULT_MODEL=qwen3:1.7b
SAMIKSHA_LOCAL_MODELS=qwen3:1.7b
SAMIKSHA_LOCAL_MODELS_URL=http://127.0.0.1:11434/v1
```

`ollama serve` must be running. Check with `curl http://127.0.0.1:11434/v1/models`.

To switch to a hosted model instead, set `PI_DEFAULT_PROVIDER=openrouter`,
`PI_DEFAULT_MODEL=deepseek/deepseek-v4-flash` and `OPENROUTER_API_KEY`.

**Model names must not appear in the UI.** Officers see "Samiksha AI"; the
engine is an operational detail that changes with deployment.

## Things that will waste your afternoon

- **Blank `SAMIKSHA_COMPUTER_MEMORY`** stops the sandbox supervisor booting
  entirely. It means "invalid", not "unlimited". Set `2g`.
- **`BETTER_AUTH_URL` on loopback** lets the phone load the page and then fail
  every sign-in with a CORS error that never says "wrong origin". When the phone
  must reach the PC, set `API_HOST=0.0.0.0` and put the LAN IP in `API_URL`,
  `WEB_ORIGIN`, `BETTER_AUTH_URL` and `EXPO_PUBLIC_WORKSPACE_URL`.
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

Configured but never executed: everything behind Docker — agent computers,
browser, terminal, desktop, screen recording. There was no Docker on the
development machine. Budget an hour on this one before relying on them.

Voice dictation uses the browser's built-in Web Speech API, which is free and
needs no key. The paid voice providers are optional and unused.
