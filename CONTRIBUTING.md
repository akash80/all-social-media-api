# Contributing to all-social-media-api

Thank you for your interest in contributing. This document explains how to get set up, run tests, and submit changes.

---

## Prerequisites

- **Node.js 18+** (the library uses native `fetch`)
- **npm** (or a compatible package manager)
- For E2E tests: platform credentials (see [Credentials](#credentials-for-e2e-tests))

---

## Getting started

1. **Fork and clone** the repo:
   ```bash
   git clone https://github.com/<your-username>/all-social-media-api.git
   cd all-social-media-api
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Copy the example env file** (for local dev and E2E tests):
   ```bash
   cp .env.example .env
   ```
   Edit `.env` and add tokens for the platforms you want to test. The library does not read `.env` by default; you pass config (e.g. from `process.env`) into the client.

4. **Build the project:**
   ```bash
   npm run build
   ```
   This produces `dist/` (ESM and CommonJS). The example and E2E tests use the built output.

---

## Development workflow

| Command | Description |
|--------|-------------|
| `npm run build` | Compile TypeScript to `dist/` (ESM + CJS) |
| `npm run example` | Build and run `examples/post-once.ts` (uses `.env`) |
| `npm run test` | Run Vitest (unit tests, if any) |
| `npm run test:e2e` | Run E2E tests (requires `.env` and `npm run build` first) |
| `npm run prepublishOnly` | Runs before publish (builds the package) |

**Try the example:** After filling `.env`, run `npm run example` to post once to the platforms you configured. You can override content with `POST_IMAGE_URL`, `POST_CONTENT`, `POST_HASHTAGS` in `.env`.

---

## Project structure

| Path | Purpose |
|------|---------|
| `src/` | TypeScript source (client, platforms, types, utils) |
| `dist/` | Build output (generated; ESM + CJS) |
| `examples/` | Example script (`post-once.ts`) |
| `tests/` | E2E tests and test config helpers |
| `docs/` | Additional documentation (if present) |

**Key files:** `src/client.ts` (main client), `src/platforms/*.ts` (Meta, Instagram, LinkedIn, Threads), `src/types.ts` (public types), `src/index.ts` (exports).

---

## Running tests

### Unit tests

```bash
npm run test
```

### E2E tests

E2E tests in `tests/` hit real platform APIs. They skip platforms that don’t have credentials in `.env`.

1. **Build first:** `npm run build`
2. **Configure:** Copy `.env.example` to `.env` and set the variables for the platforms you use (see `.env.example` and [README – Credentials & token setup](README.md#credentials--token-setup)).
3. **Run:**
   ```bash
   npm run test:e2e
   ```

**Notes:**

- Post links from E2E runs are printed to the terminal and appended to `.e2e-post-links.txt` (gitignored).
- To run the Meta ads creation test (creates a real paused ad), set `RUN_META_ADS=1` in `.env`.
- If Instagram fails with "Only photo or video can be accepted", set `POST_IMAGE_URL` in `.env` to a direct image URL (e.g. `https://placehold.co/800x600.png`).

---

## Submitting changes

1. **Create a branch** from `main` (e.g. `fix/threads-retry`, `feat/linkedin-poll`).
2. **Make your changes** and ensure:
   - `npm run build` succeeds.
   - `npm run test` passes (and `npm run test:e2e` for code that touches platform APIs, if you have credentials).
3. **Update the changelog** in `CHANGELOG.md` under an `[Unreleased]` or version heading (see [Versioning](#versioning)).
4. **Open a pull request** against the upstream `main` branch. Describe what changed and why; link any related issues.

Please don’t commit `.env`, `dist/`, or other entries listed in `.gitignore`.

---

## Versioning

We follow [semver](https://semver.org/):

- **Patch:** Bug fixes (e.g. 1.0.2 → 1.0.3).
- **Minor:** New optional params/features, backward-compatible (e.g. 1.0.2 → 1.1.0).
- **Major:** Breaking changes (e.g. 1.0.2 → 2.0.0).

All notable changes are documented in [CHANGELOG.md](CHANGELOG.md). When contributing, add your changes there under the appropriate heading.

---

## Code and design notes

- **Config:** The library never reads `process.env` itself; callers pass a config object (from env, secrets, or elsewhere). Keep that contract.
- **Dual format:** The package ships both ESM and CommonJS; avoid breaking either.
- **Platform codes:** `"f"` (Facebook), `"i"` (Instagram), `"l"` (LinkedIn), `"t"` (Threads). Used in `postOn`, `channels`, and related APIs.
- **Errors:** Use the existing `SocialPostingError` and error handling patterns in `src/lib/request.ts` and the platform modules.

---

## License

By contributing, you agree that your contributions will be licensed under the same [MIT License](LICENSE) as the project.
