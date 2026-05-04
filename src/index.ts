import express from "express";
import { McpServer, ResourceTemplate } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { z } from "zod";
// Import Express types correctly
import type { Request, Response } from "express";

// Enable debug logging to see what's happening
process.env.DEBUG = "mcp:*";

const app = express();
app.use(express.json());

const server = new McpServer({
  name: "hi-hello-mufuka",
  version: "1.0.0"
});

// Register our capabilities
server.resource(
  "echo",
  new ResourceTemplate("echo://{message}", { list: undefined }),
  async (uri, { message }) => ({
    contents: [{
      uri: uri.href,
      text: `Resource echo: ${message}`
    }]
  })
);

server.tool(
  "echo",
  { message: z.string() },
  async ({ message }) => ({
    content: [{ type: "text", text: `Tool echo: ${message}` }]
  })
);

server.prompt(
  "echo",
  { message: z.string() },
  ({ message }) => ({
    messages: [{
      role: "user",
      content: {
        type: "text",
        text: `Please process this message: ${message}`
      }
    }]
  })
);

app.post('/mcp', async (req: Request, res: Response) => {
  try {
    // Log incoming request for debugging
    console.log('Received request:', JSON.stringify(req.body, null, 2));
    
    const transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: undefined,
    });
    
    res.on('close', () => {
      console.log('Request closed');
      transport.close();
    });
    
    await server.connect(transport);
    await transport.handleRequest(req, res, req.body);
  } catch (error) {
    console.error('Error handling MCP request:', error);
    if (!res.headersSent) {
      res.status(500).json({
        jsonrpc: '2.0',
        error: {
          code: -32603,
          message: 'Internal server error',
        },
        id: null,
      });
    }
  }
});

app.get('/mcp', async (req: Request, res: Response) => {
  console.log('Received GET MCP request');
  res.writeHead(405).end(JSON.stringify({
    jsonrpc: "2.0",
    error: {
      code: -32000,
      message: "Method not allowed. Use POST to interact with the MCP server. Follow README for details."
    },
    id: null
  }));
});

app.delete('/mcp', async (req: Request, res: Response) => {
  console.log('Received DELETE MCP request');
  res.writeHead(405).end(JSON.stringify({
    jsonrpc: "2.0",
    error: {
      code: -32000,
      message: "Method not allowed. Use POST to interact with the MCP server. Follow README for details."
    },
    id: null
  }));
});

// In-memory store for subscribed widgets and notifications
const subscribedWidgets = new Set<string>();
const notificationStore = new Map<string, Array<{ id: string; fromWidgetId: string; message: string; timestamp: string }>>();

app.post('/subscribe', (req: Request, res: Response) => {
  const { widgetId } = req.body;
  if (!widgetId) return res.status(400).json({ success: false, error: "widgetId required" });
  subscribedWidgets.add(widgetId);
  notificationStore.set(widgetId, notificationStore.get(widgetId) || []);
  res.json({ success: true });
});

app.post('/unsubscribe', (req: Request, res: Response) => {
  const { widgetId } = req.body;
  if (!widgetId) return res.status(400).json({ success: false, error: "widgetId required" });
  subscribedWidgets.delete(widgetId);
  res.json({ success: true });
});

app.post('/notify', (req: Request, res: Response) => {
  const { fromWidgetId, toWidgetId, message } = req.body;
  if (!fromWidgetId || !toWidgetId || !message) {
    return res.status(400).json({ success: false, error: "fromWidgetId, toWidgetId, and message required" });
  }
  if (!subscribedWidgets.has(toWidgetId)) {
    return res.status(404).json({ success: false, error: `Widget ${toWidgetId} is not subscribed` });
  }
  const notification = { id: crypto.randomUUID(), fromWidgetId, message, timestamp: new Date().toISOString() };
  const inbox = notificationStore.get(toWidgetId) || [];
  inbox.push(notification);
  notificationStore.set(toWidgetId, inbox);
  res.json({ success: true });
});

app.get('/notifications/:widgetId', (req: Request, res: Response) => {
  const widgetId = req.params.widgetId as string;
  const notifications = notificationStore.get(widgetId) || [];
  notificationStore.set(widgetId, []);
  res.json({ notifications });
});

app.get('/info', (_req: Request, res: Response) => {
  res.json({ description: "MCP notification system for widgets and platforms", version: "1.0.0" });
});

// Start the server
const PORT = process.env.MCP_SERVER_PORT || 4000;
app.listen(PORT, () => {
  console.log(`MCP Stateless Streamable HTTP Server listening on port ${PORT}`);
});

// Base URL for the API, can be overridden by the environment variable MCP_API_URL
const API_URL =
  process.env.MCP_API_URL ||
"https://hi-hello-mufuka-production.up.railway.app";

