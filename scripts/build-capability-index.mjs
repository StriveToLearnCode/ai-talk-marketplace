#!/usr/bin/env node

// Compatibility command name; it delegates to the same router entrypoint.
const { main } = await import("./route-company-skills.mjs");
await main();
