/**
 * Revenium AI metering for Cloudflare Workers
 *
 * Cost calculation:
 *   1. Get token usage
 *   2. Read LiteLLM pricing from existing AI_PRICING KV
 *   3. On cache miss, fetch LiteLLM pricing catalog
 *   4. Calculate input/output/total cost locally
 *   5. Send calculated cost to Revenium
 *
 * Existing project values preserved:
 *
 * Organization:
 *   Stellar Global Supplies
 *
 * Product:
 *   stellar-ai-platform
 *
 * Provider:
 *   Cloudflare
 *
 * Existing KV binding:
 *   AI_PRICING
 */

const REVENIUM_METERING_URL =
  "https://api.revenium.ai/meter/v2/ai/completions";

const LITELLM_PRICING_URL =
  "https://raw.githubusercontent.com/BerriAI/litellm/main/model_prices_and_context_window.json";

const ORGANIZATION_NAME =
  "Stellar Global Supplies";

const PRODUCT_NAME =
  "stellar-ai-platform";

const PROVIDER =
  "Cloudflare";

/**
 * Existing Cloudflare KV binding.
 *
 * DO NOT rename this.
 */
const PRICING_KV_BINDING =
  "AI_PRICING";

/**
 * LiteLLM catalog cache duration:
 * 24 hours
 */
const PRICING_CACHE_TTL =
  86400;

const PRICING_CACHE_KEY =
  "litellm:model-pricing:v1";

/**
 * Resolve Revenium API key from:
 *
 * - normal Worker env variable / Wrangler secret
 * - Cloudflare Secrets Store binding
 */
async function getReveniumApiKey(env) {
  const binding =
    env.REVENIUM_API_KEY;

  if (!binding) {
    return null;
  }

  // Normal Wrangler secret / environment variable
  if (typeof binding === "string") {
    return binding.trim();
  }

  // Cloudflare Secrets Store
  if (
    typeof binding.get ===
    "function"
  ) {
    try {
      const value =
        await binding.get();

      if (!value) {
        return null;
      }

      return String(value).trim();
    } catch (err) {
      console.warn(
        "[revenium] failed to resolve Secrets Store binding:",
        err?.message || err
      );

      return null;
    }
  }

  return null;
}

/**
 * Normalize Workers AI usage into
 * Revenium token fields.
 */
function normalizeUsage(usage) {
  if (!usage) {
    return {
      inputTokenCount: 0,
      outputTokenCount: 0,
      totalTokenCount: 0,
    };
  }

  const inputTokenCount =
    Number(
      usage.prompt_tokens ??
        usage.input_tokens ??
        usage.inputTokenCount ??
        0
    );

  const outputTokenCount =
    Number(
      usage.completion_tokens ??
        usage.output_tokens ??
        usage.outputTokenCount ??
        0
    );

  const totalTokenCount =
    Number(
      usage.total_tokens ??
        usage.totalTokenCount ??
        inputTokenCount +
          outputTokenCount
    );

  return {
    inputTokenCount,
    outputTokenCount,
    totalTokenCount,
  };
}

/**
 * Get possible model names for LiteLLM lookup.
 *
 * Example Cloudflare model:
 *
 * @cf/meta/llama-4-scout-17b-16e-instruct
 */
function getModelCandidates(
  model,
  provider
) {
  const original =
    String(model || "").trim();

  if (!original) {
    return [];
  }

  const candidates =
    new Set();

  // Original
  candidates.add(
    original
  );

  // Remove @cf/
  candidates.add(
    original.replace(
      /^@cf\//i,
      ""
    )
  );

  // Remove generic provider prefix
  candidates.add(
    original.replace(
      /^@[^/]+\//i,
      ""
    )
  );

  // Last segment
  if (original.includes("/")) {
    candidates.add(
      original.substring(
        original.lastIndexOf("/") +
          1
      )
    );
  }

  // Provider/model
  if (provider) {
    candidates.add(
      `${provider}/${original}`
    );
  }

  // Known Cloudflare Llama model
  if (
    /llama-4-scout-17b-16e-instruct/i.test(
      original
    )
  ) {
    candidates.add(
      "llama-4-scout-17b-16e-instruct"
    );

    candidates.add(
      "meta-llama/llama-4-scout-17b-16e-instruct"
    );

    candidates.add(
      "cloudflare/@cf/meta/llama-4-scout-17b-16e-instruct"
    );
  }

  return [
    ...candidates,
  ];
}

