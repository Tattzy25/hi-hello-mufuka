# ModelContext Protocol Server

This project demonstrates how to use the ModelContext Protocol (MCP) with an Express server.
The MCP server methods were generated based on an OpenAPI Specification (OAS) file and integrated into the `src/index.ts` file.

## Installation and Setup

### Prerequisites
Before running the project, ensure the following are installed on your system:
- **Node.js** (version >= 18.0.0)
- **npm** (comes with Node.js)

### Steps to Install and Run
1. Navigate to the project directory.
2. Install the dependencies:
   ```bash
   npm install
   ```
3. Start the development server:
   ```bash
   npm run dev
   ```
4. The MCP server runs by default at:
   ```
   http://localhost:4000/mcp
   ```

## Communicating with the MCP Server
The MCP server is running as a Streamable HTTP server and listens for requests at the default endpoint:
```
http://localhost:4000/mcp
```

### Sending Requests to the MCP Server

To communicate with the MCP server, you can send HTTP POST requests to the `/mcp` endpoint. The server expects the request body to follow the JSON-RPC 2.0 specification.

#### Example Request
Here is an example of a JSON-RPC 2.0 request to invoke a tool or resource:

```json
{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "echo",
    "arguments": {
      "message": "Hello, MCP!"
    }
  },
  "id": 1
}
```

* method: Specifies the tool or resource to invoke (e.g., tool/echo).
* params: Contains the parameters required by the tool or resource.
* id: A unique identifier for the request

The server will respond with a JSON-RPC 2.0-compliant response:
```json
{
  "jsonrpc": "2.0",
  "result": {
    "content": [ {"type":"text","text":"Tool echo: Hello, MCP!"} ]
  },
  "id": 1
}
```

#### Using cURL to Send Requests
You can use cURL to send requests to the MCP server. Here is an example command:

```bash
curl -X POST http://localhost:4000/mcp \
-H "Content-Type: application/json" \
-H "Accept: application/json, text/event-stream" \
-d '{
  "jsonrpc": "2.0",
  "method": "tools/call",
  "params": {
    "name": "echo",
    "arguments": {
      "message": "Hello, MCP!"
    }
  },
  "id": 1
}'
```

## Server customization

### Port
If you want to run the MCP server on a different port, you can set the `MCP_SERVER_PORT` environment variable before starting the server. For example:
```
export MCP_SERVER_PORT=4002
```

### API url
By default, MCP Server is using first server url defined in the OpenAPI Specification (OAS) file.
In order to customize API URL for the MCP server, please set the `MCP_API_URL` environment variable:
```
export MCP_API_URL=<desired_url>
```

### MCP server methods
If you need to modify the MCP server methods, you can do so in the `src/index.ts` file. 
The methods are generated based on the OpenAPI Specification (OAS) file, and you can adjust them as needed.

## Troubleshooting
If the project is not running as expected:  
1. Ensure all dependencies are installed by running `npm install`
2. Verify that you are using Node.js version 18 or higher: `node -v`
3. Check for errors in the terminal output when running `npm run dev`
4. Ensure the port (default: 4000) is not already in use by another application.
5. Verify custom environment variables:
   ```bash
   echo $MCP_SERVER_PORT
   echo $MCP_API_URL
   ```
6. If the issue persists, review the code in `src/index.ts` for potential misconfigurations or errors.