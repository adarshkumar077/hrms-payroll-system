# Playbook: add an AI capability

The AI layer is provider-agnostic and must **always degrade to a local heuristic** (design law, `PRODUCT.md`). Copy the shape of `scoreLead` in `lib/ai.ts`.

## Steps
1. Add an exported async fn to `lib/ai.ts`:
   - `if (aiEnabled) { try { const out = await complete(system, user, maxTokens); ...parse... return } catch { /* fall through */ } }`
   - then a deterministic `heuristic…()` fallback that returns a sane result with no LLM. Never throw to the caller.
   - For JSON output, prompt for compact JSON and extract with `txt.match(/\{[\s\S]*\}/)`.
2. Surface it human-in-the-loop: a `"use client"` card + a `"use server"` action. Copy `app/(app)/ai/CallSummarizerCard.tsx` + `app/(app)/ai/actions.ts`. Never auto-send/auto-commit — return a suggestion the user confirms.
3. If it answers a data question instead, add a fixed intent to `lib/copilot.ts` (INTENTS registry) — do NOT let the LLM write queries.

## Files to touch
`lib/ai.ts` (+ optional `lib/copilot.ts`), a card + action under `app/(app)/ai/` or the relevant module.

## Verify
`npm run build`; then in-app trigger it. Header badge shows the live provider; temporarily unset `LLM_API_KEY` and confirm the heuristic fallback still returns a result.
