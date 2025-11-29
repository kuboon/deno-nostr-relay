/// <reference lib="dom" />

const connectBtn = document.getElementById("connect") as HTMLButtonElement;
const messagesEl = document.getElementById("messages")!;
const postForm = document.getElementById("post") as HTMLFormElement;
const contentInput = document.getElementById("content") as HTMLInputElement;

const relays = ["ws://localhost:8080"];

import {
  InMemoryAccountContext,
  NostrKind,
  prepareNostrEvent,
  SingleRelayConnection,
} from "@blowater/nostr-sdk";

// minimal interfaces for the methods we use from the SDK
interface SimpleStream {
  chan: AsyncIterable<unknown>;
  closeSub: () => Promise<void>;
}

interface SimpleRelay {
  connect: () => Promise<void>;
  newSub: (subId: string, filters: unknown) => Promise<SimpleStream | Error>;
  sendEvent: (ev: unknown) => Promise<unknown | Error>;
}

interface SimpleSigner {
  publicKey: { hex: string };
}

// minimal signer type for casting when preparing events
type Signer = unknown;

let relay: SimpleRelay | null = null;
let signer: SimpleSigner | null = null;
let subCloser: (() => Promise<void>) | null = null;

function appendMessage(text: string) {
  const el = document.createElement("div");
  el.textContent = text;
  messagesEl.prepend(el);
}

function setConnectedState(connected: boolean) {
  connectBtn.textContent = connected ? "Connected" : "Connect";
  connectBtn.disabled = connected;
}

async function connectToRelay(url: string) {
  appendMessage(`Connecting to ${url}...`);
  const maybe = SingleRelayConnection.New(url);
  if (maybe instanceof Error) {
    appendMessage(`Failed to create connection: ${maybe.message}`);
    return;
  }
  relay = (maybe as unknown) as SimpleRelay;
  try {
    await relay.connect();
  } catch (eUnknown) {
    const e = eUnknown as Error;
    appendMessage(`Connect error: ${e.message ?? String(e)}`);
    relay = null;
    return;
  }
  setConnectedState(true);
  appendMessage(`Connected to ${url}`);
  startSubscription();
}

async function startSubscription() {
  if (!relay) return;
  // close previous subscription if any
  try {
    if (subCloser) await subCloser();
  } catch (errUnknown) {
    const err = errUnknown as Error;
    console.warn("subscription close error", err.message ?? String(err));
  }

  const streamOrErr = await relay.newSub("sub-1", {
    kinds: [NostrKind.TEXT_NOTE],
    limit: 50,
  });
  if (streamOrErr instanceof Error) {
    appendMessage(`Subscription error: ${streamOrErr.message}`);
    return;
  }
  const stream = streamOrErr as SimpleStream;

  subCloser = async () => {
    try {
      await stream.closeSub();
    } catch (errUnknown) {
      const err = errUnknown as Error;
      console.warn("closeSub error", err.message ?? String(err));
    }
  };

  (async () => {
    for await (const msg of stream.chan) {
      const m = msg as {
        type?: string;
        event?: { content?: string; pubkey?: string };
        note?: string;
      };
      if (m.type === "EVENT" && m.event) {
        const ev = m.event;
        const content = ev.content ?? "";
        const author = ev.pubkey ? ev.pubkey.slice(0, 8) : "unknown";
        appendMessage(`${author}: ${content}`);
      } else if (m.type === "NOTICE") {
        appendMessage(`Notice: ${m.note ?? ""}`);
      } else if (m.type === "EOSE") {
        appendMessage("End of stored events (EOSE)");
        break;
      }
    }
  })().catch((eUnknown) => {
    const e = eUnknown as Error;
    console.error("subscription loop error", e.message ?? String(e));
  });
}

async function publish(content: string) {
  if (!relay) {
    appendMessage("Not connected to a relay");
    return;
  }
  if (!signer) {
    // create ephemeral signer
    signer = InMemoryAccountContext.Generate() as unknown as SimpleSigner;
    appendMessage(`Using ephemeral pubkey ${signer.publicKey.hex.slice(0, 8)}`);
  }
  const unsigned = {
    content,
    kind: NostrKind.TEXT_NOTE,
    tags: [],
  };
  // @ts-ignore: using SDK Signer instance from runtime (typing mismatch in this minimal example)
  const signerForPrepare = signer as unknown as Signer;
  // @ts-ignore: allow passing runtime signer to SDK prepare function
  const ev = await prepareNostrEvent(signerForPrepare, unsigned);
  const ok = await relay.sendEvent(ev);
  if (ok instanceof Error) {
    appendMessage(`Publish error: ${ok.message}`);
  } else {
    appendMessage(`Published: ${content}`);
  }
}

connectBtn.addEventListener("click", async () => {
  const relayInput = document.getElementById("relay") as HTMLInputElement;
  const url = relayInput?.value || relays[0];
  await connectToRelay(url);
});

postForm.addEventListener("submit", async (e) => {
  e.preventDefault();
  const text = contentInput.value.trim();
  if (!text) return;
  await publish(text);
  contentInput.value = "";
});

appendMessage("Client ready");
