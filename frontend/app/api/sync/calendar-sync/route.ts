import { compareMeetings } from "./page";

export async function GET() {
  try {
    console.log("API route: Starting comparison process");
    const result = await compareMeetings();
    console.log("API route: Comparison completed with result:", result);
    return Response.json(result);
  } catch (error) {
    console.error("API route error:", error);
    return Response.json(
      { 
        error: error instanceof Error ? error.message : "Unknown error",
        details: error instanceof Error ? error.stack : String(error)
      },
      { status: 500 }
    );
  }
}