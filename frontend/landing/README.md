# GamFix landing page

The public marketing site (React + Vite + Tailwind CSS). It makes no API calls
and needs no environment variables.

- It owns the root of the site (`/`) on Vercel.
- `/privacy` and `/terms` are rendered by `src/Legal.tsx`.
- Links into the app point to `/app/login` and `/app/track` (the web app in
  `frontend/web`).

Run locally:

```
npm install
npm run dev
```

`npm run build` in the `frontend/` folder builds the whole site
(`frontend/build-site.mjs`). To build this page on its own, run `npm run build`
here.
