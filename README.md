# sv

Everything you need to build a Svelte project, powered by [`sv`](https://github.com/sveltejs/cli).

## Creating a project

If you're seeing this, you've probably already done this step. Congrats!

```sh
# create a new project
npx sv create my-app
```

To recreate this project with the same configuration:

```sh
# recreate this project
bun x sv@0.15.1 create --template minimal --types ts --add tailwindcss="plugins:none" --install bun biobank-v2
```

## Developing

Once you've created a project and installed dependencies with `npm install` (or `pnpm install` or `yarn`), start a development server:

```sh
npm run dev

# or start the server and open the app in a new browser tab
npm run dev -- --open
```

## Building

To create a production version of your app:

```sh
npm run build
```

You can preview the production build with `npm run preview`.

> To deploy your app, you may need to install an [adapter](https://svelte.dev/docs/kit/adapters) for your target environment.

## BioVault Ops

Local development starts Docker PostgreSQL and runs the Worker locally:

```sh
./dev.sh
```

Force a local Postgres reseed from normalized source data:

```sh
SEED=1 ./dev.sh
```

Production deploy builds the SvelteKit Worker and deploys it with the Hyperdrive
binding from `wrangler.jsonc`:

```sh
./deploy.sh
```

Preview deploy publishes a separate Worker on `*.workers.dev` (no custom domains).
It uses the same prod Hyperdrive binding, so treat it as live data:

```sh
./deploy-preview.sh
# or: bun run deploy:preview
```

Use `?tenant=` on the workers.dev URL, e.g. `?tenant=bipmed`.

The live database connection is stored in Cloudflare Hyperdrive. Local development
uses `DATABASE_URL` from `.env` when present, otherwise it falls back to the Docker
PostgreSQL URL:

```sh
postgresql://biovault_data_user:biovault_data_password@127.0.0.1:55432/biovault_data?sslmode=disable
```

## PostgreSQL Data

PostgreSQL is the only runtime database for local development and production.

To reseed the local Docker database from the normalized source data:

```sh
bun run db:pg:seed
```
