import mongoose, { Schema, Document } from "mongoose";

export interface IDocument extends Document {
  title: string;
  ownerId: string; // Firebase UID
  teamId?: string; // Optional team binding
  sharedWith: string[]; // Email addresses
  createdAt: Date;
  updatedAt: Date;
}

const DocumentSchema = new Schema(
  {
    title: { type: String, required: true },
    ownerId: { type: String, required: true },
    teamId: { type: String, default: null },
    sharedWith: { type: [String], default: [] },
  },
  { timestamps: true }
);

export const DocumentModel =
  mongoose.models.Document || mongoose.model<IDocument>("Document", DocumentSchema);
