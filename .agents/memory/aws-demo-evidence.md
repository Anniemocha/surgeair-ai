---
name: AWS demo authority and evidence
description: Why AgentCore must be interpretation-only and AWS readiness cannot use historical verification.
---

The browser demo's AgentCore path must interpret passenger messages without independently executing booking actions. The API remains authoritative for selection, explicit confirmation, and booking mutations. Use a separate runtime session ID for each conversation.

**Why:** The original standalone runtime also executes its own hardcoded demo booking actions. Routing the browser through that legacy protocol would duplicate booking authority and use the wrong context for other passenger scenarios. An incompatible runtime must fall back, not silently supply booking actions.

**How to apply:** Deploy and require the interpretation-only protocol, pass the active passenger context, and keep deterministic booking guards in the API. Keep the direct Bedrock fallback for runtime failures or timeouts.

Integration Readiness must reflect actual successful invocations in the current conversation, never committed verification evidence or a previous conversation's success.

**Why:** The user explicitly requires accurate per-conversation AWS claims. A configured adapter or previously successful test does not prove that any current chat message was delivered.

**How to apply:** Clear evidence on reset or passenger change; expose actual returned provider IDs. Simulator API acceptance is not physical carrier delivery, and SES acceptance is not proof of inbox delivery.
