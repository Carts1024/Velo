import { NextRequest, NextResponse } from "next/server";

export async function GET(request: NextRequest) {
  return NextResponse.json({
    name: "Velo temporary webhook tester",
    endpoint: new URL("/api/webhook-tester", request.url).toString(),
    method: "POST",
    options: {
      status: "Use ?status=500 to return a custom HTTP status.",
      delay: "Use ?delay=1000 to delay the response by up to 5000ms.",
    },
  });
}

export async function POST(request: NextRequest) {
  const requestedStatus = Number(request.nextUrl.searchParams.get("status") ?? "200");
  const requestedDelay = Number(request.nextUrl.searchParams.get("delay") ?? "0");
  const statusesWithoutJsonBodies = new Set([204, 205, 304]);
  const status =
    Number.isInteger(requestedStatus) &&
    requestedStatus >= 200 &&
    requestedStatus <= 599 &&
    !statusesWithoutJsonBodies.has(requestedStatus)
      ? requestedStatus
      : 200;
  const delay = Number.isFinite(requestedDelay) ? Math.min(5_000, Math.max(0, requestedDelay)) : 0;
  const payload = await request.json().catch(() => null);

  if (delay > 0) {
    await new Promise((resolve) => setTimeout(resolve, delay));
  }

  console.info("Velo temporary webhook tester received", {
    event: request.headers.get("x-velo-event"),
    delivery: request.headers.get("x-velo-delivery"),
    payload,
  });

  return NextResponse.json(
    {
      received: true,
      event: request.headers.get("x-velo-event"),
      delivery: request.headers.get("x-velo-delivery"),
      receivedAt: new Date().toISOString(),
    },
    { status },
  );
}
