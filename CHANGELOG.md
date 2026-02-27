# Changelog

All notable changes to this project will be documented in this file.

We follow [semver](https://semver.org/): **patch** = bug fixes; **minor** = new optional params/options and backward-compatible features; **major** = breaking changes.

## [1.0.0] - Initial release

- Cross-post to Facebook, Instagram, LinkedIn, and Threads.
- Config-driven API; optional `uploadImage` and `contentAdapter`.
- Meta (Facebook) optional ad creation with targeting.
- Dual ESM + CommonJS build; use `require()` in Firebase/Node CJS.
- **Retries:** `retries` and `retryDelayMs` in `crossPost` params for transient failures; `attempt` in `PlatformResult` and `maxAttempt` in `CrossPostResult`.
- **Richer results:** `permalink` and `postedAt` (ISO string) in `platformResults` when available.
- **MetaTargeting:** Exported type with JSDoc example for mapping your own targeting shape.
- **LinkedIn:** Support both `personUrn` and `organizationUrn` in config; choose at post time with `linkedinPostAs: "person" | "organization"`.
- **Content adapter:** Receives optional third argument `platformCode` (`"f"` | `"i"` | `"l"` | `"t"`) for switching without string-matching labels.
- **Upload image:** Optional `hint?: { platform?: string; postId?: string }` for building storage paths.
- **Progress:** Optional `progress: { onPlatformStart, onPlatformDone }` in client options for incremental UI or persistence. Platforms run in the order of `params.postOn`.

[1.0.0]: https://github.com/akash80/all-social-media-api/releases/tag/v1.0.0
