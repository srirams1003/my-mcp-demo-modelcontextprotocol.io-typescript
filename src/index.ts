import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const NWS_API_BASE = "https://api.weather.gov";
const USER_AGENT = "weather-app/1.0";

// Create server instance
const server = new McpServer({
    name: "weather",
    version: "1.0.0",
});

// --- HELPERS ---

// Helper function for making NWS API requests
async function makeNWSRequest<T>(url: string): Promise<T | null> {
    const headers = {
        "User-Agent": USER_AGENT,
        Accept: "application/geo+json",
    };

    try {
        const response = await fetch(url, { headers });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        return (await response.json()) as T;
    } catch (error) {
        console.error("Error making NWS request:", error);
        return null;
    }
}

interface GeocodingResult {
    lat: string;
    lon: string;
    display_name: string;
}

// Helper for OpenStreetMap Geocoding
async function getCoordinates(city: string, state: string): Promise<GeocodingResult | null> {
    const url = `https://nominatim.openstreetmap.org/search?q=${encodeURIComponent(city)},${encodeURIComponent(state)}&format=json&limit=1`;
    const headers = {
        "User-Agent": USER_AGENT, // Required by Nominatim
    };

    try {
        const response = await fetch(url, { headers });
        if (!response.ok) {
            throw new Error(`HTTP error! status: ${response.status}`);
        }
        const data = (await response.json()) as GeocodingResult[];
        if (data && data.length > 0) {
            return data[0];
        }
        return null;
    } catch (error) {
        console.error("Error fetching coordinates:", error);
        return null;
    }
}

// --- INTERFACES ---

interface AlertFeature {
    properties: {
        event?: string;
        areaDesc?: string;
        severity?: string;
        status?: string;
        headline?: string;
    };
}

interface ForecastPeriod {
    name?: string;
    temperature?: number;
    temperatureUnit?: string;
    windSpeed?: string;
    windDirection?: string;
    shortForecast?: string;
}

interface AlertsResponse {
    features: AlertFeature[];
}

interface PointsResponse {
    properties: {
        forecast?: string;
    };
}

interface ForecastResponse {
    properties: {
        periods: ForecastPeriod[];
    };
}

// --- TOOL REGISTRATION ---

// 1. NEW TOOL: Get Coordinates
server.tool(
    "get_coordinates",
    "Get latitude and longitude for a city. Use this BEFORE getting a forecast.",
    {
        city: z.string().describe("City name (e.g. Livermore)"),
        state: z.string().length(2).describe("Two-letter state code (e.g. CA)"),
    },
    async ({ city, state }) => {
        const coords = await getCoordinates(city, state);
        if (!coords) {
            return {
                content: [{ type: "text", text: `Could not find coordinates for ${city}, ${state}.` }],
            };
        }

        return {
            content: [
                {
                    type: "text",
                    text: `Location: ${coords.display_name}\nLatitude: ${coords.lat}\nLongitude: ${coords.lon}`,
                },
            ],
        };
    }
);

// 2. EXISTING TOOL: Get Alerts
server.tool(
    "get_alerts",
    "Get weather alerts for a state",
    {
        state: z.string().length(2).describe("Two-letter state code (e.g. CA, NY)"),
    },
    async ({ state }) => {
        const stateCode = state.toUpperCase();
        const alertsUrl = `${NWS_API_BASE}/alerts?area=${stateCode}`;
        const alertsData = await makeNWSRequest<AlertsResponse>(alertsUrl);

        if (!alertsData) {
            return { content: [{ type: "text", text: "Failed to retrieve alerts data" }] };
        }

        const features = alertsData.features || [];
        if (features.length === 0) {
            return { content: [{ type: "text", text: `No active alerts for ${stateCode}` }] };
        }

        const formattedAlerts = features.map((f) =>
            `Event: ${f.properties.event}\nSeverity: ${f.properties.severity}\nHeadline: ${f.properties.headline}\n---`
        );

        return {
            content: [{ type: "text", text: `Active alerts for ${stateCode}:\n\n${formattedAlerts.join("\n")}` }],
        };
    }
);

// 3. EXISTING TOOL: Get Forecast
server.tool(
    "get_forecast",
    "Get weather forecast for a location (requires latitude/longitude)",
    {
        latitude: z.number().min(-90).max(90).describe("Latitude of the location"),
        longitude: z.number().min(-180).max(180).describe("Longitude of the location"),
    },
    async ({ latitude, longitude }) => {
        const pointsUrl = `${NWS_API_BASE}/points/${latitude.toFixed(4)},${longitude.toFixed(4)}`;
        const pointsData = await makeNWSRequest<PointsResponse>(pointsUrl);

        if (!pointsData?.properties?.forecast) {
            return { content: [{ type: "text", text: "Failed to get forecast URL. Location might be outside US." }] };
        }

        const forecastData = await makeNWSRequest<ForecastResponse>(pointsData.properties.forecast);
        const periods = forecastData?.properties?.periods || [];

        if (periods.length === 0) {
            return { content: [{ type: "text", text: "No forecast periods available" }] };
        }

        const formattedForecast = periods.map((period) =>
            `${period.name}: ${period.temperature}°${period.temperatureUnit} - ${period.shortForecast}`
        );

        return {
            content: [
                {
                    type: "text",
                    text: `Forecast for ${latitude}, ${longitude}:\n\n${formattedForecast.join("\n")}`,
                },
            ],
        };
    }
);

// --- MAIN EXECUTION ---
async function main() {
    const transport = new StdioServerTransport();
    await server.connect(transport);
    console.error("Weather MCP Server running on stdio");
}

main().catch((error) => {
    console.error("Fatal error in main():", error);
    process.exit(1);
});
