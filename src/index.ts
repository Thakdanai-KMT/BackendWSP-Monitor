interface Env {
  BACKEND_URL: string;
  DISCORD_WEBHOOK_URL: string;
  SUPABASE_URL: string;
  SUPABASE_SECRET_KEY: string;
  DISCORD_PUBLIC_KEY: string;
  MONITOR_SEND_INITIAL?: string;
}

interface HealthResult {
  isOnline: boolean;
  statusCode: number | null;
  latency: number | null;
  message: string;
}

interface MonitorState {
  isOnline: boolean;
  lastCheckedAt: string;
  lastChangedAt: string;
  lastLatency: number | null;
  lastHttpStatus: number | null;
  lastMessage: string;
}

const SERVICE_NAME = "BackendWSP";

function required(value: string | undefined, name: string): string {
  if (!value) {
    throw new Error(`${name} is missing`);
  }

  return value;
}

async function checkBackend(url: string): Promise<HealthResult> {
  const started = Date.now();

  try {
    const response = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": "BackendWSP-Monitor/2.0",
      },
    });

    const latency = Date.now() - started;

    if (!response.ok) {
      return {
        isOnline: false,
        statusCode: response.status,
        latency,
        message: `Backend returned HTTP ${response.status}`,
      };
    }

    return {
      isOnline: true,
      statusCode: response.status,
      latency,
      message: "Backend is healthy",
    };
  } catch (error) {
    const latency = Date.now() - started;

    return {
      isOnline: false,
      statusCode: null,
      latency,
      message:
        error instanceof Error
          ? error.message
          : "Unknown error",
    };
  }
}

async function getState(
  env: Env,
): Promise<MonitorState | null> {
const url =
  `${required(env.SUPABASE_URL, "SUPABASE_URL")}` +
  `/rest/v1/monitor_status?on_conflict=service_name`;
    `?service_name=eq.${encodeURIComponent(SERVICE_NAME)}` +
    `&select=is_online,last_checked_at,last_changed_at,last_latency,last_http_status,last_message` +
    `&limit=1`;

  const response = await fetch(url, {
    headers: {
      apikey: required(
        env.SUPABASE_SECRET_KEY,
        "SUPABASE_SECRET_KEY",
      ),
      Authorization: `Bearer ${required(
        env.SUPABASE_SECRET_KEY,
        "SUPABASE_SECRET_KEY",
      )}`,
    },
  });

  if (!response.ok) {
    throw new Error(
      `Supabase read failed: HTTP ${response.status}`,
    );
  }

  const rows = (await response.json()) as Array<{
    is_online: boolean;
    last_checked_at: string;
    last_changed_at: string;
    last_latency: number | null;
    last_http_status: number | null;
    last_message: string;
  }>;

  if (!rows.length) {
    return null;
  }

  const row = rows[0];

  return {
    isOnline: row.is_online,
    lastCheckedAt: row.last_checked_at,
    lastChangedAt: row.last_changed_at,
    lastLatency: row.last_latency,
    lastHttpStatus: row.last_http_status,
    lastMessage: row.last_message,
  };
}

async function saveState(
  env: Env,
  state: MonitorState,
): Promise<void> {
  const url =
    `${required(env.SUPABASE_URL, "SUPABASE_URL")}` +
    `/rest/v1/monitor_status?on_conflict=service_name`;

  const response = await fetch(url, {
    method: "POST",

    headers: {
      apikey: required(
        env.SUPABASE_SECRET_KEY,
        "SUPABASE_SECRET_KEY",
      ),

      Authorization: `Bearer ${required(
        env.SUPABASE_SECRET_KEY,
        "SUPABASE_SECRET_KEY",
      )}`,

      "Content-Type": "application/json",

      Prefer:
        "resolution=merge-duplicates,return=minimal",
    },

    body: JSON.stringify({
      service_name: SERVICE_NAME,
      is_online: state.isOnline,
      last_checked_at: state.lastCheckedAt,
      last_changed_at: state.lastChangedAt,
      last_latency: state.lastLatency,
      last_http_status: state.lastHttpStatus,
      last_message: state.lastMessage,
      updated_at: new Date().toISOString(),
    }),
  });

  if (!response.ok) {
    const body = await response.text();

    throw new Error(
      `Supabase write failed: HTTP ${response.status} ${body}`,
    );
  }
}

function formatTime(iso: string): string {
  return (
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Asia/Bangkok",
      dateStyle: "medium",
      timeStyle: "medium",
      hour12: false,
    }).format(new Date(iso)) + " GMT+7"
  );
}

