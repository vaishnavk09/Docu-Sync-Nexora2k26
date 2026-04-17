import { NextResponse } from "next/server";
import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

import { connectToDatabase } from "@/lib/db";
import { DocumentModel } from "@/lib/models/Document";
import { TeamModel } from "@/lib/models/Team";

const snapshotSchema = new Schema(
  {
    docId: { type: String, required: true, index: true },
    content: { type: Schema.Types.Mixed, required: true },
    timestamp: { type: Number, required: true, index: true },
    authorId: { type: String, required: true },
  },
  {
    versionKey: false,
  },
);

type SnapshotDocument = InferSchemaType<typeof snapshotSchema>;

const SnapshotModel =
  (mongoose.models.Snapshot as Model<SnapshotDocument>) ||
  mongoose.model<SnapshotDocument>("Snapshot", snapshotSchema, "snapshots");

async function checkPermission(docId: string, userId: string | null, userEmail: string | null) {
  if (docId === "main") return true;

  if (!userId || !userEmail) return false;

  const doc = await DocumentModel.findById(docId);
  if (!doc) return false;

  if (doc.ownerId === userId || doc.sharedWith.includes(userEmail)) return true;

  if (doc.teamId) {
    const team = await TeamModel.findById(doc.teamId);
    if (team && (team.ownerId === userId || team.members.includes(userEmail))) {
      return true;
    }
  }

  return false;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const docId = searchParams.get("docId");
  const userId = searchParams.get("userId");
  const userEmail = searchParams.get("userEmail");

  if (!docId) {
    return NextResponse.json({ error: "docId is required." }, { status: 400 });
  }

  await connectToDatabase();

  const hasAccess = await checkPermission(docId, userId, userEmail);
  if (!hasAccess) {
    return NextResponse.json({ error: "Access denied or Team not found." }, { status: 403 });
  }

  const snapshots = await SnapshotModel.find({ docId })
    .sort({ timestamp: -1 })
    .lean();

  return NextResponse.json(snapshots);
}

export async function POST(request: Request) {
  const body = (await request.json()) as {
    docId?: string;
    content?: unknown;
    authorId?: string;
    userEmail?: string;
  };

  if (!body.docId || !body.content || !body.authorId) {
    return NextResponse.json(
      { error: "docId, content, and authorId are required." },
      { status: 400 },
    );
  }

  await connectToDatabase();

  const hasAccess = await checkPermission(body.docId, body.authorId, body.userEmail || null);
  if (!hasAccess) {
    return NextResponse.json({ error: "Access denied or Team not found." }, { status: 403 });
  }

  const snapshot = await SnapshotModel.create({
    docId: body.docId,
    content: body.content,
    timestamp: Date.now(),
    authorId: body.authorId,
  });

  return NextResponse.json(snapshot.toObject(), { status: 201 });
}

export async function DELETE(request: Request) {
  const { searchParams } = new URL(request.url);
  const snapshotId = searchParams.get("snapshotId");
  const docId = searchParams.get("docId");
  const clearAll = searchParams.get("clearAll");
  const userId = searchParams.get("userId");
  const userEmail = searchParams.get("userEmail");

  await connectToDatabase();

  // If docId is passed directly, verify it. 
  // If only snapshotId is passed we must look up the snapshot to get its docId.
  let targetDocId = docId;

  if (!targetDocId && snapshotId) {
    const sn = await SnapshotModel.findById(snapshotId);
    if (!sn) return NextResponse.json({ error: "Not found" }, { status: 404 });
    targetDocId = sn.docId;
  }

  if (!targetDocId) {
    return NextResponse.json({ error: "Missing parameters" }, { status: 400 });
  }

  const hasAccess = await checkPermission(targetDocId, userId, userEmail);
  if (!hasAccess) {
    return NextResponse.json({ error: "Access denied or Team not found." }, { status: 403 });
  }

  if (clearAll === "true") {
    await SnapshotModel.deleteMany({ docId: targetDocId });
    return NextResponse.json({ success: true });
  }

  if (!snapshotId) {
    return NextResponse.json({ error: "snapshotId is required." }, { status: 400 });
  }

  await SnapshotModel.findByIdAndDelete(snapshotId);

  return NextResponse.json({ success: true });
}
