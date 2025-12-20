# GEMINI.md

## Project Overview

This project is a TypeScript-based command-line tool that provides weather information. It uses the `@modelcontextprotocol/sdk` to create a server that exposes two tools: `get_alerts` and `get_forecast`. These tools fetch data from the National Weather Service (NWS) API. The tool can be invoked using the binary `weather` after it has been built.

## Building and Running

### Building the project

To build the project, run the following command:

```bash
npm run build
```

This will compile the TypeScript code and place the output in the `build` directory. It also makes the main script executable.

### Running the project

To run the server, use the following command:

```bash
npx @modelcontextprotocol/inspector node build/index.js
```

This will start the MCP server and you can interact with the tools using the inspector.

## Development Conventions

The project uses TypeScript with strict type checking, as defined in `tsconfig.json`. The code is organized in the `src` directory, with the main entry point being `index.ts`. The project uses `zod` for input schema validation. All dependencies are managed via `npm`.
