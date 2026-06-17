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

Routine UI deploy:

```sh
./deploy.sh
```

When variant/frequency/gene/dataset/cohort/population data changes, refresh the remote
default explore cache:

```sh
bun run db:refresh-stats:remote
```

The deploy script verifies the required `explore:*` cache rows by default. For a
data-changing deploy, use:

```sh
DATA_CHANGED=1 ./deploy.sh
```

Normal D1 Sessions/read replicas reduce global read latency; the `stats` cache avoids
running expensive default explore queries at all. They are complementary.