function buildEmbed(
  result: HealthResult,
  previous: MonitorState | null,
  checkedAt: string,
): Record<string, unknown> {
  const recovered =
    result.isOnline &&
    previous !== null &&
    !previous.isOnline;

  const firstRun = previous === null;

  const title = result.isOnline
    ? recovered
      ? "🟢 BACKENDWSP — SYSTEM RECOVERED"
      : firstRun
        ? "🟢 BACKENDWSP — SYSTEM ONLINE"
        : "🟢 BACKENDWSP — SYSTEM ONLINE"
    : "🔴 BACKENDWSP — SYSTEM DOWN";

  let downtime = "—";

  if (recovered && previous?.lastChangedAt) {
    const seconds = Math.max(
      0,
      Math.floor(
        (Date.parse(checkedAt) -
          Date.parse(previous.lastChangedAt)) /
          1000,
      ),
    );

    const minutes = Math.floor(seconds / 60);
    const remaining = seconds % 60;

    downtime = `${minutes}m ${remaining}s`;
  }

  return {
    title,

    description: result.isOnline
      ? recovered
        ? "BackendWSP is operating normally again."
        : "BackendWSP health check is successful."
      : "⚠️ BackendWSP requires attention.",

    color: result.isOnline
      ? 0x2ecc71
      : 0xe74c3c,

    fields: [
      {
        name: "Status",
        value: result.isOnline
          ? "🟢 UP"
          : "🔴 DOWN",
        inline: true,
      },

      {
        name: "HTTP",
        value: result.statusCode
          ? `\`${result.statusCode}\``
          : "No response",
        inline: true,
      },

      {
        name: "Latency",
        value:
          result.latency !== null
            ? `\`${result.latency} ms\``
            : "—",
        inline: true,
      },

      {
        name: "Service",
        value: "BackendWSP API",
        inline: true,
      },

      {
        name: "Endpoint",
        value: "`/api/health`",
        inline: true,
      },

      {
        name: "Downtime",
        value: downtime,
        inline: true,
      },

      {
        name: "Checked",
        value: `\`${formatTime(checkedAt)}\``,
      },

      {
        name: "Message",
        value: result.message.slice(0, 1024),
      },
    ],

    footer: {
      text: "BackendWSP Monitoring • Cloudflare Worker",
    },

    timestamp: checkedAt,
  };
}

async function sendDiscord(
  env: Env,
  result: HealthResult,
  previous: MonitorState | null,
  checkedAt: string,
): Promise<void> {
  const webhook = required(
    env.DISCORD_WEBHOOK_URL,
    "DISCORD_WEBHOOK_URL",
  );

  const response = await fetch(webhook, {
    method: "POST",

    headers: {
      "Content-Type": "application/json",
    },

    body: JSON.stringify({
      username: "BackendWSP Monitor",

      embeds: [
        buildEmbed(
          result,
          previous,
          checkedAt,
        ),
      ],
    }),
  });

  if (!response.ok) {
    const body = await response.text();

    throw new Error(
      `Discord webhook failed: HTTP ${response.status} ${body}`,
    );
  }
}

async function runMonitor(
  env: Env,
): Promise<void> {
  const checkedAt =
    new Date().toISOString();

  const result = await checkBackend(
    required(
      env.BACKEND_URL,
      "BACKEND_URL",
    ),
  );

  const previous =
    await getState(env);

  const statusChanged =
    previous === null ||
    previous.isOnline !== result.isOnline;

  const shouldSendInitial =
    (
      env.MONITOR_SEND_INITIAL ??
      "true"
    ).toLowerCase() === "true";

  if (
    statusChanged &&
    (
      previous !== null ||
      shouldSendInitial
    )
  ) {
    await sendDiscord(
      env,
      result,
      previous,
      checkedAt,
    );
  }

  const nextState: MonitorState = {
    isOnline: result.isOnline,

    lastCheckedAt: checkedAt,

    lastChangedAt:
      statusChanged ||
      previous === null
        ? checkedAt
        : previous.lastChangedAt,

    lastLatency: result.latency,

    lastHttpStatus:
      result.statusCode,

    lastMessage:
      result.message,
  };

  await saveState(
    env,
    nextState,
  );

  console.log(
    JSON.stringify({
      service: SERVICE_NAME,

      status:
        result.isOnline
          ? "UP"
          : "DOWN",

      statusChanged,

      httpStatus:
        result.statusCode,

      latency:
        result.latency,

      checkedAt,
    }),
  );
}
function hexToUint8Array(hex: string): Uint8Array<ArrayBuffer> {
  const bytes = new Uint8Array(
    new ArrayBuffer(hex.length / 2),
  );

  for (let i = 0; i < hex.length; i += 2) {
    bytes[i / 2] = parseInt(
      hex.slice(i, i + 2),
      16,
    );
  }

  return bytes;
}