/**
 * Find model pricing inside LiteLLM catalog.
 *
 * LiteLLM fields:
 *
 * input_cost_per_token
 * output_cost_per_token
 */
function findLiteLLMPricing(
  catalog,
  model,
  provider
) {
  if (
    !catalog ||
    typeof catalog !== "object"
  ) {
    return null;
  }

  const candidates =
    getModelCandidates(
      model,
      provider
    );

  const catalogKeys =
    Object.keys(catalog);

  // ---------------------------------------------------------
  // 1. Exact match
  // ---------------------------------------------------------
  for (
    const candidate of candidates
  ) {
    const entry =
      catalog[candidate];

    if (
      entry &&
      (
        entry.input_cost_per_token !==
          undefined ||
        entry.output_cost_per_token !==
          undefined
      )
    ) {
      return {
        modelKey:
          candidate,

        inputCostPerToken:
          Number(
            entry.input_cost_per_token ||
              0
          ),

        outputCostPerToken:
          Number(
            entry.output_cost_per_token ||
              0
          ),

        source:
          "LiteLLM",
      };
    }
  }

  // ---------------------------------------------------------
  // 2. Case-insensitive exact match
  // ---------------------------------------------------------
  for (
    const candidate of candidates
  ) {
    const lowerCandidate =
      candidate.toLowerCase();

    const matchingKey =
      catalogKeys.find(
        (key) =>
          key.toLowerCase() ===
          lowerCandidate
      );

    if (!matchingKey) {
      continue;
    }

    const entry =
      catalog[matchingKey];

    if (
      entry &&
      (
        entry.input_cost_per_token !==
          undefined ||
        entry.output_cost_per_token !==
          undefined
      )
    ) {
      return {
        modelKey:
          matchingKey,

        inputCostPerToken:
          Number(
            entry.input_cost_per_token ||
              0
          ),

        outputCostPerToken:
          Number(
            entry.output_cost_per_token ||
              0
          ),

        source:
          "LiteLLM",
      };
    }
  }

  // ---------------------------------------------------------
  // 3. Normalized model matching
  // ---------------------------------------------------------
  const normalize =
    (value) =>
      String(value || "")
        .toLowerCase()
        .replace(
          /^@[^/]+\//,
          ""
        )
        .replace(
          /^cloudflare\//,
          ""
        )
        .replace(
          /[^a-z0-9]/g,
          ""
        );

  const normalizedCandidates =
    candidates.map(
      normalize
    );

  for (
    const key of catalogKeys
  ) {
    const normalizedKey =
      normalize(key);

    const matched =
      normalizedCandidates.some(
        (target) =>
          normalizedKey ===
            target ||
          normalizedKey.endsWith(
            target
          ) ||
          target.endsWith(
            normalizedKey
          )
      );

    if (!matched) {
      continue;
    }

    const entry =
      catalog[key];

    if (
      entry &&
      (
        entry.input_cost_per_token !==
          undefined ||
        entry.output_cost_per_token !==
          undefined
      )
    ) {
      return {
        modelKey:
          key,

        inputCostPerToken:
          Number(
            entry.input_cost_per_token ||
              0
          ),

        outputCostPerToken:
          Number(
            entry.output_cost_per_token ||
              0
          ),

        source:
          "LiteLLM",
      };
    }
  }

  return null;
}

