# SurgeAir AI

> One conversation. Every channel. A smoother journey.

**Live Demo:** [https://surge-air-ai-mvp.replit.app](https://surge-air-ai-mvp.replit.app)

This is the Replit-hosted deployment.

## How to try it

Open **https://surge-air-ai-mvp.replit.app/**, tap **Arrive before 18:00**, pick a flight, and confirm. Open the **Email** tab to preview the itinerary, then press **Reset Demo** to try again. Opening or refreshing the page does not send SMS. The first deliberate chat interaction starts the run; Reset Demo intentionally starts a fresh run. The passenger explore contains other simulated passenger details that can be tested for the demo.

## Public demo safeguards

The server enforces rolling limits: 20 chat messages per minute and 100 per 24 hours per IP; five booking confirmations and five email send attempts per hour per IP; three SMS attempts per hour per IP and 30 SMS attempts per 24 hours across the whole demo. Counters are shared in PostgreSQL, so restarting or scaling the server does not reset the budget. IP addresses are stored only as keyed hashes; usage records older than 24 hours are pruned. Limits never prevent Reset Demo, and an SMS limit skips AWS while preserving the in-app notification and booking flow. Both client and server cap passenger messages at 300 characters. Requests time out after 45 seconds and offer a friendly retry; provider exceptions are not returned to visitors.

Message → server-side AgentCore invocation (currently using direct Bedrock fallback when unavailable) → grounded intent → local airline tools → explicit passenger confirmation → server-side SMS/SES adapters → chat reply and email preview. Transport receipts, not chat bubbles, are evidence of AWS invocation. UI and automated tests use injected AWS clients or simulated providers; they must never send real SMS or email.

SurgeAir AI is an agentic, omnichannel airline passenger-assistance system built for the AWS Communication Developer Services hackathon. It helps a passenger recover from a flight disruption while preserving context across channels and keeping consequential booking actions behind an explicit-confirmation gate.

The demonstration focuses on one disruption and rebooking journey:

- Passenger: Draymond Hillsend
- Booking: SG4821
- Route: Lisbon (LIS) → Edinburgh (EDI)
- Original flight: SA204
- Disruption: three-hour delay
- Passenger constraint: “I need to arrive in Edinburgh before 6 PM.”

## The Problem

Airline disruption conversations are often fragmented across SMS, messaging apps, email, and support systems. During a time-sensitive disruption, passengers may have to repeat:

- booking references
- travel constraints
- selected alternatives
- previous conversation context

That repetition creates friction and increases the risk of an agent acting on incomplete information.

## The Solution

SurgeAir AI provides a context-aware passenger assistant that:

- maintains conversation state
- understands natural-language travel constraints
- retrieves booking information
- checks flight disruption state
- searches alternative flights
- remembers the selected alternative
- requests explicit confirmation before consequential actions
- performs controlled rebooking
- sends updated itinerary information
- supports an omnichannel passenger experience
- efficient real-time travel information, persistent context, and guided recovery actions in one experience.

The agent interprets the request, but the backend remains authoritative for tool execution and booking mutation.

## Demo Journey

The canonical demonstration uses booking SG4821, originally on delayed flight SA204.

1. SA204 is delayed by three hours.
2. The passenger receives a disruption notification.
3. The passenger says: “I need to arrive in Edinburgh before 6 PM.”
4. SurgeAir finds two suitable alternatives:
   - SA218 — 11:30 → 14:40
   - SA226 — 13:10 → 16:20
5. The passenger says: “Take SA218.”
6. SurgeAir records the selection but **does not rebook**.
7. SurgeAir asks for explicit confirmation.
8. The passenger says: “Yes, confirm.”
9. `rebookFlight` changes SG4821 from SA204 to SA218.
10. SurgeAir sends the updated itinerary through Amazon SES.

## Why Explicit Confirmation Matters

SurgeAir separates:

- understanding user intent; and
- authorization to perform consequential actions.

A flight selection is not authorization to rebook. The backend safety gate requires a matching pending selection and explicit confirmation before `rebookFlight` can mutate the booking.

Final end-to-end validation proved that:

- the booking remained on SA204 after “Take SA218”
- `rebookFlight` had not executed
- no final itinerary was sent before confirmation
- after “Yes, confirm”, the booking changed to SA218
- the updated itinerary was accepted through live Amazon SES

## AWS Architecture

The runtime path is:

```text
Passenger Channels
        ↓
Channel Adapters
        ↓
Conversation / Context Layer
        ↓
Agent Orchestration
        ↓
Amazon Bedrock / Nova 2 Lite
        ↓
Tool Layer
        ↓
Airline Operations
        ↓
Outbound Channels
```

### Amazon Bedrock

- Amazon Nova 2 Lite
- Inference profile: `eu.amazon.nova-2-lite-v1:0`
- Region: `eu-north-1`
- Extracts passenger intent, destination, arrival constraints, selected flight, recommended tool, and confirmation requirements
- Does not execute tools or modify booking state

### Amazon Bedrock AgentCore

- Deployed runtime: `surgeair_ai_agent`
- Live runtime readiness demonstrated
- Same-session conversational continuity demonstrated
- The application keeps orchestration and mutation authority in the backend tool layer

### AWS End User Messaging SMS

- Integrated through the official AWS SDK
- Uses the AWS SMS Simulator for the hackathon demonstration
- The simulator is a genuine AWS API integration, but it does not claim carrier delivery

### Amazon SES

- Integrated through the official AWS SDK
- Uses a live `SendEmail` operation
- The final validation successfully delivered the updated itinerary through SES

### WhatsApp and RCS

- WhatsApp uses the simulated adapter in the current hackathon build
- RCS uses the simulated adapter in the current hackathon build

Provider abstractions keep channel behavior separate from the orchestration layer, so simulated adapters can be replaced with live AWS channel providers without changing the passenger-facing contract.

## AWS Integration Readiness

| Service | Initial status when configured | Demo mode |
| --- | --- | --- |
| Amazon Bedrock | CONFIGURED | Nova 2 Lite |
| Bedrock AgentCore | CONFIGURED | Runtime ARN required |
| AWS End User Messaging SMS | CONFIGURED | AWS Simulator |
| Amazon SES | CONFIGURED | SES sandbox |
| WhatsApp | SIMULATED | Demo Adapter |
| RCS | SIMULATED | Demo Adapter |

Missing resource configuration displays `NOT INVOKED YET`. Only a successful call in this conversation produces `INVOKED` and its timestamp; failures display `ERROR`. Prior verification files do not set these conversation badges. `SIMULATED` means the selected adapter runs locally without claiming an AWS operation.

SMS validation used the AWS SMS Simulator and does not claim delivery through a physical carrier.

## Agent Tools

The airline tool registry exposes controlled operations:

| Tool | Purpose |
| --- | --- |
| `getBooking` | Retrieve a passenger booking by booking reference |
| `getFlightStatus` | Retrieve current flight status and disruption information |
| `searchAlternativeFlights` | Find available flights by route and arrival constraint |
| `rebookFlight` | Change a booking only after a matching explicit confirmation |
| `sendItinerary` | Send the updated itinerary only after confirmed rebooking |

The model can recommend a tool, but it never calls a tool directly. The backend validates inputs and controls the operation.

## Safety Model

The controlled action sequence is:

1. Retrieve passenger and booking context.
2. Interpret the passenger's intent.
3. Search available options.
4. Record the passenger's selection.
5. Request explicit confirmation.
6. Validate that the confirmation matches the pending selection.
7. Execute the booking mutation.
8. Send the updated itinerary.

`rebookFlight` is mutation-gated. A selection such as “Take SA218” creates a pending confirmation state; it cannot change the booking by itself. The itinerary sender has a separate guard and cannot send the final itinerary before confirmed rebooking.

## Context Continuity

The demonstrated conversation preserves:

- passenger identity
- booking reference
- original disruption
- route and current flight
- arrival deadline
- selected alternative
- confirmation state
- final booking state
- channel transitions

The passenger does not need to repeat the booking reference or previous constraint while moving through the demonstrated journey.

## Integration Readiness Dashboard

The operations dashboard exposes backend-managed readiness states:

- `CONFIGURED`
- `SIMULATED`
- `INVOKED`

Readiness is not only cosmetic frontend state. The API server initializes from committed backend evidence for integrations that were genuinely verified before the hackathon deployment. Loading this evidence does not perform a new AWS operation or fabricate a verification timestamp.

Runtime success or failure supersedes the bootstrap evidence and is written to a JSON runtime overlay when the filesystem is writable. Replit Autoscale filesystems are ephemeral, so the committed evidence remains the safe initialization source after a restart or republish. For multi-instance production deployment, shared durable storage such as DynamoDB would be appropriate. DynamoDB is not currently used as the live conversation or readiness store in this hackathon build.

## Observability

High-level operational events make the journey inspectable without exposing private model reasoning. The event and log surfaces include events such as:

- message received
- intent interpreted
- booking retrieved
- flight status checked
- alternatives searched
- alternative selected
- confirmation requested
- confirmation received
- rebooking executed
- itinerary generated
- itinerary sent

SurgeAir does not expose private chain-of-thought reasoning. Logs use sanitized destinations and record operational metadata such as provider, mode, region, status, and latency.

## Technology Stack

The repository currently uses:

- TypeScript
- React
- Vite
- Node.js
- Express
- AWS SDK for JavaScript v3
- Amazon Bedrock Runtime
- Amazon Bedrock AgentCore runtime integration
- AWS End User Messaging SMS
- Amazon SES
- Zod-generated API validation
- React Query-generated API hooks
- pnpm workspaces
- Replit

## Repository Structure

```text
artifacts/
├── api-server/       Express API, orchestration, providers, tools, and demo state
├── surgeair-ai/      React/Vite operations dashboard and passenger simulator
└── mockup-sandbox/   Isolated component preview workspace

lib/
├── api-spec/         OpenAPI source of truth
├── api-client-react/ Generated React Query hooks
├── api-zod/          Generated Zod request/response validation
└── db/               Shared database package

scripts/              Workspace utility scripts
```

The main API server source is organized around channel adapters, conversation state, model providers, orchestration, observability, routes, tools, and the SurgeAir domain.

## Running Locally

Install dependencies with pnpm:

```bash
pnpm install
```

Run the API server and dashboard in separate terminals, or use the managed Replit workflows:

```bash
pnpm --filter @workspace/api-server run dev
pnpm --filter @workspace/surgeair-ai run dev
```

## Run SurgeAir AI with Your Own AWS Account

The public SurgeAir demo is already connected to the project's controlled AWS-backed demonstration environment. Public users do not need AWS credentials, phone configuration, or email configuration, and they cannot replace those resources through the UI.

Developers who want to run their own instance should clone the repository and connect resources from **their own AWS account**:

```bash
git clone https://github.com/Anniemocha/surgeair-ai.git
cd surgeair-ai
pnpm install
cp .env.example .env
```

Keep `.env` private. Do not edit source files or Git commits to insert credentials, email addresses, phone numbers, tokens, or deployment-specific identifiers. On Replit, place private values in Secrets or environment configuration instead of tracked files.

### Configure the environment

Start from `.env.example`, which contains variable names and placeholders only. The main configuration groups are:

| Area | Variables |
| --- | --- |
| AWS and model | `AWS_REGION`, `MODEL_PROVIDER`, `BEDROCK_MODEL_ID`, `BEDROCK_VERIFIED` |
| AgentCore | `AGENTCORE_VERIFIED`, `AGENTCORE_RUNTIME_NAME` |
| SMS | `SMS_PROVIDER`, `SMS_VERIFIED`, `AWS_SMS_ENABLED`, `AWS_SMS_ORIGINATION_NUMBER`, `AWS_SMS_SIMULATOR_DESTINATION`, `SMS_TEST_TOKEN`, `SMS_TEST_MIN_INTERVAL_MS` |
| Email | `EMAIL_PROVIDER`, `SES_VERIFIED`, `AWS_SES_ENABLED`, `AWS_SES_FROM_EMAIL`, `AWS_SES_TEST_DESTINATION`, `EMAIL_TEST_MIN_INTERVAL_MS` |
| Simulated channels | `AWS_WHATSAPP_ENABLED`, `AWS_RCS_ENABLED` |
| Application | `SESSION_SECRET`, `CONVERSATION_TABLE_NAME` |

Use a strong random value for `SESSION_SECRET` and `SMS_TEST_TOKEN`. Keep all deployment values private and use the AWS SDK's normal credential provider chain with credentials for your own account. Never hard-code or commit AWS access keys, secret access keys, bearer tokens, or session secrets.

### Amazon Bedrock

Choose an AWS region where the intended model or inference profile is available, request any required model access, set `BEDROCK_MODEL_ID`, and grant the runtime permission to invoke it.

The reference SurgeAir deployment uses:

- Region: `eu-north-1`
- Model: Amazon Nova 2 Lite
- Inference profile: `eu.amazon.nova-2-lite-v1:0`

These identifiers describe the reference configuration; they are not credentials.

### Bedrock AgentCore

The reference deployment uses Bedrock AgentCore Runtime with runtime name `surgeair_ai_agent`. A developer who wants live AgentCore behavior must deploy and configure a runtime in their own AWS account, grant the required invocation permissions, and set their own AgentCore configuration. Cloning this repository does not grant access to the private reference runtime, account, or ARN.

### AWS End User Messaging SMS

The reference deployment uses the AWS End User Messaging SMS API with the **AWS SMS Simulator**. It does not demonstrate physical carrier delivery.

For a self-hosted instance:

1. Configure AWS End User Messaging SMS in your AWS account.
2. Use AWS simulator resources for development and testing.
3. Store your originator and simulator destination privately in `AWS_SMS_ORIGINATION_NUMBER` and `AWS_SMS_SIMULATOR_DESTINATION`.
4. Grant the runtime the appropriate `SendTextMessage` permission.
5. Validate through the application's guarded integration flow.

Production carrier delivery requires additional AWS provisioning and may involve regional, carrier, sender-registration, and regulatory requirements. The repository does not contain the reference deployment's simulator phone numbers.

### Amazon SES

For a self-hosted instance:

1. Configure Amazon SES in your AWS account and chosen region.
2. Verify an SES identity.
3. Store the sender privately in `AWS_SES_FROM_EMAIL`.
4. Configure an appropriate controlled recipient in `AWS_SES_TEST_DESTINATION`.
5. Grant the runtime `ses:SendEmail` permission.
6. Validate through the application's guarded integration flow.

SES sandbox accounts can send only from verified identities and generally only to verified recipients until production access is approved. The repository does not contain the SurgeAir owner's email address.

### WhatsApp and RCS

The current reference deployment **simulates WhatsApp and RCS**. It does not claim either channel as a live AWS integration. Developers can replace the corresponding adapters with live channel providers when those services are available and configured in their own environment.

### Public demo versus a self-hosted instance

| Public SurgeAir demo | Self-hosted developer instance |
| --- | --- |
| Uses SurgeAir's deployed AWS-backed demo environment | Uses the developer's own AWS account |
| Requires no AWS credentials from users | Requires private credential-provider configuration |
| Requires no personal phone or email setup | Uses the developer's own Bedrock, SMS, and SES resources |
| Does not expose infrastructure replacement through the UI | Is controlled through the developer's private environment configuration |

### Security checklist

Never commit:

- `.env` or other private environment files
- AWS access keys or secret access keys
- AWS bearer tokens
- session secrets or integration-test tokens
- personal deployment email addresses
- deployment phone numbers
- account identifiers, private ARNs, or authorization headers

Keep `.env.example` limited to variable names and clearly fake placeholders.

The root scripts provide workspace checks:

```bash
pnpm run typecheck
pnpm run build
```

The default `.env.example` configuration keeps the model and outbound providers local or simulated. Live provider operation requires the corresponding server-side configuration and AWS permissions; secrets must remain outside frontend code.

### Environment variable names

The repository's `.env.example` defines these configuration names:

```text
AWS_REGION
BEDROCK_MODEL_ID
BEDROCK_VERIFIED
AGENTCORE_VERIFIED
MODEL_PROVIDER
CONVERSATION_TABLE_NAME
SMS_PROVIDER
SMS_VERIFIED
AWS_SMS_ENABLED
SMS_TEST_TOKEN
SMS_TEST_MIN_INTERVAL_MS
AWS_WHATSAPP_ENABLED
AWS_RCS_ENABLED
AWS_SES_ENABLED
EMAIL_PROVIDER
SES_VERIFIED
AWS_SES_FROM_EMAIL
AWS_SES_TEST_DESTINATION
EMAIL_TEST_MIN_INTERVAL_MS
```

Secret values are not documented or committed. In the verified environment, server-side secrets include:

```text
AWS_ACCESS_KEY_ID
AWS_SECRET_ACCESS_KEY
AWS_BEARER_TOKEN_BEDROCK
SMS_TEST_TOKEN
SESSION_SECRET
AGENTCORE_RUNTIME_NAME
AWS_SMS_ORIGINATION_NUMBER
AWS_SMS_SIMULATOR_DESTINATION
```

Configuration names such as `AWS_REGION`, `BEDROCK_MODEL_ID`, `MODEL_PROVIDER`, `SMS_PROVIDER`, `AWS_SMS_ORIGINATION_NUMBER`, `AWS_SMS_SIMULATOR_DESTINATION`, `SMS_TEST_MIN_INTERVAL_MS`, `EMAIL_PROVIDER`, `AWS_SES_FROM_EMAIL`, and `AWS_SES_TEST_DESTINATION` are not credentials, but their values should still be managed outside the frontend. Do not place real phone numbers or email addresses in documentation.

## Testing

The API server defines these checks:

```bash
pnpm --filter @workspace/api-server test
pnpm --filter @workspace/api-server run test:safety
pnpm --filter @workspace/api-server run test:sms
pnpm --filter @workspace/api-server run test:ses
pnpm --filter @workspace/api-server run test:readiness
pnpm --filter @workspace/api-server run test:bedrock
```

The existing coverage includes:

- rebooking confirmation safety
- premature itinerary blocking
- Bedrock provider behavior and fallback handling
- SMS provider success and failure handling
- SES provider success and failure handling
- simulated provider fallbacks
- readiness persistence
- orchestration behavior exercised by the demo flow
- TypeScript typechecking

`test:bedrock` is a connectivity check that performs a live Bedrock operation when configured. It is not required for local-only development.

## Final Demo Validation

The final end-to-end validation passed:

| Stage | Verified state |
| --- | --- |
| Initial | SG4821 → SA204 → disrupted |
| Constraint | Arrival before 18:00 |
| Alternatives | SA218 and SA226 |
| Selection | SA218 |
| Before confirmation | Booking remained SA204 |
| After explicit confirmation | Booking became SA218 |
| Final itinerary | SA218, 11:30 → 14:40, Rebooked |
| Delivery | Updated itinerary accepted through live Amazon SES |

The final validation also confirmed that no itinerary was sent before explicit confirmation and that the dashboard exposed the disruption, conversation, channel transitions, tool activity, readiness states, and final booking state.

## Security

The current implementation:

- keeps credentials outside frontend code
- uses the AWS SDK default credential chain
- does not commit credentials or secrets
- does not use custom manual AWS signing
- restricts SMS simulator sends to the approved simulator destination
- uses a fixed SES test destination for controlled test sends
- sanitizes operational logs
- requires explicit confirmation before booking mutation
- does not expose unrestricted SMS or email relay endpoints

## Current Limitations

These are boundaries of the current hackathon implementation:

- WhatsApp is simulated.
- RCS is simulated.
- SMS uses the AWS Simulator rather than carrier delivery.
- Integration Readiness uses evidence from the current conversation only. Historical verification does not mark a service invoked.
- Conversation and event state use controlled in-memory demonstration data.
- The current publication is Autoscale: it can scale to zero when idle. Reserved VM is the continuously-running option. Quota counters persist in PostgreSQL, but visitor conversation state is not yet shared between instances.
- Airline inventory and booking records are controlled demonstration data.
- No production airline reservation-system integration is claimed.

## Notes for users

The browser retains the same demo booking sequence and presentation. SMS goes only to configured AWS simulator numbers. WhatsApp and RCS are simulated UI channels. Email runs in the SES sandbox with a fixed verified recipient and is previewed in the app. Flight and hotel data are mocked, not live inventory. The AgentCore runtime is configured, but the demo currently uses the direct Bedrock fallback when that runtime cannot handle the request; the per-turn orchestration history is authoritative. The following describes the actual execution paths, not historical verification badges:

| Component | Real call or simulation? |
| --- | --- |
| Disruption notification and booking confirmation SMS | Only deliberate start/reset and booking confirmation can call server-side AWS End User Messaging `SendTextMessage`, subject to the shared SMS budget. Limit hits log `SMS skipped: demo limit` and preserve the chat content. AWS MessageIds appear in SMS details and the operations log. This is simulator API acceptance, **not delivery to a physical handset**. Failures do not stop booking. Other bubbles are locally rendered and do not send SMS. |
| Passenger-message interpretation | Each user message, including confirmation/cancellation, goes through `InvokeAgentRuntime` when `AGENTCORE_RUNTIME_ARN` is configured. The runtime must run the interpretation-only protocol in `src/agentcore/app.ts`; its Bedrock model interprets the message without executing booking actions. The same runtime session ID is used within one conversation and is replaced on Reset Demo or passenger change. |
| Direct Amazon Bedrock fallback | If AgentCore is missing, errors, times out, or returns an incompatible response, the server automatically calls the existing direct Bedrock `Converse` path. If Bedrock also fails, the existing local interpretation fallback is explicitly reported as local. Orchestration and per-turn logs identify the path and runtime session ID. |
| Itinerary email | After successful rebooking, the server calls Amazon SES `SendEmail` using the configured sender and fixed sandbox recipient. The preview shows the actual email body, masked addresses, and the returned SES MessageId. Acceptance is not proof of inbox delivery. |
| WhatsApp and RCS | Simulated channel views; no messages are sent to those networks. |
| Flight disruption, alternative-flight inventory, booking updates, passenger scenarios | Local mock airline data and in-memory session state. No airline reservation system is contacted. |
| Conversation bubbles and operations panel | Locally rendered UI reflecting server results. Bubbles alone are not transport-delivery evidence. |

Integration Readiness starts at **Configured**, **Not invoked yet**, or **Simulated**. A service changes to **Invoked** with its first successful invocation timestamp in this conversation; reset clears that evidence. No badge is proof of a physical SMS or inbox delivery.

When AgentCore fails but the direct Bedrock call succeeds, its readiness card says **Configured, fallback active**. The orchestration panel shows the execution path and a safe failure summary, not raw provider exceptions or stack traces. See [the runtime contract, manual deployment commands, and scoped deployment permissions](docs/agentcore-runtime-update.md).

### AgentCore and SMS prerequisites

- Set `AGENTCORE_RUNTIME_ARN` to the existing runtime ARN. Runtime names alone cannot invoke a runtime. The API's IAM identity needs `bedrock-agentcore:InvokeAgentRuntime`; runtime discovery is not required.
- Deploy the updated interpretation-only runtime (`pnpm --filter @workspace/api-server run build:agentcore`) to that ARN before enabling it. A message-free capability probe must succeed before the server forwards user turns, preventing old runtimes from executing their own booking actions. The runtime role must have Bedrock model access. Its model configuration uses the runtime's IAM role, never the Replit bearer token.
- Configure `AWS_SMS_SIMULATOR_DESTINATION` and, where required by the simulator setup, `AWS_SMS_ORIGINATION_NUMBER`. Missing configuration or denied calls are reported as failures, never fabricated successes.
- Actual AWS calls require the account's IAM permissions and resources. The repository alone cannot provision access, destinations, or runtime permissions. Invocation receipts and conversation state are in memory and are lost on server restart.

## Future Development

Potential next steps may include:

- live AWS End User Messaging Social / WhatsApp integration
- live RCS provisioning
- DynamoDB conversation and readiness persistence
- CloudWatch production observability
- airline reservation-system integration
- authentication and identity verification
- expanded disruption workflows
- production deployment architecture

## Value

SurgeAir combines conversational AI, communications infrastructure, persistent context, tool execution, and explicit-action safety into a practical passenger recovery experience.

The value is not only chatbot responses. The agent maintains state across a passenger journey and performs controlled operational actions while keeping authorization separate from intent interpretation.

## Demo

**Live Demo:** [https://surge-air-ai-mvp.replit.app](https://surge-air-ai-mvp.replit.app)

Use the published Replit-hosted deployment to demonstrate the canonical flow:

1. Show the SA204 disruption and initial SMS notification.
2. Enter the arrival-before-18:00 constraint.
3. Select SA218 from the alternatives.
4. Show that the booking remains on SA204 while confirmation is pending.
5. Confirm the rebooking.
6. Show the final SA218 itinerary, readiness dashboard, operations log, and email delivery state.

**Demo video link:** [https://youtu.be/3PZeRoLv6ZM?feature=shared]

### Resetting the Demo

Users can use **Reset Demo** in the operations header to restore SG4821 to
the original delayed SA204 disruption and replay the demonstration. Reset is
limited to the current browser session, preserves AWS integration readiness,
and does not invoke external AWS services.

## License

The project package metadata declares the MIT license. No standalone `LICENSE` file currently exists.
