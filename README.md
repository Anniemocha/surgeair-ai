# SurgeAir AI

SurgeAir AI is an AI-powered omnichannel airline passenger assistant built for an AWS Communication Developer Services hackathon. This Milestone 1 MVP demonstrates how an airline can detect a disruption, understand a passenger's arrival-time constraint, find suitable alternatives, require explicit confirmation, complete a simulated rebooking, and send an updated itinerary.

All airline records and communications in this project are simulated.

## Problem

When a flight disruption occurs, passengers often repeat the same information across channels and wait for an agent to interpret their needs. SurgeAir AI maintains one conversation state across channels and guides the passenger through a safe recovery flow without changing a booking from an inferred preference.

## Demo passenger

- Passenger: Draymond Hillsend
- Booking reference: SG4821
- Route: Lisbon (LIS) to Edinburgh (EDI)
- Original flight: SA204
- Status: Delayed by 3 hours
- Requirement: “I need to arrive in Edinburgh before 6 PM.”

The mock inventory includes:

- SA218 — departs 11:30, arrives 14:40
- SA226 — departs 13:10, arrives 16:20

Both alternatives satisfy the arrival-before-18:00 constraint.

## Demo workflow

1. SurgeAir AI notifies Draymond about the SA204 delay through simulated SMS.
2. Draymond states his arrival-time requirement.
3. The assistant retrieves SG4821 and checks SA204.
4. It extracts the arrival-before-18:00 constraint.
5. It finds and presents SA218 and SA226.
6. Draymond selects SA218 through the simulated RCS/WhatsApp experience.
7. SurgeAir AI asks for explicit confirmation.
8. Only after “Yes, confirm” does the backend change SG4821 from SA204 to SA218.
9. The app generates an updated itinerary and simulates email delivery.
10. The operations dashboard records the workflow.

## Architecture

The project is a pnpm TypeScript workspace:

- `artifacts/surgeair-ai` — React and Vite operations dashboard plus passenger messaging simulator
- `artifacts/api-server` — Express API with SurgeAir domain services and in-memory demo state
- `lib/api-spec` — OpenAPI source of truth
- `lib/api-client-react` — generated React Query hooks
- `lib/api-zod` — generated Zod request and response validation

The server separates the mock data store and itinerary delivery interface from the HTTP routes. The itinerary sender can later be replaced by Amazon SES, and conversation state can move from the in-memory store to DynamoDB.

## API operations

- `GET /api/dashboard` — current disruption, passenger, conversation, and agent activity
- `GET /api/bookings/{bookingReference}` — `getBooking`
- `GET /api/flights/{flightNumber}/status` — `getFlightStatus`
- `GET /api/flights/alternatives` — `searchAlternativeFlights`
- `POST /api/bookings/rebook` — `rebookFlight`; rejects requests without explicit confirmation
- `POST /api/itinerary/send` — `sendItinerary`; simulates itinerary delivery

## Local development

Run the managed workflows for:

- `artifacts/api-server: API Server`
- `artifacts/surgeair-ai: web`

Useful checks:

```bash
pnpm --filter @workspace/api-spec run codegen
pnpm run typecheck
```

No AWS credentials are required for Milestone 1.

## AWS migration plan

| Milestone 1 component | AWS target |
| --- | --- |
| Conversation and workflow logic | Amazon Bedrock and Amazon Bedrock AgentCore |
| Express API operations | AWS Lambda and Amazon API Gateway |
| In-memory conversation state | Amazon DynamoDB |
| Simulated SMS, WhatsApp, and RCS | AWS End User Messaging and Amazon SNS |
| Simulated itinerary email | Amazon SES |
| Application logs and workflow telemetry | Amazon CloudWatch |

The OpenAPI contract and service interfaces are designed to keep the frontend stable while these local implementations are replaced.

## AWS Architecture

Milestone 1.5 introduces replaceable adapters around every future AWS boundary while keeping all runtime behavior local:

| Current implementation | Future AWS implementation |
| --- | --- |
| `LocalModelProvider` | Amazon Bedrock and Amazon Bedrock AgentCore |
| `ConversationRepository` | Amazon DynamoDB |
| `SmsChannel` | AWS End User Messaging SMS |
| `WhatsAppChannel` | AWS End User Messaging Social |
| `RcsChannel` | AWS End User Messaging RCS |
| `EmailChannel` | Amazon SES |
| `OperationalLogger` | Amazon CloudWatch |
| Airline tool routes | AWS Lambda and Amazon API Gateway |

The message path is:

```text
Passenger
  → Channel Adapter
  → Message Orchestrator
  → Conversation Repository
  → Model Provider / SurgeAir Agent
  → Airline Tool Registry
  → Channel Adapter
  → Passenger
```

Incoming messages use one normalized structure regardless of channel. The in-memory conversation repository preserves the passenger, booking, route, extracted constraint, selected flight, confirmation state, messages, and channel transitions. The internal event store records important workflow events in a form that can later feed AWS analytics or event infrastructure.

The architecture is informed by the patterns in:

- AWS Chat Orchestrator for Generative AI Conversations
- AWS Engagement Database and Analytics Sample for End User Messaging and SES
- AWS Generative AI Email Categorization using SES Mail Manager

Their separation of channel ingress, orchestration, state, model execution, tools, delivery, and observability is used as guidance; no sample code is copied directly.

Configuration placeholders are documented in `.env.example`. They contain no credentials and all AWS feature flags default to disabled.

## Amazon Bedrock Integration

SurgeAir supports two interchangeable language-understanding providers behind the same `ModelProvider` interface:

- `LocalModelProvider` is the default deterministic development provider and remains the safe fallback.
- `BedrockModelProvider` uses the Amazon Bedrock Converse API with Amazon Nova 2 Lite to extract passenger intent, destination, arrival constraints, selected flight, recommended tool, and confirmation requirements.

Provider selection is controlled by `MODEL_PROVIDER`:

```text
MODEL_PROVIDER=local
```

Set it to `bedrock` only after the connectivity test succeeds. The server-side Bedrock configuration uses:

- `AWS_BEARER_TOKEN_BEDROCK` — secret bearer token; never exposed to the frontend or committed
- `AWS_REGION` — Bedrock region, currently `eu-north-1`
- `BEDROCK_MODEL_ID` — inference profile, currently `eu.amazon.nova-2-lite-v1:0`
- `MODEL_PROVIDER` — `local` or `bedrock`; defaults to `local`

Run the safe connectivity check with:

```bash
pnpm --filter @workspace/api-server run test:bedrock
```

Nova 2 Lite performs language understanding and decision extraction only. The SurgeAir backend remains authoritative for tool execution and booking mutations. Selecting a flight creates a pending confirmation state; the backend independently requires a matching pending selection and a later explicit confirmation before `rebookFlight` can change a booking.

## Safety boundaries

- Rebooking requires explicit passenger confirmation.
- The app uses simulated airline data only.
- It does not process payments or collect passport information.
- No credentials or secrets are exposed to the frontend.

## Hackathon use case

The demo shows a single passenger journey continuing across simulated SMS, WhatsApp, RCS, and email while maintaining one context. It combines AI-assisted intent and constraint handling with deterministic booking safeguards, making the prototype suitable for demonstrating a future AWS-native passenger recovery platform.