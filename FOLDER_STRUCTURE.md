# TalaKit Folder Structure

This document provides an overview of the TalaKit project folder structure, explaining the purpose and organization of each directory.

## Root Level

The root directory contains monorepo configuration and workspace-level files:

- **`package.json`** - Root workspace configuration defining build scripts, dev dependencies, and Node version requirements
- **`pnpm-workspace.yaml`** - Defines pnpm workspace configuration with app and package locations
- **`pnpm-lock.yaml`** - Dependency lock file for reproducible installs across all packages
- **`turbo.json`** - Turbo monorepo configuration defining task pipelines and caching strategies
- **`README.md`** - Project overview and documentation
- **`.oxlintrc.json`** - OxLint (Rust-based linter) configuration for code quality checks
- **`.oxfmtrc.jsonc`** - OxFmt formatter configuration with import sorting and Tailwind CSS support
- **`.npmrc`** - NPM/pnpm registry configuration
- **`.gitignore`** - Git ignore patterns
- **`.husky/`** - Git hooks configuration for pre-commit checks

## `/apps` - Applications

Contains consumer-facing applications built on the TalaKit platform.

### `/apps/web`

**Next.js 15+ frontend application** for the StellarKit developer dashboard.

```
web/
├── app/                    # Next.js App Router
│   ├── layout.tsx         # Root layout wrapper with providers
│   ├── page.tsx           # Home page
│   ├── todo/
│   │   └── page.tsx       # Todo feature page
│   ├── fonts/             # Custom font files
│   └── globals.css        # Global styles
├── core/
│   ├── config/
│   │   └── env.ts         # Environment variables configuration
│   ├── constants/
│   │   └── index.ts       # Application constants
│   └── providers/
│       └── convex-provider.tsx  # Convex provider setup
├── features/
│   └── todo/
│       └── todo.tsx       # Todo feature component
├── store/
│   ├── index.tsx          # State management setup
│   ├── persist.tsx        # Persistence logic
│   └── plugins/
│       └── localStored.tsx  # Local storage plugin
├── public/                # Static assets
├── next.config.js         # Next.js configuration
├── tsconfig.json          # TypeScript configuration
├── next-env.d.ts          # Next.js type definitions
└── package.json           # App-level dependencies
```

**Purpose:** Main web application for StellarKit dashboard, providing developer access to project verification, transaction debugging, event monitoring, and webhook configuration.

**Key Features:**
- Server-side rendering with Next.js
- Convex backend integration for real-time data
- Todo feature as reference implementation
- Local state management with persistence

## `/packages` - Shared Libraries

Contains reusable, shared packages used across applications.

### `/packages/backend`

**Convex backend** - Real-time database and backend logic for the StellarKit platform.

```
backend/
├── convex/
│   ├── schema.ts          # Database schema definition
│   ├── tasks.ts           # Background task definitions
│   ├── tsconfig.json      # TypeScript config for Convex functions
│   ├── README.md          # Backend documentation
│   └── _generated/        # Auto-generated types and API files
│       ├── api.d.ts       # TypeScript definitions for API
│       ├── api.js         # Generated API client
│       ├── dataModel.d.ts # Database model types
│       ├── server.d.ts    # Server-side function types
│       ├── server.js      # Server runtime files
│       └── ai/            # AI-related guidelines and state
├── package.json           # Backend dependencies
├── AGENTS.md              # Agent instructions for development
└── CLAUDE.md              # Claude-specific guidelines
```

**Purpose:** Backend infrastructure using Convex's real-time sync database. Handles:
- Data persistence and synchronization
- Soroban project registry logic
- Transaction and event processing
- Webhook delivery coordination

**Key Features:**
- Real-time database with automatic client sync
- TypeScript-first backend functions
- Server-side job scheduling and background tasks
- Generated type-safe API clients

### `/packages/typescript-config`

**Shared TypeScript configurations** used across all packages.

```
typescript-config/
├── base.json              # Base TypeScript configuration
├── nextjs.json            # Next.js-specific TypeScript config
├── react-library.json     # React library TypeScript config
└── package.json           # Package metadata
```

