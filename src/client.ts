import { GoogleGenerativeAI, SchemaType } from "@google/generative-ai";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import 'dotenv/config';

// 1. Setup Gemini
const genAI = new GoogleGenerativeAI(process.env.GOOGLE_API_KEY!);
const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

async function runAgent() {
    // 2. Connect to your MCP Server
    const transport = new StdioClientTransport({
        command: "node",
        args: ["./build/index.js"] 
    });

    const mcpClient = new Client({ name: "weather-agent", version: "1.0.0" });
    await mcpClient.connect(transport);

    // 3. Discover and Convert Tools
    const { tools } = await mcpClient.listTools();
    
    // FIX: Map JSON Schema types to Gemini's SchemaType Enum
    const geminiTools = [{
        functionDeclarations: tools.map(tool => ({
            name: tool.name,
            description: tool.description,
            parameters: {
                type: SchemaType.OBJECT, // Explicitly use the Enum
                properties: (tool.inputSchema as any).properties,
                required: (tool.inputSchema as any).required,
            }
        }))
    }];

    // 4. Start Chat
    const chat = model.startChat({ tools: geminiTools });
    const prompt = "Is it going to rain in Livermore, CA?";
    
    console.log(`User: ${prompt}`);
    let result = await chat.sendMessage(prompt);

    // 5. The Agent Loop
    const call = result.response.functionCalls()?.[0];
    if (call) {
        console.log(`Agent wants to call: ${call.name} with`, call.args);
        
        // FIX: Pass arguments as an object, not the 'call' object itself
        const toolResponse = await mcpClient.callTool({
            name: call.name,
            arguments: call.args as Record<string, unknown>
        });
        
        const finalResponse = await chat.sendMessage([{
            functionResponse: {
                name: call.name,
                response: { content: toolResponse.content }
            }
        }]);

        console.log("Agent:", finalResponse.response.text());
    }
}

runAgent().catch(console.error);
