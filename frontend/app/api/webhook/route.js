import { NextResponse } from "next/server";

export async function POST(request) {
  try {
    const { message } = await request.json();

    const response = await fetch(
      "https://hook.us1.make.com/ew2llfrdpka1yc3iaud07eckhthbayar",
      {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ message }),
      }
    );

    // check if webhook was successful
    if (response.ok) {
      return NextResponse.json({ message: "Hello World" });
    } else {
      throw new Error("Failed to send payload to webhook URL");
    }
  } catch (error) {
    console.error(error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
