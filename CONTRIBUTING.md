# Contributing to Helpuit

Thanks for your interest! A few things to know before you start.

## Licensing & the CLA

Helpuit is **source-available** under [PolyForm Noncommercial 1.0.0](LICENSE) and is
**dual-licensed** — the maintainer also sells commercial licenses. For that to remain
possible, the maintainer must hold the rights to all contributed code.

**By submitting a contribution (PR, patch, etc.) you agree that:**

- you wrote the contribution (or have the right to submit it), and
- you grant the maintainer (Nathan Gandawa) a perpetual, irrevocable license to use,
  modify, and **relicense** your contribution — including under commercial terms — while you
  retain your own copyright.

A formal CLA may be required for substantial contributions. If you can't agree to this,
please open an issue to discuss rather than sending code.

## Development

```sh
pnpm install
pnpm test           # unit + integration (real collaborators, no mocks)
pnpm test:browser   # real-Chromium reproduction tests
pnpm test:smoke     # boots the real server process and probes health
pnpm typecheck
pnpm start          # run the server from source
```

## Conventions

- **TDD, no mocks.** Tests exercise real code paths: real local HTTP servers, a real
  in-memory database (`:memory:`), real Chromium, real crypto. Don't mock the unit under
  test. In-memory implementations of an interface (e.g. `InMemoryJobQueue`) are real
  collaborators, not mocks — fine to use.
- **Vertical slices.** One behavior at a time: red → green → refactor. Match the style,
  naming, and comment density of the surrounding code.
- **Deep modules.** One package per capability with a small, stable interface; the
  orchestrator attaches capabilities through optional ports that degrade gracefully.
- **Safety invariants are non-negotiable** (see [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md)):
  verified-token identity only, no raw SQL to customer data, redaction-gated export, no
  plaintext sensitive data at rest, hard cost caps, and a human gate for irreversible work.

## Before opening a PR

- `pnpm test && pnpm typecheck` are green (and `pnpm test:browser` / `pnpm test:smoke` if you
  touched reproduction or the server entrypoint).
- New behavior is covered by a test that would fail without your change.
- No secrets, tokens, or customer data in code, fixtures, or commits.
