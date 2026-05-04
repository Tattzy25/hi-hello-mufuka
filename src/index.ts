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
  name: "Echo",
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
async function makeMCPRequest<T>(url: string, method: string, body?: any): Promise<T | null> {
  const headers = {
    "Content-Type": "application/json",
  };

  try {
    const response = await fetch(url, {
      method,
      headers,
      body: body ? JSON.stringify(body) : undefined,
    });
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    return (await response.json()) as T;
  } catch (error) {
    console.error("Error making MCP request:", error);
    return null;
  }
}

// Interfaces for request and response types
interface SubscribeRequest {
  widgetId: string;
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
  },
  async ({ widgetId }: SubscribeRequest) => {
    const url = `${API_URL}/subscribe`;
    const response = await makeMCPRequest<{ success: boolean }>(url, "POST", { widgetId });

    if (!response) {
      return {
        content: [
          {
            type: "text",
            text: "Failed to subscribe widget.",
          },
        ],
      };
    }

    return {
      content: [
        {
          type: "text",
          text: response.success ? "Widget subscribed successfully." : "Failed to subscribe widget.",
        },
      ],
    };
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
    const url = `${API_URL}/unsubscribe`;
    const response = await makeMCPRequest<{ success: boolean }>(url, "POST", { widgetId });

    if (!response) {
      return {
        content: [
          {
            type: "text",
            text: "Failed to unsubscribe widget.",
          },
        ],
      };
    }

    return {
      content: [
        {
          type: "text",
          text: response.success ? "Widget unsubscribed successfully." : "Failed to unsubscribe widget.",
        },
      ],
    };
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
    const url = `${API_URL}/notify`;
    const response = await makeMCPRequest<{ success: boolean }>(url, "POST", { fromWidgetId, toWidgetId, message });

    if (!response) {
      return {
        content: [
          {
            type: "text",
            text: "Failed to send notification.",
          },
        ],
      };
    }

    return {
      content: [
        {
          type: "text",
          text: response.success ? "Notification sent successfully." : "Failed to send notification.",
        },
      ],
    };
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
    const url = `${API_URL}/notifications/${widgetId}`;
    const response = await makeMCPRequest<NotificationsResponse>(url, "GET");

    if (!response) {
      return {
        content: [
          {
            type: "text",
            text: "Failed to retrieve notifications.",
          },
        ],
      };
    }

    const notifications = response.notifications || [];
    if (notifications.length === 0) {
      return {
        content: [
          {
            type: "text",
            text: `No notifications for widget ID: ${widgetId}`,
          },
        ],
      };
    }

    const notificationsText = notifications.map(n => `From: ${n.fromWidgetId}, Message: ${n.message}, Time: ${n.timestamp}`).join("\n");
    return {
      content: [
        {
          type: "text",
          text: `Notifications for widget ID ${widgetId}:\n\n${notificationsText}`,
        },
      ],
    };
  },
);

// @ts-ignore
server.tool(
  "get-info",
  "Get details on how the MCP Notification System works",
  {},
  async () => {
    const url = `${API_URL}/info`;
    const response = await makeMCPRequest<InfoResponse>(url, "GET");

    if (!response) {
      return {
        content: [
          {
            type: "text",
            text: "Failed to retrieve information about the notification system.",
          },
        ],
      };
    }

    return {
      content: [
        {
          type: "text",
          text: `Description: ${response.description}\nVersion: ${response.version}`,
        },
      ],
    };
  },
);