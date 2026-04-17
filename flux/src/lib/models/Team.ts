import mongoose, { Schema, Document } from "mongoose";

export interface ITeam extends Document {
  name: string;
  ownerId: string; // Firebase UID
  members: string[]; // Email addresses
  createdAt: Date;
  updatedAt: Date;
}

const TeamSchema = new Schema(
  {
    name: { type: String, required: true },
    ownerId: { type: String, required: true },
    members: { type: [String], default: [] },
  },
  { timestamps: true }
);

export const TeamModel = mongoose.models.Team || mongoose.model<ITeam>("Team", TeamSchema);