/**
 * Get LiteLLM pricing catalog.
 *
 * Existing KV:
 *
 *   AI_PRICING
 *
 * Flow:
 *
 *   AI_PRICING
 *       ↓
 *   cache HIT → use catalog
 *
 *   cache MISS
 *       ↓
 *   fetch LiteLLM
 *       ↓
 *   save to AI_PRICING
 *       ↓
 *   use catalog
 */
async function getLiteLLMPricingCatalog(
  env
) {
  const kv =
    env[PRICING_KV_BINDING];

  // ---------------------------------------------------------
  // 1. KV CACHE
  // ---------------------------------------------------------
  if (kv) {
    try {
      const cached =
        await kv.get(
          PRICING_CACHE_KEY,
          "json"
        );

      if (cached) {
        console.log(
          "[revenium] LiteLLM pricing cache HIT"
        );

        return cached;
      }

      console.log(
        "[revenium] LiteLLM pricing cache MISS"
      );
    } catch (err) {
      console.warn(
        "[revenium] LiteLLM KV read failed:",
        err?.message || err
      );
    }
  } else {
    console.warn(
      "[revenium] AI_PRICING KV binding not available"
    );
  }

  // ---------------------------------------------------------
  // 2. FETCH LITELLM CATALOG
  // ---------------------------------------------------------
  try {
    console.log(
      "[revenium] fetching LiteLLM pricing catalog"
    );

    const response =
      await fetch(
        LITELLM_PRICING_URL,
        {
          method:
            "GET",

          headers: {
            Accept:
              "application/json",

            "User-Agent":
              "stellar-ai-platform-revenium-metering",
          },
        }
      );

    if (!response.ok) {
      throw new Error(
        `LiteLLM pricing request failed: ${response.status} ${response.statusText}`
      );
    }

    const catalog =
      await response.json();

    // -------------------------------------------------------
    // 3. SAVE TO EXISTING KV
    // -------------------------------------------------------
    if (kv) {
      try {
        await kv.put(
          PRICING_CACHE_KEY,
          JSON.stringify(
            catalog
          ),
          {
            expirationTtl:
              PRICING_CACHE_TTL,
          }
        );

        console.log(
          "[revenium] LiteLLM pricing catalog cached for 24h"
        );
      } catch (err) {
        console.warn(
          "[revenium] LiteLLM KV write failed:",
          err?.message || err
        );
      }
    }

    return catalog;
  } catch (err) {
    console.warn(
      "[revenium] LiteLLM catalog fetch failed:",
      err?.message || err
    );

    return null;
  }
}

/**
 * Calculate AI cost using LiteLLM pricing.
 */
async function calculateCost(
  env,
  {
    model,
    provider,
    inputTokenCount,
    outputTokenCount,
  }
) {
  try {
    const catalog =
      await getLiteLLMPricingCatalog(
        env
      );

    if (!catalog) {
      console.warn(
        "[revenium] pricing catalog unavailable"
      );

      return null;
    }

    const pricing =
      findLiteLLMPricing(
        catalog,
        model,
        provider
      );

    if (!pricing) {
      console.warn(
        "[revenium] LiteLLM pricing not found:",
        model
      );

      return null;
    }

    const inputTokenCost =
      inputTokenCount *
      pricing.inputCostPerToken;

    const outputTokenCost =
      outputTokenCount *
      pricing.outputCostPerToken;

    const totalCost =
      inputTokenCost +
      outputTokenCost;

    console.log(
      "[revenium] COST CALCULATED:",
      JSON.stringify({
        model,
        provider,

        inputTokenCount,
        outputTokenCount,

        inputCostPerToken:
          pricing.inputCostPerToken,

        outputCostPerToken:
          pricing.outputCostPerToken,

        inputTokenCost,
        outputTokenCost,
        totalCost,

        pricingModel:
          pricing.modelKey,

        pricingSource:
          pricing.source,
      })
    );

    return {
      inputTokenCost,
      outputTokenCost,
      totalCost,

      inputCostPerToken:
        pricing.inputCostPerToken,

      outputCostPerToken:
        pricing.outputCostPerToken,

      pricingModel:
        pricing.modelKey,

      pricingSource:
        pricing.source,
    };
  } catch (err) {
    console.warn(
      "[revenium] cost calculation failed:",
      err?.message || err
    );

    return null;
  }
}

