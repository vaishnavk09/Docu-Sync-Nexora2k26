import { NextResponse } from "next/server";
import mongoose, { Schema, type InferSchemaType, type Model } from "mongoose";

import { connectToDatabase } from "@/lib/db";

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

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const docId = searchParams.get("docId");

  if (!docId) {
    return NextResponse.json({ error: "docId is required." }, { status: 400 });
  }

  await connectToDatabase();

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
  };

  if (!body.docId || !body.content || !body.authorId) {
    return NextResponse.json(
      { error: "docId, content, and authorId are required." },
      { status: 400 },
    );
  }

  await connectToDatabase();

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

  await connectToDatabase();

  if (clearAll === "true") {
    if (!docId) {
      return NextResponse.json({ error: "docId is required." }, { status: 400 });
    }

    await SnapshotModel.deleteMany({ docId });
    return NextResponse.json({ success: true });
  }

  if (!snapshotId) {
    return NextResponse.json({ error: "snapshotId is required." }, { status: 400 });
  }

  await SnapshotModel.findByIdAndDelete(snapshotId);

  return NextResponse.json({ success: true });
}
