"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import type { JSONContent } from "@tiptap/core";
import { doc as firestoreDoc, setDoc as firestoreSetDoc, deleteDoc as firestoreDeleteDoc } from "firebase/firestore";

import Editor from "@/components/Editor";
import { useDocumentSync } from "@/hooks/useDocumentSync";
import { usePresence } from "@/hooks/usePresence";
import { useAuth } from "@/hooks/useAuth";
import { useSnapshotSync } from "@/hooks/useSnapshotSync";
import { useCursorPresence } from "@/hooks/useCursorPresence";
import { db } from "@/lib/firebase";
import { signInWithGoogle, signOutUser } from "@/lib/auth";
import { getUserColor } from "@/lib/color";

function throttle<T extends (...args: any[]) => void>(fn: T, delay: number) {
  let last = 0;
  return (...args: Parameters<T>) => {
    const now = Date.now();
    if (now - last > delay) {
      last = now;
      fn(...args);
    }
  };
}

const initialDoc: JSONContent = {
  type: "doc",
  content: [{ type: "paragraph" }],
};

const DOC_ID = "main";

type SnapshotContent = {
  _id: string;
  docId: string;
  content: JSONContent;
  timestamp: number;
  authorId: string;
};

function getAuthErrorMessage(error: unknown) {
  if (typeof error === "object" && error !== null && "code" in error) {
    const code = (error as { code?: string }).code;

    switch (code) {
      case "auth/popup-blocked":
        return "Popup blocked. Allow popups and try again.";
      case "auth/cancelled-popup-request":
        return "Sign-in cancelled.";
      default:
        return "Authentication failed.";
    }
  }

  return "Authentication error.";
}

function getUserLabelFromId(userId: string | undefined, users: { userId: string; email: string }[]) {
  if (!userId) return "unknown";

  const user = users.find((entry) => entry.userId === userId);
  return user?.email ?? userId.slice(0, 6);
}

function formatTimeAgo(timestamp: number) {
  const diff = Date.now() - timestamp;

  if (diff < 1000) return "just now";
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;

  return new Date(timestamp).toLocaleTimeString();
}

