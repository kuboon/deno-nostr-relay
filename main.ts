import { Hono } from "hono";
import { upgradeWebSocket } from "hono/deno";
import { NDenoKv } from "@nostrify/denokv";
import { type NostrFilter, NSchema } from "@nostrify/nostrify";

// Initialize Deno KV store and NDenoKv
const kv = await Deno.openKv();
const store = new NDenoKv(kv);

// Subscription management per connection
type Subscription = {
  id: string;
  filters: NostrFilter[];
};

const app = new Hono();

// NIP-11 Relay Information Document
app.get("/", (c) => {
  if (c.req.header("Accept") === "application/nostr+json") {
    return c.json({
      name: "deno-nostr-relay",
      description: "A simple Nostr relay implemented with Deno, Hono, and NDenoKv",
      pubkey: "",
      contact: "",
      supported_nips: [1, 11],
      software: "https://github.com/kuboon/deno-nostr-relay",
      version: "0.1.0",
    });
  }
  return c.text("Nostr Relay - Connect via WebSocket");
});

// WebSocket endpoint for Nostr protocol
app.get(
  "/",
  upgradeWebSocket(() => {
    const subscriptions = new Map<string, Subscription>();

    return {
      onMessage: async (event, ws) => {
        try {
          const data =
            typeof event.data === "string"
              ? event.data
              : new TextDecoder().decode(event.data as ArrayBuffer);
          const message = JSON.parse(data);

          if (!Array.isArray(message) || message.length === 0) {
            ws.send(JSON.stringify(["NOTICE", "Invalid message format"]));
            return;
          }

          const [type, ...rest] = message;

          switch (type) {
            case "EVENT": {
              const eventData = rest[0];
              const result = NSchema.event().safeParse(eventData);
              if (!result.success) {
                ws.send(
                  JSON.stringify([
                    "OK",
                    eventData?.id || "",
                    false,
                    `invalid: ${result.error.message}`,
                  ])
                );
                return;
              }
              const nostrEvent = result.data;
              try {
                await store.event(nostrEvent);
                ws.send(JSON.stringify(["OK", nostrEvent.id, true, ""]));
              } catch (error) {
                const errorMessage =
                  error instanceof Error ? error.message : "unknown error";
                ws.send(
                  JSON.stringify(["OK", nostrEvent.id, false, `error: ${errorMessage}`])
                );
              }
              break;
            }

            case "REQ": {
              const [subId, ...filters] = rest;
              if (
                typeof subId !== "string" ||
                !filters.every((f) => typeof f === "object")
              ) {
                ws.send(JSON.stringify(["NOTICE", "Invalid REQ format"]));
                return;
              }

              // Parse and validate filters
              const parsedFilters: NostrFilter[] = [];
              for (const filter of filters) {
                const result = NSchema.filter().safeParse(filter);
                if (result.success) {
                  parsedFilters.push(result.data);
                }
              }

              if (parsedFilters.length === 0) {
                ws.send(JSON.stringify(["NOTICE", "No valid filters provided"]));
                return;
              }

              // Store subscription
              subscriptions.set(subId, { id: subId, filters: parsedFilters });

              // Query stored events and send matching ones
              try {
                const events = await store.query(parsedFilters);
                for (const storedEvent of events) {
                  ws.send(JSON.stringify(["EVENT", subId, storedEvent]));
                }
              } catch (error) {
                console.error("Error querying events:", error);
              }

              // Send EOSE (End of Stored Events)
              ws.send(JSON.stringify(["EOSE", subId]));
              break;
            }

            case "CLOSE": {
              const [subId] = rest;
              if (typeof subId === "string") {
                subscriptions.delete(subId);
                ws.send(JSON.stringify(["CLOSED", subId, ""]));
              }
              break;
            }

            default:
              ws.send(JSON.stringify(["NOTICE", `Unknown message type: ${type}`]));
          }
        } catch (error) {
          console.error("Error processing message:", error);
          ws.send(JSON.stringify(["NOTICE", "Error processing message"]));
        }
      },

      onClose: () => {
        subscriptions.clear();
      },

      onError: (error) => {
        console.error("WebSocket error:", error);
      },
    };
  })
);

// Start server
const port = parseInt(Deno.env.get("PORT") || "8080");
console.log(`Nostr relay starting on port ${port}`);
Deno.serve({ port }, app.fetch);