/**
 * Send a minimal test request to Revenium.
 *
 * IMPORTANT:
 * This intentionally does NOT use LiteLLM pricing.
 *
 * Its purpose is only to verify:
 *   - API key
 *   - API permissions
 *   - Revenium endpoint
 */
export async function testRevenium(
  env
) {
  const apiKey =
    await getReveniumApiKey(
      env
    );

  const hasApiKey =
    Boolean(apiKey);

  if (!hasApiKey) {
    return {
      success: false,
      status: 0,
      body:
        "REVENIUM_API_KEY not available",
    };
  }

  const now =
    new Date();

  const timestamp =
    now.toISOString();

  const payload = {
    model:
      "test-model",

    inputTokenCount:
      1,

    outputTokenCount:
      1,

    totalTokenCount:
      2,

    requestTime:
      timestamp,

    completionStartTime:
      timestamp,

    responseTime:
      timestamp,

    requestDuration:
      1,

    provider:
      "test",

    stopReason:
      "STOP",
  };

  try {
    const response =
      await fetch(
        REVENIUM_METERING_URL,
        {
          method:
            "POST",

          headers: {
            "Content-Type":
              "application/json",

            Accept:
              "application/json",

            "x-api-key":
              apiKey,
          },

          body:
            JSON.stringify(
              payload
            ),
        }
      );

    const body =
      await response.text();

    console.log(
      "[revenium-test]",
      JSON.stringify({
        status:
          response.status,

        statusText:
          response.statusText,

        body,

        endpoint:
          REVENIUM_METERING_URL,
      })
    );

    return {
      success:
        response.ok,

      status:
        response.status,

      body,
    };
  } catch (err) {
    console.warn(
      "[revenium-test] request error:",
      err?.message || err
    );

    return {
      success:
        false,

      status:
        0,

      body:
        err?.message ||
        String(err),
    };
  }
}

/**
 * Report one real AI request to Revenium.
 *
 * Existing call style remains compatible:
 *
 * reportUsage(env, {
 *   model,
 *   sessionId,
 *   usage,
 *   operationType,
 *   requestStartTime
 * })
 *
 * Cost is calculated locally using LiteLLM.
 */
