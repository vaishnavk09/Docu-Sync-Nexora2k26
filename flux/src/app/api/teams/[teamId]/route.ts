import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { TeamModel } from "@/lib/models/Team";

// Add a member
export async function POST(req: Request, { params }: { params: Promise<{ teamId: string }> }) {
  try {
    const { teamId } = await params;
    const body = await req.json();
    const { email } = body;

    if (!teamId || !email) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    await connectToDatabase();

    // Find the team and push the new email if not present
    const team = await TeamModel.findByIdAndUpdate(
      teamId,
      { $addToSet: { members: email } },
      { new: true }
    );

    if (!team) {
      return NextResponse.json({ error: "Team not found" }, { status: 404 });
    }

    return NextResponse.json(team, { status: 200 });
  } catch (error) {
    console.error("POST team member error", error);
    return NextResponse.json({ error: "Failed to add member" }, { status: 500 });
  }
}

// Remove a member or delete team
export async function DELETE(req: Request, { params }: { params: Promise<{ teamId: string }> }) {
  try {
    const { teamId } = await params;
    const { searchParams } = new URL(req.url);
    const email = searchParams.get("email");
    const ownerId = searchParams.get("ownerId");

    if (!teamId) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    await connectToDatabase();

    if (ownerId && !email) {
      // It's a team deletion request by owner
      const team = await TeamModel.findOneAndDelete({ _id: teamId, ownerId });
      if (!team) {
        return NextResponse.json({ error: "Team not found or not authorized" }, { status: 404 });
      }
      return NextResponse.json({ message: "Team deleted" }, { status: 200 });
    }

    if (email) {
      // It's a member removal request
      const team = await TeamModel.findByIdAndUpdate(
        teamId,
        { $pull: { members: email } },
        { new: true }
      );
      if (!team) {
        return NextResponse.json({ error: "Team not found" }, { status: 404 });
      }
      return NextResponse.json(team, { status: 200 });
    }

    return NextResponse.json({ error: "Invalid delete parameters" }, { status: 400 });
  } catch (error) {
    console.error("DELETE team/member error", error);
    return NextResponse.json({ error: "Failed to delete" }, { status: 500 });
  }
}
