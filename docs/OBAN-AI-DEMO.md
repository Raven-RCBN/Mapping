# OBAN assistant demo

Decision Support → AI assistant provides explicit deterministic sample and metered live modes. Sample explanations use dated evidence and do not analyse the typed question. Live requests explain existing evidence; they cannot import production, alter maps, assign work, notify people or run arbitrary tools. Initial actions: map questions over ranked production evidence, forecast explanation, estate briefing and inspection-note classification/action drafts. Photo analysis is not enabled.

The existing local yield model remains authoritative for numerical forecasts. Both assistant and cards use `modelRecommendations` to select the same model/baseline for each horizon. Evidence is limited to 12 ranked source records plus the existing forecast snapshot. Responses include source IDs and dates. Unknown or unmapped blocks cannot be highlighted; incomplete coverage and historical accuracy remain visible. This is not a general database chat interface. Personnel records are not selected.

## Server configuration

Set these only in the existing protected server environment (never frontend or Git):

```
OPENAI_API_KEY=<dedicated server key>
OPENAI_PROJECT_ID=<dedicated OBAN project>
MAPPING_AI_LIVE_ALLOWED=true
MAPPING_AI_STATE_DIR=/home/deploy_mapping/app/data/ai
```

Unset credentials or an unset/false environment guard fail closed. Persistent admin enablement is independently off on first use. Only an authenticated administrator with OBAN access can turn it on/off. Sample mode remains available while paused. Pause prevents subsequent dispatches; requests already dispatched can finish and settle. There are no background provider requests.

Authenticated routes under the configured API namespace:

- `GET /ai/status?estateId=<OBAN>`: availability, admin capability and budget.
- `PATCH /ai/settings`: `{estateId,enabled}`; admin only.
- `POST /ai/run`: `{estateId,action,mode,question,block,requestId}`. Non-GET calls require the existing `X-Mapping-Client: 1` header. Only OBAN's fixed estate ID is allowed, with normal estate ACL checks.

## Budget and failure behavior

The application hard cap is **US$100 per UTC calendar month**, shared by all OBAN users. There is no UI or environment override to increase it. More budget requires owner permission and a reviewed implementation/configuration change. The application does not control charges from other apps or keys; configure the dedicated provider project independently too.

Before dispatch, reserve the maximum bounded text request cost in integer nanodollars. Input is at most16,000 UTF-8 bytes including instructions, with a conservative24,000-token reservation covering framing; output is capped at1,800 tokens including reasoning. Only standard-tier `gpt-6-luna` and `gpt-6.1-sol` are allowed. No tools, images, conversation chaining or retries are sent. Prices were checked on2026-10-17; the input allowance includes the higher1.25× cache-write rate. Live calls fail closed after2026-11-17 pending price review. Sources: [pricing](https://developers.openai.com/api/docs/pricing), [Luna](https://developers.openai.com/api/docs/models/gpt-6-luna).

Atomic filesystem locking serializes reservations, pause and dispatch across workers using the same local state directory. The ledger is fsynced, atomically renamed and directory-synced before dispatch. A pause is rechecked under the dispatch lock. Reservations crossing a UTC month boundary are cancelled before dispatch; settlement remains in the original month. Provider usage settles successful requests. Unknown outcomes retain the full reservation and cannot automatically resend. Provider credit/rate failures do not trigger retry or top-up. Ten live requests per user per minute and one pending request per user are allowed. A user initiating a new request after an unknown outcome is a separate explicit request.

Request IDs are hashed with authenticated identity, bound to the exact request/evidence hash, and retained across months. Identical completed retries return the stored result without provider spend. Changed evidence under the same ID is rejected. The ledger stores result drafts, usage and identity; protect and back it up as private application data. This demo's usage state is outside estate archives; an estate restore must not restore an older usage ledger.

## Operator recovery

Keep `ledger.json` and the `initialized` marker together, with owner-only permissions. A missing ledger after initialization, corrupt state or unreleased lock fails closed. Never delete/reset the ledger to resume usage. On a crashed lock, stop all AI-serving workers, confirm no provider request remains in progress, preserve the ledger/marker, and only then remove the stale empty `ledger.lock` directory. Unknown reservations remain charged. Restart paused and verify status. Restoring an old budget backup can allow duplicate spend; reconcile with provider usage before resuming.

## Validation

`node --test apps/api/test/ai.test.js` covers cross-worker cap reservations, pause/dispatch ordering, metered settlement, unknown retention, rate limiting, idempotency, UTC rollover, missing-ledger failure, roles/estate scope, sample no-spend behavior, provider credit failures and matching forecast baseline selection. `pnpm check` covers the full app and frontend build. The local fixture preview exposes the same assistant service with no credentials and a separate temporary ledger.

## Live acceptance, 17 October 2026

The two explicitly approved F5 requests did not produce a live answer. The second returned provider400, `unsupported_value` at `reasoning.effort`. The original `none` setting is unsupported by GPT-6.1 Sol. Both models now use supported `low` effort; the1,800-token output cap still includes reasoning. Official model pages: [Sol](https://developers.openai.com/api/docs/models/gpt-6.1-sol), [Luna](https://developers.openai.com/api/docs/models/gpt-6-luna). Provider rejection now pauses live AI automatically and logs only fixed-vocabulary status/code/parameter diagnostics. Raw provider text is never exposed.

Two unknown reservations remain in the October ledger: US$0.0039 and US$0.078, total US$0.0819. They are conservative application charges, not confirmed provider spend. Do not reset them. Live AI is paused. Corrected live acceptance requires fresh explicit approval; no further provider requests were made while correcting the code.

## Structured response compatibility

Live responses now use strict Structured Outputs (`text.format.type=json_schema`) with four required fields, rather than legacy JSON mode. The input itself explicitly asks for JSON, as well as the instructions. The complete serialized provider payload, including schema, is checked against the16,000-byte bound. Budget, model allowlist and output-token caps are unchanged. Rejection logs include only allowlisted parameter/code, a fixed diagnostic category and a validated provider request ID; no raw provider error or evidence is logged. This compatibility correction still requires live acceptance before claiming the provider integration works.

Generic live compatibility checks subsequently passed for both allowed models with strict Structured Outputs. These used static empty evidence, no MongoDB connection and no estate-file reads, so they confirm provider transport and response parsing, not an actual OBAN answer. After the checks, live AI was restored to **on** to match the user's explicit latest preference. Conservative application usage was US$0.09117225, including the earlier retained failures; the US$100 cap remains unchanged. Existing failed frontend request IDs must be cleared by refreshing once before submitting a new request.
