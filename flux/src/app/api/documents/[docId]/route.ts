import { NextResponse } from "next/server";
import { connectToDatabase } from "@/lib/db";
import { DocumentModel } from "@/lib/models/Document";
import { TeamModel } from "@/lib/models/Team";

export async function DELETE(req: Request, { params }: { params: Promise<{ docId: string }> }) {
  try {
    const { docId } = await params;
    const { searchParams } = new URL(req.url);
    const ownerId = searchParams.get("ownerId");

    if (!docId || !ownerId) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    await connectToDatabase();

    const doc = await DocumentModel.findOneAndDelete({ _id: docId, ownerId });
    if (!doc) {
      return NextResponse.json({ error: "Document not found or unauthorized" }, { status: 404 });
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("DELETE document error", error);
    return NextResponse.json({ error: "Failed to delete document" }, { status: 500 });
  }
}

export async function PUT(req: Request, { params }: { params: Promise<{ docId: string }> }) {
  try {
    const { docId } = await params;
    const body = await req.json();
    const { title, ownerId, userEmail } = body;

    if (!docId || (!title && title !== "")) {
      return NextResponse.json({ error: "Missing required fields" }, { status: 400 });
    }

    await connectToDatabase();

    const doc = await DocumentModel.findById(docId);
    if (!doc) {
      return NextResponse.json({ error: "Document not found" }, { status: 404 });
    }

    // Checking access
    let hasAccess = false;
    if (doc.ownerId === ownerId || doc.sharedWith.includes(userEmail)) {
      hasAccess = true;
    } else if (doc.teamId) {
      const team = await TeamModel.findById(doc.teamId);
      if (team && (team.ownerId === ownerId || team.members.includes(userEmail))) {
        hasAccess = true;
      }
    }

    if (!hasAccess) {
      return NextResponse.json({ error: "Unauthorized to update" }, { status: 403 });
    }

    doc.title = title;
    await doc.save();

    return NextResponse.json(doc, { status: 200 });
  } catch (error) {
    console.error("PUT document error", error);
    return NextResponse.json({ error: "Failed to update document" }, { status: 500 });
  }
}