// Helper function for making API requests
async function makeMCPRequest<T>(url: string, method: string, body?: any): Promise<T> {
  const headers = {
    "Content-Type": "application/json",
  };

  const response = await fetch(url, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`HTTP ${response.status} from ${url}: ${text}`);
  }

  return (await response.json()) as T;
}

// Interfaces for request and response types
interface SubscribeRequest {
  widgetId: string;
  inviteToken: string;
}

interface UnsubscribeRequest {
  widgetId: string;
}

interface NotificationRequest {
  fromWidgetId: string;
  toWidgetId: string;
  message: string;
}

interface NotificationsResponse {
  notifications: Array<{
    id: string;
    fromWidgetId: string;
    message: string;
    timestamp: string;
  }>;
}

interface InfoResponse {
  description: string;
  version: string;
}

// Register tools with MCP server

// @ts-ignore
server.tool(
  "subscribe-widget",
  "Subscribe a widget to the notification system (invite only)",
  {
    widgetId: z.string().describe("The ID of the widget to subscribe"),
    inviteToken: z.string().describe("The invite token required to subscribe"),
  },
  async ({ widgetId, inviteToken }: SubscribeRequest) => {
    if (inviteToken !== process.env.INVITE_TOKEN) {
      return { content: [{ type: "text", text: "Invalid invite token." }] };
    }
    try {
      const response = await makeMCPRequest<{ success: boolean }>(`${API_URL}/subscribe`, "POST", { widgetId, inviteToken });
      return { content: [{ type: "text", text: response.success ? "Widget subscribed successfully." : "Subscribe returned success: false." }] };
    } catch (e: any) {
      return { content: [{ type: "text", text: `Error: ${e.message}` }] };
    }
  },
);

// @ts-ignore
server.tool(
  "unsubscribe-widget",
  "Unsubscribe a widget from the notification system",
  {
    widgetId: z.string().describe("The ID of the widget to unsubscribe"),
  },
  async ({ widgetId }: UnsubscribeRequest) => {
    try {
      const response = await makeMCPRequest<{ success: boolean }>(`${API_URL}/unsubscribe`, "POST", { widgetId });
      return { content: [{ type: "text", text: response.success ? "Widget unsubscribed successfully." : "Unsubscribe returned success: false." }] };
    } catch (e: any) {
      return { content: [{ type: "text", text: `Error: ${e.message}` }] };
    }
  },
);

// @ts-ignore
server.tool(
  "send-notification",
  "Send a notification from one widget to another",
  {
    fromWidgetId: z.string().describe("The ID of the sending widget"),
    toWidgetId: z.string().describe("The ID of the receiving widget"),
    message: z.string().describe("The notification message"),
  },
  async ({ fromWidgetId, toWidgetId, message }: NotificationRequest) => {
    try {
      const response = await makeMCPRequest<{ success: boolean }>(`${API_URL}/notify`, "POST", { fromWidgetId, toWidgetId, message });
      return { content: [{ type: "text", text: response.success ? "Notification sent successfully." : "Notify returned success: false." }] };
    } catch (e: any) {
      return { content: [{ type: "text", text: `Error: ${e.message}` }] };
    }
  },
);

// @ts-ignore
server.tool(
  "get-notifications",
  "Retrieve notifications for a specific widget",
  {
    widgetId: z.string().describe("The ID of the widget to retrieve notifications for"),
  },
  async ({ widgetId }: { widgetId: string }) => {
    try {
      const response = await makeMCPRequest<NotificationsResponse>(`${API_URL}/notifications/${widgetId}`, "GET");
      const notifications = response.notifications || [];
      if (notifications.length === 0) {
        return { content: [{ type: "text", text: `No notifications for widget ID: ${widgetId}` }] };
      }
      const notificationsText = notifications.map(n => `From: ${n.fromWidgetId}, Message: ${n.message}, Time: ${n.timestamp}`).join("\n");
      return { content: [{ type: "text", text: `Notifications for widget ID ${widgetId}:\n\n${notificationsText}` }] };
    } catch (e: any) {
      return { content: [{ type: "text", text: `Error: ${e.message}` }] };
    }
  },
);

// @ts-ignore
server.tool(
  "get-registered",
  "Check which widget IDs are registered on this server",
  {},
  async () => {
    const registered = (process.env.WIDGET_IDS || "").split(",").map(id => id.trim()).filter(Boolean);
    if (registered.length === 0) {
      return { content: [{ type: "text", text: "No widgets registered." }] };
    }
    return { content: [{ type: "text", text: `Registered widgets:\n${registered.join("\n")}` }] };
  },
);

// @ts-ignore
server.tool(
  "get-info",
  "Get details on how the MCP Notification System works",
  {},
  async () => {
    try {
      const response = await makeMCPRequest<InfoResponse>(`${API_URL}/info`, "GET");
      return { content: [{ type: "text", text: `Description: ${response.description}\nVersion: ${response.version}` }] };
    } catch (e: any) {
      return { content: [{ type: "text", text: `Error: ${e.message}` }] };
    }
  },
);