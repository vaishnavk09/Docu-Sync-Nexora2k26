import { useEffect, useState } from "react";
import { collection, onSnapshot } from "firebase/firestore";
import { db } from "@/lib/firebase";

export type CursorPointer = {
  userId: string;
  x: number;
  y: number;
  timestamp: number;
  color: string;
};

export function useCursorPresence(docId: string | null) {
  const [cursors, setCursors] = useState<CursorPointer[]>([]);

  useEffect(() => {
    if (!docId) return;

    const unsub = onSnapshot(
      collection(db, "documents", docId, "cursors"),
      (snapshot) => {
        const list = snapshot.docs.map((doc) => doc.data() as CursorPointer);
        setCursors(list);
      },
      (error) => {
        console.error("Cursor presence error:", error);
      }
    );

    return () => unsub();
  }, [docId]);

  return cursors;
}
