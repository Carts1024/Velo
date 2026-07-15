This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/create-next-app).

## Getting Started

First, run the development server:

```bash
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load Inter, a custom Google Font.

## Sprint 10 observability

All public/provider route methods use the shared `withRouteTelemetry` boundary. Responses include `X-Correlation-Id` and the compatibility `X-Request-Id`; accepted payment intents also expose a durable journey ID. The server-only instrumentation hook exports sampled traces, unsampled metrics, and sanitized logs over OTLP without blocking request completion.

Set `VELO_OTEL_ENABLED=true` and configure `VELO_OTEL_EXPORTER_OTLP_ENDPOINT`. Optional server-only settings are `VELO_OTEL_EXPORTER_OTLP_AUTHORIZATION`, `VELO_OTEL_SUCCESS_SAMPLE_RATIO`, `VELO_OTEL_SERVICE_NAME`, `VELO_RELEASE_VERSION`, and `VELO_UI_TELEMETRY_INTAKE_SECRET`. Do not expose any of these as `NEXT_PUBLIC_*` values.

Sprint 10 is **IMPLEMENTED — LIVE EVIDENCE PENDING**. See the repository [architecture](../../docs/architecture/sprint-10-end-to-end-observability-and-redaction.md), [runbook](../../docs/operations/sprint-10-observability-and-redaction-runbook.md), and [evidence report](../../docs/references/sprint-10-observability-redaction-and-overhead-report.md).

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
