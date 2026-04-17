import { useEffect, useState } from "react";
import { collection, onSnapshot, query, orderBy } from "firebase/firestore";
import { db } from "@/lib/firebase";

export type SnapshotMetadata = {
  snapshotId: string;
  timestamp: number;
  authorId: string;
};

export function useSnapshotSync(docId: string | null) {
  const [snapshots, setSnapshots] = useState<SnapshotMetadata[]>([]);

  useEffect(() => {
    if (!docId) return;

    const q = query(
      collection(db, "documents", docId, "snapshots"),
      orderBy("timestamp", "desc")
    );

    const unsubscribe = onSnapshot(
      q,
      (snapshot) => {
        const list = snapshot.docs.map((doc) => doc.data() as SnapshotMetadata);
        setSnapshots(list);
      },
      (error) => {
        console.error("Snapshot sync error:", error);
      }
    );

    return () => unsubscribe();
  }, [docId]);

  return snapshots;
}
