---
name: AgentCore secret-free bundling
description: Prevent indirect secret-environment reads from surviving the standalone AgentCore bundle.
---

AgentCore deployment code must receive bearer-token presence as an explicit input rather than inspecting a generic environment object.

**Why:** esbuild `define` replaces exact expressions such as a direct `process.env` property read. An indirect read through a passed environment object can survive bundling, produce misleading credential-mode diagnostics, and leave a forbidden secret variable reference in the artifact.

**How to apply:** Normalize authentication inputs once in the standard runtime factory. Pass `undefined` explicitly for bearer authentication in AgentCore, and scan the compiled `app.js` for forbidden secret environment names before packaging.