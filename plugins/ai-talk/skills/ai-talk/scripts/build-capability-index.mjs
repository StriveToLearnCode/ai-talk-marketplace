#!/usr/bin/env node

// Compatibility command name; it uses the same formatter-isolated router entrypoint.
const { main } = await import("./route-company-skills.mjs");
await main();
