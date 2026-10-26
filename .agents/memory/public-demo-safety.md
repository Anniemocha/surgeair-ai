---
name: Public demo safety
description: Zero-send testing policy and public-use quota constraints.
---

Do not send real SMS or email during demo testing; mock AWS send calls.

**Why:** The user explicitly requested “Do not send any real SMS or email while testing: mock the AWS send calls in tests.”

**How to apply:** Inject fake AWS clients or use process-only simulated providers before running chat, reset, or confirmation flows. Never test a published live send path just to verify behavior.

Public-use budgets must not be renewed by a new cookie, Reset Demo, a process restart, or an Autoscale replica change.

**Why:** The user requested per-IP limits and a whole-demo daily SMS cap to make the public demo safe for strangers.

**How to apply:** Keep the global SMS budget independent of session IDs. Rotating the session signing secret also changes hashed per-IP quota identities, so do not treat secret rotation as a way to clear usage.