export default function Home() {
  const { user, loading } = useAuth();
  const [authError, setAuthError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [doc, setDoc] = useState<JSONContent>(initialDoc);
  const [currentAuthor, setCurrentAuthor] = useState<string | null>(null);
  const snapshots = useSnapshotSync(user ? DOC_ID : null);
  const snapshotCache = useRef<Record<string, JSONContent>>({});
  const [snapshotError, setSnapshotError] = useState<string | null>(null);
  const [summary, setSummary] = useState<string | null>(null);
  const [loadingSummary, setLoadingSummary] = useState(false);
  const [savingSnapshot, setSavingSnapshot] = useState(false);
  const [deletingSnapshotId, setDeletingSnapshotId] = useState<string | null>(null);
  const [showClearSnapshotsModal, setShowClearSnapshotsModal] = useState(false);
  const [shareEmail, setShareEmail] = useState("");
  const [shareStatus, setShareStatus] = useState<string | null>(null);
  const [sharing, setSharing] = useState(false);
  const lastSnapshotRef = useRef<JSONContent | null>(null);
  const lastEditRef = useRef<number>(0);
  const lastSaveTimeRef = useRef<number>(0);
  const isRestoringRef = useRef(false);

  const userId = user?.uid ?? "anonymous";
  const userLabel = user?.email ?? "anonymous";

  const { meta } = useDocumentSync(userId, doc, setDoc);

  const userColor = useMemo(() => getUserColor(userId), [userId]);
  const { activeUsers } = usePresence(userId, userLabel, userColor);
  const cursors = useCursorPresence(user ? DOC_ID : null);
  
  const activeCursors = cursors.filter(
    (c) => Date.now() - c.timestamp < 5000 && c.userId !== userId
  );

  const updateCursorPosition = useMemo(
    () =>
      throttle(async (x: number, y: number) => {
        if (!user || !userColor) return;
        try {
          await firestoreSetDoc(
            firestoreDoc(db, "documents", DOC_ID, "cursors", userId),
            {
              userId,
              x,
              y,
              timestamp: Date.now(),
              color: userColor,
            }
          );
        } catch (e) {
          // Ignore write permissions if unmounting or offline
        }
      }, 100),
    [user, userId, userColor]
  );

  useEffect(() => {
    return () => {
      if (userId && userId !== "anonymous") {
        firestoreDeleteDoc(firestoreDoc(db, "documents", DOC_ID, "cursors", userId)).catch(() => {});
      }
    };
  }, [userId]);

  const handleSummarize = async () => {
    setLoadingSummary(true);
    try {
      const response = await fetch("/api/summarize", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ content: doc }),
      });
      if (!response.ok) throw new Error("Failed to summarize");
      const data = await response.json();
      setSummary(data.summary);
    } catch (e) {
      console.error(e);
    } finally {
      setLoadingSummary(false);
    }
  };

  const restoreSnapshot = async (snapshotId: string) => {
    isRestoringRef.current = true;
    if (snapshotCache.current[snapshotId]) {
      setDoc(snapshotCache.current[snapshotId]);
      return;
    }
    try {
      const response = await fetch(`/api/snapshot?docId=${DOC_ID}`, {
        cache: "no-store",
      });
      if (!response.ok) throw new Error("Failed to load snapshot.");
      const data = (await response.json()) as SnapshotContent[];
      
      data.forEach(s => {
        snapshotCache.current[s._id] = s.content;
      });

      const snapshot = data.find(s => s._id === snapshotId);
      if (snapshot) {
        setDoc(snapshot.content);
      }
    } catch (error) {
      console.error(error);
      setSnapshotError(error instanceof Error ? error.message : "Failed to restore.");
    }
  };

  const saveSnapshot = async () => {
    if (!user || savingSnapshot || !doc.content?.length) return;

    if (lastSnapshotRef.current && JSON.stringify(lastSnapshotRef.current) === JSON.stringify(doc)) {
      return;
    }

    if (Date.now() - lastSaveTimeRef.current < 2000) return;

    try {
      setSavingSnapshot(true);
      setSnapshotError(null);
      lastSaveTimeRef.current = Date.now();

      const response = await fetch("/api/snapshot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ docId: DOC_ID, content: doc, authorId: userId }),
      });

      if (!response.ok) throw new Error("Failed to save snapshot.");

      const newSnapshot = (await response.json()) as SnapshotContent;
      
      // Write to Firestore Realtime Layer
      await firestoreSetDoc(
        firestoreDoc(db, "documents", DOC_ID, "snapshots", newSnapshot._id),
        {
          snapshotId: newSnapshot._id,
          timestamp: newSnapshot.timestamp,
          authorId: newSnapshot.authorId,
        }
      );

      snapshotCache.current[newSnapshot._id] = newSnapshot.content;
      lastSnapshotRef.current = doc;
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to save snapshot.";
      setSnapshotError(message);
    } finally {
      setSavingSnapshot(false);
    }
  };

  const deleteSnapshot = async (snapshotId: string) => {
    try {
      setDeletingSnapshotId(snapshotId);
      setSnapshotError(null);

      // Async DB deletion
      fetch(`/api/snapshot?snapshotId=${snapshotId}`, { method: "DELETE" }).catch(console.error);

      // Instant Firestore deletion for realtime feel
      await firestoreDeleteDoc(firestoreDoc(db, "documents", DOC_ID, "snapshots", snapshotId));
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to delete snapshot.";
      setSnapshotError(message);
    } finally {
      setDeletingSnapshotId(null);
    }
  };

  const clearAllSnapshots = async () => {
    try {
      setSnapshotError(null);

      const response = await fetch(`/api/snapshot?docId=${DOC_ID}&clearAll=true`, {
        method: "DELETE",
      });

      if (!response.ok) throw new Error("Failed to clear snapshots.");

      // For realtime UI, we iterate the metadata and remove from Firestore
      const promises = snapshots.map((s) =>
        firestoreDeleteDoc(firestoreDoc(db, "documents", DOC_ID, "snapshots", s.snapshotId))
      );
      await Promise.all(promises);

      setShowClearSnapshotsModal(false);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Failed to clear snapshots.";
      setSnapshotError(message);
    }
  };

  useEffect(() => {
    if (!user) {
      return;
    }

    if (isRestoringRef.current) {
      isRestoringRef.current = false;
      return;
    }

    const timeoutId = window.setTimeout(() => {
      const now = Date.now();

      if (now - lastEditRef.current < 5000) {
        if (
          lastSnapshotRef.current &&
          JSON.stringify(lastSnapshotRef.current) === JSON.stringify(doc)
        ) {
          return;
        }

        if (document.visibilityState !== "visible") return;

        void saveSnapshot();
      }
    }, 5000);

    return () => window.clearTimeout(timeoutId);
  }, [doc, user]);

  const handleSignIn = async () => {
    if (submitting) return;

    try {
      setSubmitting(true);
      setAuthError(null);
      await signInWithGoogle();
    } catch (error) {
      setAuthError(getAuthErrorMessage(error));
    } finally {
      setSubmitting(false);
    }
  };

  const handleSignOut = async () => {
    if (submitting) return;

    try {
      setSubmitting(true);
      setAuthError(null);
      await signOutUser();
    } catch (error) {
      setAuthError(getAuthErrorMessage(error));
    } finally {
      setSubmitting(false);
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

  return (
    <main
      onMouseMove={(e) => updateCursorPosition(e.clientX, e.clientY)}
      style={{
        minHeight: "100vh",
        padding: 24,
        fontFamily: "Arial, sans-serif",
        backgroundColor: "#f7f7fb",
        color: "#111827",
      }}
    >
      <div style={{ position: "fixed", top: 0, left: 0, right: 0, bottom: 0, pointerEvents: "none", zIndex: 9999 }}>
        {activeCursors.map((cursor) => (
          <div
            key={cursor.userId}
            style={{
              position: "absolute",
              left: cursor.x,
              top: cursor.y,
              backgroundColor: cursor.color,
              width: 12,
              height: 12,
              borderRadius: "50%",
              pointerEvents: "none",
              border: "2px solid white",
              boxShadow: "0 2px 4px rgba(0,0,0,0.2)",
              transition: "left 0.1s linear, top 0.1s linear"
            }}
          />
        ))}
      </div>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 16,
          padding: 16,
          marginBottom: 20,
          border: "1px solid #e5e7eb",
          borderRadius: 12,
          backgroundColor: "#ffffff",
        }}
      >
        <div>
          <h1 style={{ margin: 0, fontSize: 28 }}>Flux</h1>
          <p style={{ margin: "6px 0 0", color: "#6b7280" }}>
            Real-time collaborative editor
          </p>
        </div>

        {user ? (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              flexWrap: "wrap",
              justifyContent: "flex-end",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "8px 12px",
                borderRadius: 999,
                backgroundColor: "#f3f4f6",
              }}
            >
              <span
                style={{
                  width: 12,
                  height: 12,
                  borderRadius: "50%",
                  backgroundColor: userColor,
                  display: "inline-block",
                }}
              />
              <span>{userLabel}</span>
            </div>
            <button type="button" onClick={() => void saveSnapshot()} disabled={savingSnapshot}>
              {savingSnapshot ? "Saving Snapshot..." : "Save Snapshot"}
            </button>
            <button type="button" onClick={handleSignOut} disabled={submitting}>
              {submitting ? "Signing out..." : "Sign Out"}
            </button>
          </div>
        ) : null}
      </header>

      {!user ? (
        <div
          style={{
            padding: 24,
            border: "1px solid #e5e7eb",
            borderRadius: 12,
            backgroundColor: "#ffffff",
          }}
        >
          <button type="button" onClick={handleSignIn} disabled={submitting}>
            {submitting ? "Signing in..." : "Sign in with Google"}
          </button>
        </div>
      ) : (
        <section
          style={{
            display: "grid",
            gridTemplateColumns: "minmax(0, 7fr) minmax(280px, 3fr)",
            gap: 20,
            alignItems: "start",
          }}
        >
          <div
            style={{
              padding: 20,
              border: "1px solid #e5e7eb",
              borderRadius: 12,
              backgroundColor: "#ffffff",
              minHeight: 500,
            }}
          >
            <div style={{ marginBottom: 16 }}>
              <p style={{ margin: 0, fontWeight: 600 }}>
                {user.displayName ?? "Anonymous User"}
              </p>
              <p style={{ margin: "6px 0 0", color: "#6b7280" }}>{userLabel}</p>
            </div>
            <div style={{ marginBottom: 8, fontSize: 13, color: "#6b7280" }}>
              {currentAuthor ? (
                <>
                  Written by{" "}
                  <strong>
                    {currentAuthor === userId
                      ? "you"
                      : getUserLabelFromId(currentAuthor, activeUsers)}
                  </strong>
                </>
              ) : (
                "Unknown author"
              )}
            </div>

            <div style={{ marginBottom: 16 }}>
              <button 
                type="button" 
                onClick={() => void handleSummarize()}
                disabled={loadingSummary}
              >
                {loadingSummary ? "Summarizing..." : "Generate Summary"}
              </button>
              
              {summary && (
                <div style={{ marginTop: 12, padding: 12, backgroundColor: "#f9fafb", borderRadius: 8, border: "1px solid #e5e7eb" }}>
                  <h3 style={{ margin: "0 0 8px 0", fontSize: 14 }}>Summary</h3>
                  <p style={{ margin: 0, fontSize: 14, whiteSpace: "pre-wrap" }}>{summary}</p>
                </div>
              )}
            </div>

            <div style={{ marginBottom: 12, fontSize: 13, color: "#6b7280" }}>
              {meta.updatedBy ? (
                <>
                  Last edited by{" "}
                  <strong>
                    {meta.updatedBy === userId
                      ? "you"
                      : getUserLabelFromId(meta.updatedBy, activeUsers)}
                  </strong>{" "}
                  {meta.updatedAt ? <>• {formatTimeAgo(meta.updatedAt)}</> : null}
                </>
              ) : (
                "No edits yet"
              )}
            </div>
            <Editor
              value={doc}
              userId={userId}
              onChange={(newDoc) => {
                lastEditRef.current = Date.now();
                setDoc(newDoc);
              }}
              onCursorAuthorChange={setCurrentAuthor}
            />
          </div>

          <aside
            style={{
              display: "flex",
              flexDirection: "column",
              gap: 16,
            }}
          >
            <section
              style={{
                padding: 16,
                border: "1px solid #e5e7eb",
                borderRadius: 12,
                backgroundColor: "#ffffff",
              }}
            >
              <h2 style={{ marginTop: 0, marginBottom: 12, fontSize: 18 }}>Active Users</h2>
              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {activeUsers.map((activeUser) => {
                  const isCurrentUser = activeUser.userId === userId;

                  return (
                    <div
                      key={activeUser.userId}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 10,
                        padding: "8px 10px",
                        borderRadius: 10,
                        backgroundColor: isCurrentUser ? "#eef2ff" : "#f9fafb",
                        border: isCurrentUser ? "1px solid #c7d2fe" : "1px solid #f3f4f6",
                      }}
                    >
                      <span
                        style={{
                          width: 12,
                          height: 12,
                          borderRadius: "50%",
                          backgroundColor: activeUser.color,
                          display: "inline-block",
                          flexShrink: 0,
                        }}
                      />
                      <span style={{ overflow: "hidden", textOverflow: "ellipsis" }}>
                        {activeUser.email}
                        {isCurrentUser ? " (you)" : ""}
                      </span>
                    </div>
                  );
                })}
              </div>
            </section>

            <section
              style={{
                padding: 16,
                border: "1px solid #e5e7eb",
                borderRadius: 12,
                backgroundColor: "#ffffff",
              }}
            >
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                  gap: 12,
                  marginBottom: 12,
                }}
              >
                <h2 style={{ margin: 0, fontSize: 18 }}>Snapshots</h2>
                <button type="button" onClick={() => setShowClearSnapshotsModal(true)}>
                  Clear All
                </button>
              </div>
              <div style={{ maxHeight: 320, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10 }}>
                {snapshots.map((snapshot) => (
                  <div
                    key={snapshot.snapshotId}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "space-between",
                      gap: 8,
                      padding: 12,
                      borderRadius: 10,
                      border: "1px solid #e5e7eb",
                      backgroundColor: "#f9fafb",
                    }}
                  >
                    <button
                      type="button"
                      onClick={() => void restoreSnapshot(snapshot.snapshotId)}
                      style={{
                        border: "none",
                        background: "transparent",
                        textAlign: "left",
                        padding: 0,
                        flex: 1,
                        cursor: "pointer",
                      }}
                    >
                      <div>{new Date(snapshot.timestamp).toLocaleString()}</div>
                      <div style={{ color: "#6b7280", fontSize: 12 }}>
                        {snapshot.authorId.slice(0, 8)}
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => void deleteSnapshot(snapshot.snapshotId)}
                      disabled={deletingSnapshotId === snapshot.snapshotId}
                    >
                      {deletingSnapshotId === snapshot.snapshotId ? "Deleting..." : "Delete"}
                    </button>
                  </div>
                ))}
              </div>
            </section>

            <section
              style={{
                padding: 16,
                border: "1px solid #e5e7eb",
                borderRadius: 12,
                backgroundColor: "#ffffff",
              }}
            >
              <h2 style={{ marginTop: 0, marginBottom: 12, fontSize: 18 }}>Share Document</h2>
              <div style={{ display: "flex", gap: 8 }}>
                <input
                  type="email"
                  placeholder="Enter email to share"
                  value={shareEmail}
                  onChange={(e) => setShareEmail(e.target.value)}
                  style={{
                    flex: 1,
                    padding: "8px 10px",
                    borderRadius: 8,
                    border: "1px solid #d1d5db",
                    fontSize: 14,
                    outline: "none",
                  }}
                />
                <button
                  type="button"
                  disabled={sharing || !shareEmail.trim()}
                  onClick={async () => {
                    try {
                      setSharing(true);
                      setShareStatus(null);
                      const res = await fetch("/api/share", {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          docId: DOC_ID,
                          email: shareEmail.trim(),
                          requesterId: userId,
                        }),
                      });
                      const data = await res.json();
                      if (!res.ok) {
                        setShareStatus(data.error || "Failed to share.");
                      } else {
                        setShareStatus(data.message || "Shared successfully.");
                        setShareEmail("");
                      }
                    } catch (e) {
                      setShareStatus("Failed to share.");
                    } finally {
                      setSharing(false);
                    }
                  }}
                >
                  {sharing ? "Sharing..." : "Share"}
                </button>
              </div>
              {shareStatus && (
                <p style={{ margin: "8px 0 0", fontSize: 13, color: "#6b7280" }}>{shareStatus}</p>
              )}
            </section>
          </aside>
        </section>
      )}

      {showClearSnapshotsModal ? (
        <div
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(17, 24, 39, 0.45)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
          }}
        >
          <div
            style={{
              width: "100%",
              maxWidth: 420,
              backgroundColor: "#ffffff",
              borderRadius: 12,
              padding: 20,
              border: "1px solid #e5e7eb",
            }}
          >
            <h3 style={{ marginTop: 0 }}>Clear all snapshots?</h3>
            <p style={{ color: "#6b7280" }}>
              This will permanently remove all saved snapshots for this document.
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 12 }}>
              <button type="button" onClick={() => setShowClearSnapshotsModal(false)}>
                Cancel
              </button>
              <button type="button" onClick={() => void clearAllSnapshots()}>
                Delete All
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {authError ? <p>Error: {authError}</p> : null}
      {snapshotError ? <p>Snapshot Error: {snapshotError}</p> : null}
    </main>
  );
}