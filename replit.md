# SurgeAir AI

An omnichannel airline passenger assistant that finds disruption alternatives and performs simulated rebooking only after explicit confirmation.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — run the API server (port 5000)
- `pnpm --filter @workspace/surgeair-ai run dev` — run the React dashboard through its managed workflow
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm run build` — typecheck + build all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- No AWS credentials are required for the Milestone 1 demo

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- API: Express 5
- DB: PostgreSQL + Drizzle ORM
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Build: esbuild (CJS bundle)

## Where things live

- `artifacts/surgeair-ai` — operations dashboard and passenger messaging simulator
- `artifacts/api-server/src/surgeair` — simulated state and replaceable delivery services
- `artifacts/api-server/src/routes/surgeair.ts` — API route handlers
- `lib/api-spec/openapi.yaml` — source of truth for the API contract

## Architecture decisions

- Milestone 1 uses realistic simulated records and communication delivery.
- Rebooking is deterministic and requires a true explicit-confirmation flag.
- Conversation state is isolated behind an in-memory store so DynamoDB can replace it later.
- Itinerary delivery uses an interface so Amazon SES can replace the simulator.
- All communication enters through normalized channel adapters and a message orchestrator.
- Airline operations are registered as structured agent tools for future Bedrock AgentCore invocation.
- Operational events and logs are separated for later CloudWatch and analytics integration.

## Product

- Track the SA204 disruption and passenger booking SG4821.
- Continue one passenger conversation across SMS, WhatsApp, RCS, and email.
- Search alternatives satisfying an arrival-before constraint.
- Select, confirm, and execute a simulated rebooking to SA218.
- Simulate updated itinerary delivery and show agent activity.

## User preferences

- Demo passenger is Draymond Hillsend.
- The app must feel like a polished hackathon prototype, not a generic chatbot.

## Gotchas

- Regenerate API hooks and Zod schemas after every OpenAPI change.
- Never display an alternative as the confirmed current flight before the rebooking API succeeds.

## Pointers

- See the `pnpm-workspace` skill for workspace structure, TypeScript setup, and package details
