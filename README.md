# Turbo-Next-Convex Template

### Package Manager: `pnpm`

## Use this template

```bash
npx create-turbo@latest --example https://github.com/nelwincatalogo/turbo-next-convex [project-name-here]
```

## Commands

```bash
# Run dev all apps
pnpm dev

# Run apps/web only
pnpm dev -F web

# Run build
pnpm build

# Check types, lint, and format
pnpm lint:fix
```

## Add new package

```bash
# apps/web
pnpm --filter web add date-fns

# packages/ui
pnpm --filter @repo/ui add date-fns
```

## Add new app

copy the content of `apps/web` to `apps/docs` and change the name of the app in `turbo.json` and `package.json`

OR

```bash
# apps/docs
pnpm create next-app docs --typescript
```

## What's inside?

This Turborepo includes the following packages/apps:

### Apps and Packages

- `web`: another [Next.js](https://nextjs.org/) app
- `@repo/ui`: a stub React component library with shadcn components shared by both `web` and `docs` applications
- `@repo/typescript-config`: `tsconfig.json`s used throughout the monorepo

Each package/app is 100% [TypeScript](https://www.typescriptlang.org/).

### Remote Caching

> [!TIP]
> Vercel Remote Cache is free for all plans. Get started today at [vercel.com](https://vercel.com/signup?/signup?utm_source=remote-cache-sdk&utm_campaign=free_remote_cache).

Turborepo can use a technique known as [Remote Caching](https://turborepo.dev/docs/core-concepts/remote-caching) to share cache artifacts across machines, enabling you to share build caches with your team and CI/CD pipelines.

By default, Turborepo will cache locally. To enable Remote Caching you will need an account with Vercel. If you don't have an account you can [create one](https://vercel.com/signup?utm_source=turborepo-examples), then enter the following commands:

```

cd my-turborepo

# With [global `turbo`](https://turborepo.dev/docs/getting-started/installation#global-installation) installed (recommended)

turbo login

# Without [global `turbo`](https://turborepo.dev/docs/getting-started/installation#global-installation), use your package manager

npx turbo login
pnpm exec turbo login

```

This will authenticate the Turborepo CLI with your [Vercel account](https://vercel.com/docs/concepts/personal-accounts/overview).

Next, you can link your Turborepo to your Remote Cache by running the following command from the root of your Turborepo:

```

# With [global `turbo`](https://turborepo.dev/docs/getting-started/installation#global-installation) installed (recommended)

turbo link

# Without [global `turbo`](https://turborepo.dev/docs/getting-started/installation#global-installation), use your package manager

npx turbo link
pnpm exec turbo link

```

## Useful Links

Learn more about the power of Turborepo:

- [Tasks](https://turborepo.dev/docs/crafting-your-repository/running-tasks)
- [Caching](https://turborepo.dev/docs/crafting-your-repository/caching)
- [Remote Caching](https://turborepo.dev/docs/core-concepts/remote-caching)
- [Filtering](https://turborepo.dev/docs/crafting-your-repository/running-tasks#using-filters)
- [Configuration Options](https://turborepo.dev/docs/reference/configuration)
- [CLI Usage](https://turborepo.dev/docs/reference/command-line-reference)