**Purpose:** Central location for TypeScript compiler options, ensuring consistency across all packages in the monorepo.

**Usage:** Other packages extend these configs via `extends` in their `tsconfig.json`:
- `base.json` - Core TypeScript settings (strict mode, module resolution)
- `nextjs.json` - Next.js optimizations and settings
- `react-library.json` - React component library configurations

### `/packages/ui`

**Shared UI component library** - Reusable React components for all applications.

```
ui/
├── src/
│   ├── components/
│   │   ├── common/
│   │   │   ├── icons/            # Icon components
│   │   │   └── loading/          # Loading state components
│   │   ├── samples/
│   │   │   ├── AlertDialogSample.tsx
│   │   │   ├── DialogSample.tsx
│   │   │   ├── ReactAlertSample.tsx
│   │   │   ├── responsive-dialog.tsx
│   │   │   └── template.tsx
│   │   ├── ui/                   # Base UI components (40+ components)
│   │   │   ├── accordion.tsx
│   │   │   ├── alert-dialog.tsx
│   │   │   ├── button.tsx
│   │   │   ├── card.tsx
│   │   │   ├── dialog.tsx
│   │   │   ├── form.tsx
│   │   │   ├── input.tsx
│   │   │   └── ...               # ~40 total components
│   │   └── ui-customs/           # Custom styled components
│   ├── hooks/
│   │   ├── use-media-query.tsx   # Responsive design hook
│   │   ├── use-mobile.ts         # Mobile detection
│   │   ├── useClientSide.tsx     # Client-side rendering guard
│   │   └── useLocalStorage.tsx   # Local storage hook
│   ├── lib/
│   │   └── utils.ts              # Utility functions (cn, clsx, etc.)
│   ├── styles/
│   │   └── globals.css           # Global styles and Tailwind setup
│   └── ui-providers.tsx          # Provider setup for UI components
├── components.json               # Component configuration
├── postcss.config.mjs            # PostCSS and Tailwind CSS config
├── tsconfig.json                 # TypeScript config
└── package.json                  # UI package dependencies
```

**Purpose:** Centralized, reusable component library built with:
- **Shadcn/ui** base components (accordion, alerts, buttons, cards, dialogs, forms, etc.)
- **Tailwind CSS** for styling
- **Custom hooks** for common functionality
- **Responsive design** utilities

**Key Features:**
- 40+ production-ready UI components
- Type-safe React components with TypeScript
- Tailwind CSS integration with custom configuration
- Responsive design utilities and media query hooks
- Sample components demonstrating usage patterns

## Development Workflow

### Monorepo Structure

The project uses **pnpm workspaces** and **Turbo** for efficient builds and task orchestration:

- **Dependencies** between packages are resolved through workspace protocols
- **Build pipeline** in `turbo.json` ensures correct build order
- **Shared configs** in `packages/typescript-config` are referenced by all packages
- **UI components** are imported by the web app as an internal dependency

### Environment Configuration

- **`apps/web/.env.local`** - Frontend environment variables
- **`packages/backend/.env.local`** - Convex backend secrets and API keys
- Root `.env*` files are loaded by turbo build tasks

## File Organization Best Practices

This project follows these organizational principles:

1. **Separation of Concerns** - Features, components, hooks, and utilities are organized by purpose
2. **Shared Libraries** - Common code lives in `/packages` and is versioned consistently
3. **Type Safety** - All packages use strict TypeScript with shared configs
4. **Scalability** - The monorepo structure supports adding new apps in `/apps` and new packages in `/packages`
5. **DRY Principle** - Reusable components and utilities prevent code duplication across the codebase

## Scripts

Available monorepo commands:

- **`pnpm dev`** - Start development servers for all packages
- **`pnpm build`** - Build all packages following dependency order
- **`pnpm lint:fix`** - Run linting and fix issues across all packages
- **`pnpm prepare`** - Setup Husky git hooks (auto-runs on install)

---

For more details on specific packages, refer to their individual `README.md` files.
