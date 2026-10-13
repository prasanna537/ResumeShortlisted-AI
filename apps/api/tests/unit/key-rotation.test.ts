import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ keysSeen: [] as string[], behaviour: (_key: string) => "ok" as string }));
vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    constructor(public opts: { apiKey: string }) {}
    models = {
      generateContent: async () => {
        mocks.keysSeen.push(this.opts.apiKey);
        if (mocks.behaviour(this.opts.apiKey) === "429") throw Object.assign(new Error("RESOURCE_EXHAUSTED"), { status: 429 });
        return { text: `{"from":"${this.opts.apiKey}"}` };
      },
    };
  },
}));

import { geminiKeys } from "../../src/config/env";
import { generateJson } from "../../src/ai/gemini";

beforeEach(() => {
  mocks.keysSeen = [];
  process.env.GEMINI_API_KEY = "key-A";
  process.env.GEMINI_API_KEYS = "key-B, key-A";
});

describe("Gemini key pool", () => {
  it("combines and de-duplicates keys", () => {
    expect(geminiKeys({ GEMINI_API_KEY: "key-A", GEMINI_API_KEYS: "key-B, key-A," })).toEqual(["key-A", "key-B"]);
  });
  it("switches to the next key when the first hits its limit", async () => {
    mocks.behaviour = (k) => (k === "key-A" ? "429" : "ok");
    expect(JSON.parse(await generateJson("p")).from).toBe("key-B");
    expect(mocks.keysSeen.slice(0, 2)).toEqual(["key-A", "key-B"]);
  });
  it("keeps using the working key afterwards (does not retry the exhausted one first)", async () => {
    mocks.behaviour = (k) => (k === "key-A" ? "429" : "ok");
    await generateJson("p");
    mocks.keysSeen = [];
    await generateJson("p");
    expect(mocks.keysSeen[0]).toBe("key-B");
  });
  it("switches back when the second key is exhausted instead", async () => {
    mocks.behaviour = (k) => (k === "key-B" ? "429" : "ok");
    expect(JSON.parse(await generateJson("p")).from).toBe("key-A");
  });
});
