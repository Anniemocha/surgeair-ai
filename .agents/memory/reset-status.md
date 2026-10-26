---
name: Reset status
description: User-approved status behavior after resetting the demo
---

Keep the existing Reset Demo flow and show “Awaiting passenger reply” once the fresh disruption notification appears. Do not add a Start Demo screen solely to display “Not started.”

**Why:** The user explicitly chose to preserve the existing flow; a visible notification means the demo is already awaiting a reply.

**How to apply:** Keep the status badge consistent with the visible conversation after reset. Reserve “Not started” for a genuinely unstarted demo.

## Appearance is session-only

The appearance choice must return to the default Light appearance on every page load or refresh and on Reset Demo. Keep Eye Care working during the session, but never save or restore the choice through localStorage, sessionStorage, cookies, or the server. Clear legacy stored appearance values on load.

**Why:** The user explicitly requested this behavior and no changes to the design, booking flow, agent logic, or AWS calls.

**How to apply:** Preserve this rule when changing appearance controls or reset behavior; do not reintroduce persistence.
