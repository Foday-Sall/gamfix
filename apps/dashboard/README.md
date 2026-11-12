# Staff / admin dashboard

**Dist snapshot only — the source code for this app was lost** when the dev
environment was reset (it was built in a separate phase and never pushed).
The files here are the exact compiled build that currently serves production
at `/dash/`.

Deploy (no build step needed):

```bash
./scripts/deploy_vps_ui.sh dashboard      # -> /opt/gamfix-pocket/dash
# or with Docker: it is baked into the web image automatically
```

Treat this folder as precious — it cannot be regenerated.
