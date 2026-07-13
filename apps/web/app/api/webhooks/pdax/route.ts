import { NextResponse } from "next/server";

export async function POST() {
  return NextResponse.json(
    {
      error:
        "This unsigned callback endpoint has been retired. Re-register the versioned PDAX callback URL.",
    },
    { status: 410 },
  );
}
