import { NextResponse } from "next/server";
import { doc, getDoc, setDoc } from "firebase/firestore";

import { db } from "@/lib/firebase";

export async function POST(req: Request) {
  try {
    const { docId, email, requesterId } = await req.json();

    if (!docId || !email || !requesterId) {
      return NextResponse.json(
        { error: "docId, email, and requesterId are required." },
        { status: 400 }
      );
    }

    const docRef = doc(db, "documents", docId);
    const snapshot = await getDoc(docRef);

    if (!snapshot.exists()) {
      return NextResponse.json({ error: "Document not found." }, { status: 404 });
    }

    const data = snapshot.data() as {
      ownerId?: string;
      allowedUsers?: string[];
    };

    // If no owner yet, set the requester as owner
    if (!data.ownerId) {
      await setDoc(docRef, { ownerId: requesterId }, { merge: true });
    } else if (data.ownerId !== requesterId) {
      return NextResponse.json(
        { error: "Only the document owner can share." },
        { status: 403 }
      );
    }

    const currentAllowed = data.allowedUsers ?? [];

    if (currentAllowed.includes(email)) {
      return NextResponse.json({ message: "User already has access." });
    }

    const updatedAllowed = [...currentAllowed, email];

    await setDoc(docRef, { allowedUsers: updatedAllowed }, { merge: true });

    return NextResponse.json({
      message: "User added successfully.",
      allowedUsers: updatedAllowed,
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to share document." },
      { status: 500 }
    );
  }
}

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const docId = searchParams.get("docId");

    if (!docId) {
      return NextResponse.json({ error: "docId is required." }, { status: 400 });
    }

    const docRef = doc(db, "documents", docId);
    const snapshot = await getDoc(docRef);

    if (!snapshot.exists()) {
      return NextResponse.json({ allowedUsers: [], ownerId: null });
    }

    const data = snapshot.data() as {
      ownerId?: string;
      allowedUsers?: string[];
    };

    return NextResponse.json({
      ownerId: data.ownerId ?? null,
      allowedUsers: data.allowedUsers ?? [],
    });
  } catch (error) {
    return NextResponse.json(
      { error: "Failed to fetch sharing info." },
      { status: 500 }
    );
  }
}
