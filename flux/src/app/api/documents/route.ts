import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { DocumentModel } from "@/lib/models/Document";
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

    // documents are accessible if:
    // 1. You own it
    // 2. You are in sharedWith
    // 3. You belong to the team it's assigned to
    const teams = await TeamModel.find({
      $or: [{ ownerId: userId }, { members: userEmail }],
    }).select("_id");
    
    const teamIds = teams.map((t) => t._id.toString());

    const docs = await DocumentModel.find({
      $or: [
        { ownerId: userId },
        { sharedWith: userEmail },
        { teamId: { $in: teamIds } }
      ],
    }).sort({ updatedAt: -1 });

    return NextResponse.json(docs, { status: 200 });
  } catch (error) {
    console.error("GET docs error", error);
    return NextResponse.json({ error: "Failed to fetch docs" }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const { title, ownerId, teamId } = body;

    if (!title || !ownerId) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    await connectToDatabase();

    const doc = await DocumentModel.create({
      title,
      ownerId,
      teamId: teamId || null,
      sharedWith: [],
    });

    return NextResponse.json(doc, { status: 201 });
  } catch (error) {
    console.error("POST doc error", error);
    return NextResponse.json({ error: "Failed to create doc" }, { status: 500 });
  }
}
