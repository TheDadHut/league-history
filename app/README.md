# GDL History — React app

Vite + React 19 + TypeScript scaffold for the new version of the GDL history site. Built incrementally per the migration plan; the legacy `index.html` at the repo root is the live site until the migration completes.

## Prerequisites

- Node 20 (see `.nvmrc` at the repo root). `nvm use` from the repo root if you have nvm.

## Scripts

```bash
npm install      # install deps
npm run dev      # start the dev server on http://localhost:5173
npm run build    # type-check + production build into dist/
npm run preview  # serve dist/ locally to spot-check the prod build
```

## Notes

- `vite.config.ts` sets `base: '/league-history/'` so the prod build matches the GitHub Pages subpath. The dev server at `localhost:5173` serves at that subpath too.
- Routing uses `HashRouter` to keep deep links working on Pages without a SPA-fallback workflow.
- TypeScript is strict (`tsconfig.app.json` and `tsconfig.node.json` both set `strict: true`).
