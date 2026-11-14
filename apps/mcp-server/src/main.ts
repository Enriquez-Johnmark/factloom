import { listWiredPackages } from './packages.ts';

// The entry point of the MCP server. There is no server yet: this only proves that Node.js
// runs the workspace from source. Standard output is reserved for protocol messages, so
// anything a person should read goes to standard error.
process.stderr.write(
  `factloom mcp-server: not implemented yet (wired from ${listWiredPackages().join(', ')})\n`,
);