export async function reportUsage(
  env,
  {
    model,
    sessionId,
    usage,
    operationType = "CHAT",
    requestStartTime,
  }
) {
  const apiKey =
    await getReveniumApiKey(
      env
    );

  const hasApiKey =
    Boolean(apiKey);

  if (!hasApiKey) {
    console.warn(
      "[revenium] REVENIUM_API_KEY not available — skipping usage report"
    );

    return;
  }

  const normalized =
    normalizeUsage(
      usage
    );

  const {
    inputTokenCount,
    outputTokenCount,
    totalTokenCount,
  } = normalized;

  console.log(
    "[revenium] TOKEN USAGE:",
    JSON.stringify({
      model,

      inputTokenCount,

      outputTokenCount,

      totalTokenCount,
    })
  );

  if (
    inputTokenCount === 0 &&
    outputTokenCount === 0 &&
    totalTokenCount === 0
  ) {
    console.warn(
      "[revenium] no token usage found — skipping usage report"
    );

    return;
  }

  const requestTime =
    requestStartTime
      ? new Date(
          requestStartTime
        )
      : new Date();

  const completionStartTime =
    new Date();

  const responseTime =
    new Date();

  const requestDuration =
    Math.max(
      1,
      responseTime.getTime() -
        requestTime.getTime()
    );

  // ---------------------------------------------------------
  // LOCAL COST CALCULATION
  // ---------------------------------------------------------
  const cost =
    await calculateCost(
      env,
      {
        model,

        provider:
          PROVIDER,

        inputTokenCount,

        outputTokenCount,
      }
    );

  console.log(
    "[revenium] FINAL COST:",
    cost?.totalCost ??
      null
  );

  // ---------------------------------------------------------
  // REVENIUM PAYLOAD
  // ---------------------------------------------------------
  const payload = {
    model:
      model || "unknown",

    provider:
      PROVIDER,

    modelSource:
      PROVIDER,

    inputTokenCount,

    outputTokenCount,

    totalTokenCount,

    // Locally calculated cost.
    //
    // Full precision is intentionally preserved.
    inputTokenCost:
      cost?.inputTokenCost ??
      null,

    outputTokenCost:
      cost?.outputTokenCost ??
      null,

    totalCost:
      cost?.totalCost ??
      null,

    requestTime:
      requestTime.toISOString(),

    completionStartTime:
      completionStartTime.toISOString(),

    responseTime:
      responseTime.toISOString(),

    requestDuration,

    stopReason:
      "STOP",

    operationType,

    costType:
      "AI",

    organizationName:
      ORGANIZATION_NAME,

    productName:
      PRODUCT_NAME,

    subscriber: {
      id:
        sessionId ||
        "unknown-session",
    },

    transactionId:
      crypto.randomUUID(),
  };

  console.log(
    "[revenium] FINAL COST PAYLOAD:",
    JSON.stringify({
      model:
        payload.model,

      provider:
        payload.provider,

      modelSource:
        payload.modelSource,

      inputTokenCount:
        payload.inputTokenCount,

      outputTokenCount:
        payload.outputTokenCount,

      totalTokenCount:
        payload.totalTokenCount,

      inputTokenCost:
        payload.inputTokenCost,

      outputTokenCost:
        payload.outputTokenCost,

      totalCost:
        payload.totalCost,
    })
  );

  try {
    const response =
      await fetch(
        REVENIUM_METERING_URL,
        {
          method:
            "POST",

          headers: {
            "Content-Type":
              "application/json",

            Accept:
              "application/json",

            // Revenium authentication
            "x-api-key":
              apiKey,
          },

          body:
            JSON.stringify(
              payload
            ),
        }
      );

    const body =
      await response.text();

    if (!response.ok) {
      console.warn(
        "[revenium] metering call failed: " +
          JSON.stringify({
            status:
              response.status,

            statusText:
              response.statusText,

            body,

            endpoint:
              REVENIUM_METERING_URL,

            hasApiKey,
          })
      );

      return;
    }

    console.log(
      "[revenium] metering call successful:",
      JSON.stringify({
        status:
          response.status,

        body,

        model,

        provider:
          PROVIDER,

        modelSource:
          PROVIDER,

        inputTokenCount,

        outputTokenCount,

        totalTokenCount,

        inputTokenCost:
          cost?.inputTokenCost ??
          null,

        outputTokenCost:
          cost?.outputTokenCost ??
          null,

        totalCost:
          cost?.totalCost ??
          null,
      })
    );
  } catch (err) {
    console.warn(
      "[revenium] metering call errored:",
      err?.message || err
    );
  }
}

/**
 * Rough token estimate (chars/4) for call sites where Workers AI
 * doesn't return a usage block.
 *
 * This repo's chat endpoint streams tokens (SSE) and Workers AI's
 * streaming mode does not emit a final usage/stats frame, so there
 * is no exact count available in that situation.
 *
 * This is a rough usage estimate, not billing-grade token counting.
 */
export function estimateTokens(
  text
) {
  if (!text) {
    return 0;
  }

  return Math.max(
    1,
    Math.ceil(
      String(text).length / 4
    )
  );
}
