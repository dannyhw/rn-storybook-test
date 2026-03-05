# BuildIndex cache removal

## Research
- `buildStorybookIndex` in `src/utils/storybook-index.ts` cached the resolved `buildIndex` wrapper in `cachedBuildIndexFn`.
- The module is loaded via dynamic `import("@storybook/react-native/node")`, which is already cached by Node after first load.
- Additional function-level caching is unnecessary complexity.

## Plan
- Remove `cachedBuildIndexFn`.
- Resolve `buildIndex` inside `buildStorybookIndex` on each call and execute it directly.
- Keep existing error handling unchanged.

## Next steps
- Run build and typecheck to verify no regressions.
- If performance concerns appear later, profile before re-introducing any extra cache layer.
