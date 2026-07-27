# Sprint 5 Playground public-alpha evidence

Status: **CHROMIUM/FIREFOX AUTOMATED EVIDENCE COMPLETE — WEBKIT/MANUAL/LIVE
EVIDENCE PENDING**

Date: 2026-07-27

## Automated gates

| Gate | Result |
| --- | --- |
| Web Node tests | 40 of 40 test files passed |
| Backend Vitest | 20 files / 106 tests passed |
| Observability package | Package tests and typecheck passed |
| Focused Stellar | Codegen, argument, and specification tests passed |
| Web/backend/Stellar lint and typecheck | Passed without warnings |
| Production build | Passed |
| Playwright Chromium/Firefox | 4 of 4 flows passed at 320/768/1440 widths |
| axe serious/critical findings | Zero in Chromium and Firefox |
| Playwright WebKit | Blocked: host lacks `libavif16`; sudo is unavailable |
| Diff whitespace check | Passed |

The full Stellar suite retains the pre-existing isolated
`transaction-debugger.test.ts` process failure documented by Sprints 3 and 4.

## Manual and live gates

- [ ] Current/previous Chrome, Firefox, Safari, and Edge primary journey.
- [ ] Current iOS Safari and Android Chrome responsive smoke.
- [ ] VoiceOver and NVDA primary-state announcements.
- [ ] Live Freighter Testnet signature, submission, recovery, and retained hash.
- [ ] Product approval for the Testnet-first public alpha.

No unchecked gate may be described as verified. Automated success supports an
implemented-and-tested status; public-alpha qualification remains pending until
manual and live evidence is retained.