async function verifyDiscordSignature(
  request: Request,
  publicKey: string,
): Promise<boolean> {
  const signature = request.headers.get("X-Signature-Ed25519");
  const timestamp = request.headers.get("X-Signature-Timestamp");

  if (!signature || !timestamp) {
    return false;
  }

  const body = await request.clone().text();

  const message = new TextEncoder().encode(
    timestamp + body,
  );

  try {
    const key = await crypto.subtle.importKey(
      "raw",
      hexToUint8Array(publicKey),
      {
        name: "Ed25519",
      },
      false,
      ["verify"],
    );

    return await crypto.subtle.verify(
      "Ed25519",
      key,
      hexToUint8Array(signature),
      message,
    );
  } catch {
    return false;
  }
}

function discordCheckResponse(result: HealthResult): Response {
  const embed = {
    title: result.isOnline
      ? "🟢 BACKENDWSP — SYSTEM ONLINE"
      : "🔴 BACKENDWSP — SYSTEM DOWN",

    description: result.isOnline
      ? "BackendWSP is operating normally."
      : "⚠️ BackendWSP requires attention.",

    color: result.isOnline
      ? 0x2ecc71
      : 0xe74c3c,

    fields: [
      {
        name: "Status",
        value: result.isOnline ? "🟢 UP" : "🔴 DOWN",
        inline: true,
      },
      {
        name: "HTTP",
        value: result.statusCode
          ? `\`${result.statusCode}\``
          : "No response",
        inline: true,
      },
      {
        name: "Latency",
        value: result.latency !== null
          ? `\`${result.latency} ms\``
          : "—",
        inline: true,
      },
      {
        name: "Service",
        value: "BackendWSP API",
        inline: true,
      },
      {
        name: "Endpoint",
        value: "`/api/health`",
        inline: true,
      },
      {
        name: "Message",
        value: result.message.slice(0, 1024),
      },
    ],

    footer: {
      text: "BackendWSP Monitoring • /check",
    },

    timestamp: new Date().toISOString(),
  };

  return Response.json({
    type: 4,
    data: {
      embeds: [embed],
    },
  });
}

async function handleDiscordInteraction(
  request: Request,
  env: Env,
): Promise<Response> {
  const publicKey = required(
    env.DISCORD_PUBLIC_KEY,
    "DISCORD_PUBLIC_KEY",
  );

  const valid = await verifyDiscordSignature(
    request,
    publicKey,
  );

  if (!valid) {
    return new Response("Invalid request signature", {
      status: 401,
    });
  }

  const body = await request.json() as {
    type?: number;
    data?: {
      name?: string;
    };
  };

  // Discord endpoint verification
  if (body.type === 1) {
    return Response.json({
      type: 1,
    });
  }

  // /check
  if (
    body.type === 2 &&
    body.data?.name === "check"
  ) {
    try {
      const result = await checkBackend(
        required(env.BACKEND_URL, "BACKEND_URL"),
      );

      return discordCheckResponse(result);
    } catch (error) {
      return Response.json({
        type: 4,
        data: {
          content:
            `❌ Monitor error: ${
              error instanceof Error
                ? error.message
                : "Unknown error"
            }`,
        },
      });
    }
  }

  return Response.json({
    type: 4,
    data: {
      content: "❌ Unknown command.",
    },
  });
}
export default {
  async scheduled(
    _controller: unknown,
    env: Env,
  ): Promise<void> {
    await runMonitor(env);
  },

  async fetch(
    request: Request,
    env: Env,
  ): Promise<Response> {
    const url = new URL(
      request.url,
    );
        if (
      url.pathname === "/discord/interactions" &&
      request.method === "POST"
    ) {
      return handleDiscordInteraction(request, env);
    }
    if (url.pathname === "/") {
      return new Response(
        "BackendWSP Monitor is running.",
        {
          status: 200,
        },
      );
    }

    if (url.pathname === "/check") {
      try {
        await runMonitor(env);

        return Response.json({
          ok: true,
        });
      } catch (error) {
        console.error(error);

        return Response.json(
          {
            ok: false,

            error:
              error instanceof Error
                ? error.message
                : "Unknown error",
          },
          {
            status: 500,
          },
        );
      }
    }

    return new Response(
      "Not Found",
      {
        status: 404,
      },
    );
  },
};