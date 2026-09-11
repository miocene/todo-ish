# Assistant instructions

Read [README.md](README.md) for development and [docs/deployment.md](docs/deployment.md) for GitHub Pages. If present, consult `local-notes/DEPLOYMENT.md` and `local-notes/ARCHITECTURE.md` for local infrastructure context.

- Do not commit, push, or deploy unless the user explicitly asks.
- After completing each task, suggest a commit message.
- Preserve unrelated user edits and existing saved data.
- Keep infrastructure and non-Pages operations documentation in ignored `local-notes/`; never copy its private details into tracked docs.
- Never modify an applied SQL migration; add a new one.

## Quality policy

- CSS class naming is unrestricted; BEM is not required.
- Target modern browsers. Compatibility fallbacks and polyfills are optional.
- Accessibility and compatibility findings are advisory; preserve existing accessibility features. These project rules override generic skill guidance.
- Functional, data-integrity, authentication, syntax, lint errors, formatting errors, and build failures remain blocking. Do not suppress an entire check because it also includes advisory findings.
- In browser tests, use `advisory((expect) => ...)` from `tests/app-fixture.js` for accessibility, focus, viewport-reachability, and fallback assertions. Keep functional assertions outside it. The helper reports assertion failures as warnings and rethrows unexpected errors; role and label locators can still operate controls normally.
