"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  collection,
  onSnapshot,
  doc,
  setDoc,
  query,
  orderBy,
} from "firebase/firestore";

import { db } from "@/lib/firebase";
import { useAuth } from "@/hooks/useAuth";
import { signInWithGoogle, signOutUser } from "@/lib/auth";

type DocMeta = {
  docId: string;
  title: string;
  ownerId: string;
  createdAt: number;
};

export default function Dashboard() {
  const { user, loading } = useAuth();
  const router = useRouter();
  const [documents, setDocuments] = useState<DocMeta[]>([]);
  const [newTitle, setNewTitle] = useState("");
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    if (!user) return;

    const docsRef = collection(db, "documentsList");
    const docsQuery = query(docsRef, orderBy("createdAt", "desc"));

    const unsubscribe = onSnapshot(docsQuery, (snapshot) => {
      const docs = snapshot.docs.map((d) => {
        const data = d.data() as Omit<DocMeta, "docId">;
        return { docId: d.id, ...data };
      });
      setDocuments(docs);
    });

    return unsubscribe;
  }, [user]);

  const createDocument = async () => {
    if (!user || !newTitle.trim() || creating) return;

    try {
      setCreating(true);
      const docId = crypto.randomUUID();

      await setDoc(doc(db, "documentsList", docId), {
        title: newTitle.trim(),
        ownerId: user.uid,
        createdAt: Date.now(),
      });

      setNewTitle("");
      router.push(`/doc/${docId}`);
    } catch (e) {
      console.error("Failed to create document:", e);
    } finally {
      setCreating(false);
    }
  };

  if (loading) {
    return (
      <main style={{ padding: 40, fontFamily: "monospace", fontSize: 18 }}>
        <h1>Flux</h1>
        <p>Loading...</p>
      </main>
    );
  }

  if (!user) {
    return (
      <main
        style={{
          minHeight: "100vh",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          fontFamily: "Arial, sans-serif",
          backgroundColor: "#f7f7fb",
        }}
      >
        <div
          style={{
            padding: 40,
            border: "1px solid #e5e7eb",
            borderRadius: 16,
            backgroundColor: "#ffffff",
            textAlign: "center",
            maxWidth: 400,
          }}
        >
          <h1 style={{ margin: "0 0 8px", fontSize: 32 }}>Flux</h1>
          <p style={{ color: "#6b7280", marginBottom: 24 }}>
            Real-time collaborative document platform
          </p>
          <button
            type="button"
            onClick={() => void signInWithGoogle()}
            style={{
              padding: "10px 24px",
              fontSize: 15,
              borderRadius: 8,
              border: "1px solid #d1d5db",
              backgroundColor: "#ffffff",
              cursor: "pointer",
            }}
          >
            Sign in with Google
          </button>
        </div>
      </main>
    );
  }

  return (
    <main
      style={{
        minHeight: "100vh",
        padding: 24,
        fontFamily: "Arial, sans-serif",
        backgroundColor: "#f7f7fb",
        color: "#111827",
      }}
    >
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          padding: 16,
          marginBottom: 24,
          border: "1px solid #e5e7eb",
          borderRadius: 12,
          backgroundColor: "#ffffff",
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 28 }}>Flux</h1>
          <p style={{ margin: "6px 0 0", color: "#6b7280" }}>
            Your Documents
          </p>
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <span style={{ fontSize: 14, color: "#6b7280" }}>
            {user.email}
          </span>
          <button
            type="button"
            onClick={() => void signOutUser()}
            style={{
              padding: "6px 14px",
              fontSize: 13,
              borderRadius: 8,
              border: "1px solid #d1d5db",
              backgroundColor: "#ffffff",
              cursor: "pointer",
            }}
          >
            Sign Out
          </button>
        </div>
      </header>

      {/* Create new document */}
      <section
        style={{
          padding: 20,
          border: "1px solid #e5e7eb",
          borderRadius: 12,
          backgroundColor: "#ffffff",
          marginBottom: 24,
        }}
      >
        <h2 style={{ margin: "0 0 12px", fontSize: 18 }}>Create New Document</h2>
        <div style={{ display: "flex", gap: 10 }}>
          <input
            type="text"
            placeholder="Document title..."
            value={newTitle}
            onChange={(e) => setNewTitle(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") void createDocument(); }}
            style={{
              flex: 1,
              padding: "10px 14px",
              borderRadius: 8,
              border: "1px solid #d1d5db",
              fontSize: 15,
              outline: "none",
            }}
          />
          <button
            type="button"
            onClick={() => void createDocument()}
            disabled={creating || !newTitle.trim()}
            style={{
              padding: "10px 20px",
              fontSize: 14,
              borderRadius: 8,
              border: "1px solid #6366f1",
              backgroundColor: "#6366f1",
              color: "#ffffff",
              cursor: "pointer",
              fontWeight: 600,
            }}
          >
            {creating ? "Creating..." : "Create"}
          </button>
        </div>
      </section>

      {/* Document list */}
      <section
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fill, minmax(280px, 1fr))",
          gap: 16,
        }}
      >
        {documents.map((d) => (
          <div
            key={d.docId}
            onClick={() => router.push(`/doc/${d.docId}`)}
            style={{
              padding: 20,
              border: "1px solid #e5e7eb",
              borderRadius: 12,
              backgroundColor: "#ffffff",
              cursor: "pointer",
              transition: "box-shadow 0.15s",
            }}
            onMouseEnter={(e) => {
              (e.currentTarget as HTMLDivElement).style.boxShadow = "0 4px 12px rgba(0,0,0,0.08)";
            }}
            onMouseLeave={(e) => {
              (e.currentTarget as HTMLDivElement).style.boxShadow = "none";
            }}
          >
            <h3 style={{ margin: "0 0 8px", fontSize: 16 }}>
              {d.title || "Untitled"}
            </h3>
            <p style={{ margin: 0, fontSize: 12, color: "#9ca3af" }}>
              Created {new Date(d.createdAt).toLocaleDateString()}
            </p>
            {d.ownerId === user.uid && (
              <span
                style={{
                  display: "inline-block",
                  marginTop: 8,
                  padding: "2px 8px",
                  fontSize: 11,
                  borderRadius: 999,
                  backgroundColor: "#eef2ff",
                  color: "#4338ca",
                  fontWeight: 600,
                }}
              >
                Owner
              </span>
            )}
          </div>
        ))}

        {documents.length === 0 && (
          <p style={{ color: "#9ca3af", gridColumn: "1 / -1", textAlign: "center", padding: 40 }}>
            No documents yet. Create your first one above!
          </p>
        )}
      </section>
    </main>
  );
}
