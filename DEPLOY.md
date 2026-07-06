# Deploying Forma Web to Azure Static Web Apps

This app deploys to **Azure Static Web Apps (Free SKU)** via GitHub Actions
([`.github/workflows/azure-deploy.yml`](.github/workflows/azure-deploy.yml)). The workflow
builds the Vite app (injecting `VITE_*` from GitHub secrets) and uploads `dist/` to your
Static Web App on every push to `main`; pull requests get a temporary preview environment.

> **One-time setup** is below. After it's done, deploys are automatic on push to `main`.

## What you'll create / configure

1. An Azure **Static Web App** (Free SKU).
2. A **deployment token** from that resource → stored as a GitHub secret.
3. Four **`VITE_*` app config** values → stored as GitHub secrets (baked into the bundle at build).
4. **CORS** on the backend so the deployed origin can call the API.

---

## Prerequisites

- An **Azure account** (Free SKU has no cost).
- This project pushed to a **GitHub repo** with the default branch `main`.
- Optional: the **Azure CLI** (`az`) with the Static Web Apps extension:
  ```bash
  az extension add --name staticwebapp
  az login
  ```

> ⚠️ **Don't let Azure auto-generate a workflow.** When you create a Static Web App and link a
> GitHub repo in the portal, Azure commits *its own* workflow file and overwrites intent.
> This repo already ships a workflow, so create the app with deployment source **"Other"**
> (portal) or **`--login-with-github` omitted** (CLI), then wire the token up manually as below.

---

## Step 1 — Create the Static Web App (Free SKU)

### Option A — Azure Portal

1. Portal → **Create a resource** → search **Static Web App** → **Create**.
2. **Basics:**
   - *Subscription / Resource group*: pick or create one (e.g. `rg-forma`).
   - *Name*: e.g. `forma-web` (this becomes `https://<name>.azurestaticapps.net`).
   - *Plan type*: **Free**.
   - *Region*: closest to your users.
   - *Deployment source*: **Other** ← important (do **not** pick GitHub here).
3. **Review + create** → **Create**.
4. When it's done, open the resource. You'll grab its token in Step 2.

### Option B — Azure CLI

```bash
# Create the resource group (skip if you have one)
az group create --name rg-forma --location eastus2

# Create the Static Web App (Free SKU, no GitHub link — we deploy from our own workflow)
az staticwebapp create \
  --name forma-web \
  --resource-group forma-fitness \
  --location westeurope \
  --sku Free
```

The resource's default hostname is `https://green-rock-04e044103.7.azurestaticapps.net`
(shown as `defaultHostname` in the create output).

---

## Step 2 — Get the deployment token

This token authorizes the GitHub Action to upload builds.

### Portal
Open the Static Web App → left nav **Overview** → **Manage deployment token** →
copy the value.

### CLI
```bash
az staticwebapp secrets list \
  --name forma-web \
  --resource-group rg-forma \
  --query "properties.apiKey" -o tsv
```

Keep this value handy for Step 3. Treat it like a password.

---

## Step 3 — Add GitHub secrets

In the GitHub repo → **Settings → Secrets and variables → Actions → New repository secret**.
Add **all five**:

| Secret name | Value |
|---|---|
| `AZURE_STATIC_WEB_APPS_API_TOKEN` | The deployment token from Step 2 |
| `VITE_SUPABASE_URL` | Your Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Supabase **publishable** key |
| `VITE_API_BASE_URL` | Deployed backend base, e.g. `https://<func-app>.azurewebsites.net/api` |
| `VITE_AZURE_FUNCTION_KEY` | The Azure Functions key |

> The `VITE_*` values are **inlined into the client bundle** at build time (they are public
> client secrets — the Supabase publishable key and Function key ship in the mobile app too).
> The workflow reads them under the `Build application` step's `env:`.

> The workflow references the secret name **`AZURE_STATIC_WEB_APPS_API_TOKEN`** exactly. If you
> prefer a different name, update it in [`.github/workflows/azure-deploy.yml`](.github/workflows/azure-deploy.yml).

---

## Step 4 — Point the API at the deployed backend

Set the `VITE_API_BASE_URL` secret to your **deployed** Azure Functions URL (not `localhost`):

```
https://<your-function-app>.azurewebsites.net/api
```

Then allow the Static Web App origin on the backend (**CORS**). In the Function App:

- Portal → Function App → **API → CORS** → add `https://forma-web.azurestaticapps.net`
  (and any custom domain), or
- CLI:
  ```bash
  az functionapp cors add \
    --name <your-function-app> \
    --resource-group <func-rg> \
    --allowed-origins https://forma-web.azurestaticapps.net
  ```

> Locally the backend uses `Host.CORS: "*"`, but the deployed Function App enforces its own CORS
> list — the deployed SWA origin must be added or API calls will fail in the browser.

---

## Step 5 — Deploy

Push to `main` (or re-run the workflow from the **Actions** tab):

```bash
git push origin main
```

Watch **Actions → Build and Deploy to Azure Static Web App**. On success the app is live at:

```
https://forma-web.azurestaticapps.net
```

Sign in with a Supabase account to verify auth → dashboard → coach chat round-trips.

---

## How the pieces fit

- **SPA routing:** [`public/staticwebapp.config.json`](public/staticwebapp.config.json) sets a
  `navigationFallback` to `/index.html` so React Router deep links (e.g. `/coach`, `/workout/monday`)
  and page refreshes resolve instead of 404-ing. Vite copies it into `dist/` at build.
- **Build artifact:** the workflow runs `npm run build` and deploys `dist/` with
  `skip_app_build: true`, so Azure's Oryx builder does **not** rebuild — our env-injected bundle
  is shipped as-is.
- **PR previews:** opening a PR against `main` publishes a temporary staging URL; closing the PR
  runs the `close_pull_request` job to tear it down. Both are free.

---

## Optional — custom domain

Static Web App → **Custom domains → Add** → follow the CNAME/TXT validation. Free SKU supports
custom domains with managed TLS. Remember to also add the custom domain to the backend CORS list
and (if it changes the canonical origin) update anything that pins the URL.

---

## Troubleshooting

| Symptom | Fix |
|---|---|
| Action fails at deploy step, "No matching Static Web App / bad token" | `AZURE_STATIC_WEB_APPS_API_TOKEN` secret missing or stale — re-copy from **Manage deployment token**. |
| App loads but API calls fail with CORS errors | Add the SWA origin to the Function App CORS list (Step 4). |
| Refreshing `/coach` (or any route) returns 404 | Ensure `dist/staticwebapp.config.json` exists after build (it's in `public/`); confirm `navigationFallback`. |
| Login works but data is empty / 401 | Check `VITE_API_BASE_URL` points at the deployed backend and `VITE_AZURE_FUNCTION_KEY` is correct. |
| Azure committed its own `.github/workflows/azure-static-web-apps-*.yml` | You linked GitHub during creation. Delete that file, keep `azure-deploy.yml`, and recreate the app with source **Other** if needed. |
