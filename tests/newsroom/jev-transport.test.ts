import { afterEach, describe, expect, it, vi } from "vitest";
import {
  chooseTransport,
  failureForStatus,
  postDirect,
  DIRECT_ENDPOINT,
  DIRECT_MODEL,
} from "@/newsroom/jev/transport";
import { parseDecision, JevFailure } from "@/newsroom/jev/model";

afterEach(() => vi.unstubAllGlobals());

describe("choosing a transport", () => {
  it("prefers the direct API: one round trip, and Newsroom's own credential", () => {
    expect(chooseTransport({ TYPESAFE_API_KEY: "k", AI_GATEWAY_API_KEY: "g" })).toBe("direct");
    expect(chooseTransport({ TYPESAFE_API_KEY: "k" })).toBe("direct");
  });

  it("still uses the gateway where that is all an install has", () => {
    expect(chooseTransport({ AI_GATEWAY_API_KEY: "g" })).toBe("gateway");
  });

  it("reports no transport rather than guessing when nothing is configured", () => {
    expect(chooseTransport({})).toBeNull();
    // A blank key is not a key; it would fail at the provider with a worse message.
    expect(chooseTransport({ TYPESAFE_API_KEY: "   " })).toBeNull();
  });
});

describe("failures", () => {
  it("maps a status to the same failure whichever transport produced it", () => {
    expect(failureForStatus(401)).toBe("authentication");
    expect(failureForStatus(403)).toBe("authentication");
    expect(failureForStatus(402)).toBe("credits");
    expect(failureForStatus(404)).toBe("unavailable");
    expect(failureForStatus(429)).toBe("rate-limit");
    expect(failureForStatus(422)).toBe("request");
    expect(failureForStatus(500)).toBe("provider");
    expect(failureForStatus(undefined)).toBe("provider");
  });

  it("names the credential without naming a library, since either can refuse one", () => {
    expect(new JevFailure("authentication").message).toContain("rejected the credential");
    expect(new JevFailure("authentication").message).not.toContain("Gateway");
  });
});

describe("the direct request", () => {
  function reply(body: unknown, status = 200) {
    const fetchMock = vi.fn(async () => new Response(JSON.stringify(body), { status }));
    vi.stubGlobal("fetch", fetchMock);
    return fetchMock;
  }

  it("posts the questions to the TypeSafe endpoint with the key as a bearer token", async () => {
    const fetchMock = reply({ ok: true });
    await postDirect({ state: { title: "t" }, questions: {} }, new AbortController().signal, {
      TYPESAFE_API_KEY: "secret-key",
    });
    const [url, init] = fetchMock.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe(DIRECT_ENDPOINT);
    expect((init.headers as Record<string, string>).Authorization).toBe("Bearer secret-key");
    expect(JSON.parse(init.body as string).model).toBe(DIRECT_MODEL);
    // A redirect could carry the request, and its key, to another host.
    expect(init.redirect).toBe("error");
  });

  it("turns a refused credential into the authentication failure, not a crash", async () => {
    reply({ error: "forbidden" }, 403);
    await expect(
      postDirect({}, new AbortController().signal, { TYPESAFE_API_KEY: "k" }),
    ).rejects.toMatchObject({ failureCode: "authentication" });
  });

  it("fails as authentication when no key is configured, without calling out", async () => {
    const fetchMock = reply({});
    await expect(postDirect({}, new AbortController().signal, {})).rejects.toMatchObject({
      failureCode: "authentication",
    });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("reports a transport fault as provider, never the underlying error", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("ECONNREFUSED 10.0.0.1:443");
      }),
    );
    const failure = await postDirect({}, new AbortController().signal, { TYPESAFE_API_KEY: "k" }).then(
      () => null,
      (error: unknown) => error as JevFailure,
    );
    expect(failure?.failureCode).toBe("provider");
    expect(failure?.message).not.toContain("10.0.0.1");
  });

  it("lets a caller's cancellation through as a cancellation", async () => {
    const controller = new AbortController();
    controller.abort();
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => {
        throw new Error("aborted");
      }),
    );
    await expect(postDirect({}, controller.signal, { TYPESAFE_API_KEY: "k" })).rejects.not.toBeInstanceOf(
      JevFailure,
    );
  });
});

describe("reading either transport's answer", () => {
  const answers = {
    category: { type: "choice", choice: "Release", probabilities: { Release: 0.9, Other: 0.1 } },
  };

  it("accepts the versioned model id the API reports", () => {
    const decision = parseDecision({
      model: "jev-1.13.0",
      answers,
      usage: { input_tokens: 318, output_tokens: 34 },
    });
    expect(decision.category).toBe("Release");
    // The API splits the count the SDK reports as one total.
    expect(decision.tokens).toBe(352);
  });

  it("still accepts the gateway's slug and single total", () => {
    const decision = parseDecision({ model: "typesafe-ai/jev", answers, usage: { totalTokens: 352 } });
    expect(decision.category).toBe("Release");
    expect(decision.tokens).toBe(352);
  });

  it("refuses a result from something that is not Jev", () => {
    expect(() => parseDecision({ model: "gpt-4o", answers })).toThrow(/Invalid Jev result/);
    expect(() => parseDecision({ model: "jev", answers })).toThrow(/Invalid Jev result/);
  });
});
