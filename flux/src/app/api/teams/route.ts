import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { TeamModel } from "@/lib/models/Team";

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const userId = searchParams.get("userId");
    const userEmail = searchParams.get("userEmail");

    if (!userId || !userEmail) {
      return NextResponse.json({ error: "Missing identity params" }, { status: 400 });
    }

    await connectToDatabase();

    // Fetch teams where user is owner OR their email is in the members list
    const teams = await TeamModel.find({
      $or: [{ ownerId: userId }, { members: userEmail }],
    }).sort({ createdAt: -1 });

    return NextResponse.json(teams, { status: 200 });
  } catch (error) {
    console.error("GET teams error", error);
    return NextResponse.json({ error: "Failed to fetch teams" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { name, ownerId, ownerEmail } = body;

    if (!name || !ownerId || !ownerEmail) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    await connectToDatabase();

    const team = await TeamModel.create({
      name,
      ownerId,
      // The owner is implicitly part of the team, but we don't strictly need their email in members.
      // However, putting it in members can simplify logic.
      members: [ownerEmail],
    });

    return NextResponse.json(team, { status: 201 });
  } catch (error) {
    console.error("POST team error", error);
    return NextResponse.json({ error: "Failed to create team" }, { status: 500 });
  }
}
