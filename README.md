# deno-nostr-relay

A simple Nostr relay server implemented with [Deno](https://deno.land/),
[Hono](https://hono.dev/), and [NDenoKv](https://nostrify.dev/store/denokv) from
Nostrify.

## Features

- NIP-01: Basic protocol flow (EVENT, REQ, CLOSE, EOSE)
- NIP-11: Relay Information Document
- Persistent storage using Deno KV
- Built with modern TypeScript and Deno

## Requirements

- [Deno](https://deno.land/) v1.40 or later

## Installation

```bash
git clone https://github.com/kuboon/deno-nostr-relay.git
cd deno-nostr-relay
```

## Usage

### Start the relay server

```bash
deno task start
```

Or run directly:

```bash
deno run --allow-net --allow-read --allow-write --unstable-kv main.ts
```

### Environment Variables

- `PORT`: Server port (default: 8080)

### Connect to the relay

Connect via WebSocket to `ws://localhost:8080/`

## Supported NIPs

- [NIP-01](https://github.com/nostr-protocol/nips/blob/master/01.md): Basic
  protocol flow description
- [NIP-11](https://github.com/nostr-protocol/nips/blob/master/11.md): Relay
  Information Document

## Development

### Run with watch mode

```bash
deno run --watch --allow-net --allow-read --allow-write --unstable-kv main.ts
```

## License

MIT License
