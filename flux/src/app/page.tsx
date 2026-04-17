"use client";

import { useEffect, useMemo, useRef, useState, useCallback } from "react";
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
import TeamManager from "@/components/TeamManager";

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

type SnapshotContent = {
  _id: string;
  docId: string;
  content: JSONContent;
  timestamp: number;
  authorId: string;
};

type ServerDoc = {
  _id: string;
  title: string;
  ownerId: string;
  teamId?: string;
  sharedWith: string[];
  updatedAt: string;
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

function formatTimeAgo(timestamp: number | string) {
  const ts = typeof timestamp === "string" ? new Date(timestamp).getTime() : timestamp;
  const diff = Date.now() - ts;

  if (diff < 1000) return "just now";
  if (diff < 60000) return `${Math.floor(diff / 1000)}s ago`;
  if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;

  return new Date(ts).toLocaleTimeString();
}

export default function Home() {
  const { user, loading } = useAuth();
  
  const [activeTeamId, setActiveTeamId] = useState<string | null>(null);
  const [documents, setDocuments] = useState<ServerDoc[]>([]);
  const [activeDocId, setActiveDocId] = useState<string | null>(null);
  const DOC_ID = activeDocId || "main";

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
  const [creatingDoc, setCreatingDoc] = useState(false);

  const lastSnapshotRef = useRef<JSONContent | null>(null);
  const lastEditRef = useRef<number>(0);
  const lastSaveTimeRef = useRef<number>(0);
  const isRestoringRef = useRef(false);

  const userId = user?.uid ?? "anonymous";
  const userLabel = user?.email ?? "anonymous";

  const { meta } = useDocumentSync(user ? DOC_ID : "main", doc, setDoc);

  const userColor = useMemo(() => getUserColor(userId), [userId]);
  const { activeUsers } = usePresence(userId, userLabel, userColor);
  const cursors = useCursorPresence(user ? DOC_ID : null);
  
  const activeCursors = cursors.filter(
    (c) => Date.now() - c.timestamp < 5000 && c.userId !== userId
  );

  const updateCursorPosition = useMemo(
    () =>
      throttle(async (x: number, y: number) => {
        if (!user || !userColor || !DOC_ID) return;
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
    [user, userId, userColor, DOC_ID]
  );

  useEffect(() => {
    return () => {
      if (userId && userId !== "anonymous" && DOC_ID) {
        firestoreDeleteDoc(firestoreDoc(db, "documents", DOC_ID, "cursors", userId)).catch(() => {});
      }
    };
  }, [userId, DOC_ID]);

  const loadDocuments = useCallback(async () => {
    if (!user) return;
    try {
      const res = await fetch(`/api/documents?userId=${userId}&userEmail=${user.email}`);
      if (res.ok) {
        const data = await res.json();
        setDocuments(data);
        if (data.length > 0 && !activeDocId) {
          setActiveDocId(data[0]._id);
        }
      }
    } catch (err) {
      console.error("Failed to load documents", err);
    }
  }, [user, userId, activeDocId]);

  useEffect(() => {
    loadDocuments();
  }, [loadDocuments]);

  const handleCreateNewDoc = async () => {
    if (!user || creatingDoc) return;
    setCreatingDoc(true);
    try {
      const title = prompt("Enter new document title:");
      if (!title) return;
      const res = await fetch("/api/documents", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          ownerId: userId,
          teamId: activeTeamId || null,
        }),
      });
      if (res.ok) {
        const newDoc = await res.json();
        setDocuments(prev => [newDoc, ...prev]);
        setActiveDocId(newDoc._id);
        setDoc(initialDoc); // Clear editor state for new doc
      }
    } catch (e) {
      console.error(e);
    } finally {
      setCreatingDoc(false);
    }
  };

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
      const response = await fetch(`/api/snapshot?docId=${DOC_ID}&userId=${userId}&userEmail=${user?.email || ""}`, {
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
    if (!user || savingSnapshot || !doc.content?.length || !DOC_ID) return;

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
        body: JSON.stringify({ docId: DOC_ID, content: doc, authorId: userId, userEmail: user?.email || "" }),
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
      fetch(`/api/snapshot?snapshotId=${snapshotId}&userId=${userId}&userEmail=${user?.email || ""}`, { method: "DELETE" }).catch(console.error);

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

      const response = await fetch(`/api/snapshot?docId=${DOC_ID}&clearAll=true&userId=${userId}&userEmail=${user?.email || ""}`, {
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


  const handleShareDoc = async () => {
    if (!shareEmail.trim() || !DOC_ID) return;
    try {
      setSharing(true);
      setShareStatus(null);
      const res = await fetch(`/api/documents/${DOC_ID}/share`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ownerId: userId,
          email: shareEmail.trim(),
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setShareStatus(data.error || "Failed to share.");
      } else {
        setShareStatus("Shared successfully.");
        setShareEmail("");
      }
    } catch (e) {
      setShareStatus("Failed to share.");
    } finally {
      setSharing(false);
    }
  };

  // ⚠️ All hooks MUST be called before any early returns (Rules of Hooks)
  const activeDocObj = useMemo(
    () => documents.find(d => d._id === activeDocId),
    [documents, activeDocId]
  );

  const displayedDocuments = useMemo(() => {
    if (activeTeamId) {
      return documents.filter(d => d.teamId === activeTeamId);
    }
    return documents.filter(d => !d.teamId);
  }, [documents, activeTeamId]);

  /** Convert Tiptap JSON → Markdown for local download */
  const tiptapToMarkdown = useCallback((node: JSONContent): string => {
    if (!node) return "";

    const renderInline = (nodes: JSONContent[]): string =>
      (nodes || []).map((n) => {
        if (n.type === "text") {
          let t = n.text || "";
          if (n.marks?.some((m: any) => m.type === "bold")) t = `**${t}**`;
          if (n.marks?.some((m: any) => m.type === "italic")) t = `*${t}*`;
          if (n.marks?.some((m: any) => m.type === "code")) t = `\`${t}\``;
          return t;
        }
        return "";
      }).join("");

    const renderNode = (n: JSONContent, listDepth = 0): string => {
      switch (n.type) {
        case "doc":
          return (n.content || []).map((c) => renderNode(c)).join("\n");
        case "heading": {
          const level = n.attrs?.level || 1;
          const prefix = "#".repeat(level);
          return `${prefix} ${renderInline(n.content || [])}\n`;
        }
        case "paragraph":
          return `${renderInline(n.content || [])}\n`;
        case "bulletList":
          return (n.content || []).map((item) => renderNode(item, listDepth + 1)).join("");
        case "orderedList":
          return (n.content || []).map((item, i) =>
            renderNode({ ...item, _orderedIndex: i + 1 } as any, listDepth + 1)
          ).join("");
        case "listItem": {
          const indent = "  ".repeat(Math.max(0, listDepth - 1));
          const bullet = (n as any)._orderedIndex ? `${(n as any)._orderedIndex}.` : "-";
          const inner = (n.content || []).map((c) =>
            c.type === "paragraph" ? renderInline(c.content || []) : renderNode(c, listDepth)
          ).join(" ");
          return `${indent}${bullet} ${inner}\n`;
        }
        case "blockquote":
          return (n.content || []).map((c) => `> ${renderNode(c)}`).join("");
        case "codeBlock":
          return `\`\`\`\n${(n.content || []).map((c) => c.text || "").join("")}\n\`\`\`\n`;
        case "horizontalRule":
          return "---\n";
        default:
          return "";
      }
    };

    return renderNode(node);
  }, []);

  const handleDownload = useCallback(() => {
    const markdown = tiptapToMarkdown(doc);
    const filename = `${activeDocObj?.title || "document"}.md`;
    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
  }, [doc, activeDocObj, tiptapToMarkdown]);

  if (loading) {
    return (
      <main style={{ padding: 40, fontFamily: "var(--font-sans)", fontSize: 18, color: "var(--foreground)"}}>
        <h1>Flux</h1>
        <p>Loading...</p>
      </main>
    );
  }

  return (
    <main
      className="animate-fade-in"
      onMouseMove={(e) => updateCursorPosition(e.clientX, e.clientY)}
      style={{
        minHeight: "100vh",
        display: "flex", // Switch to flex layout
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

      {!user ? (
        <div style={{ padding: 24, margin: "auto" }} className="animate-slide-up">
          <div style={{ padding: 40, border: "1px solid var(--border-subtle)", borderRadius: 16, backgroundColor: "var(--surface)", textAlign: "center" }}>
            <h1 style={{ margin: "0 0 16px", fontWeight: "bold" }}>Welcome to Flux</h1>
            <p style={{ margin: "0 0 32px", color: "var(--foreground-muted)" }}>Real-time collaborative document editor</p>
            <button type="button" className="btn btn-primary" onClick={handleSignIn} disabled={submitting}>
              {submitting ? "Signing in..." : "Sign in with Google"}
            </button>
            {authError && <p style={{ color: "red", marginTop: 16 }}>{authError}</p>}
          </div>
        </div>
      ) : (
        <>
          {/* Dashboard Sidebar */}
          <aside style={{
            width: 280,
            borderRight: "1px solid var(--border)",
            backgroundColor: "var(--surface)",
            display: "flex",
            flexDirection: "column",
            height: "100vh",
            padding: 24,
            flexShrink: 0
          }}>
            <h1 style={{ margin: 0, fontSize: 24, fontWeight: "800", letterSpacing: "-0.03em" }}>Flux.</h1>
            <div style={{ marginTop: 24, marginBottom: 24 }}>
              <TeamManager user={user} onTeamSelect={setActiveTeamId} activeTeamId={activeTeamId} />
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <h3 style={{ margin: 0, fontSize: 13, fontWeight: "600", color: "var(--foreground-muted)", textTransform: "uppercase", letterSpacing: "0.05em" }}>Documents</h3>
              <button 
                onClick={handleCreateNewDoc}
                disabled={creatingDoc}
                className="btn btn-ghost"
                style={{ padding: "4px 8px", fontSize: 12 }}
              >
                + New
              </button>
            </div>

            <div style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 4 }}>
              {displayedDocuments.length === 0 ? (
                <p style={{ fontSize: 13, color: "var(--foreground-muted)", fontStyle: "italic" }}>No documents found.</p>
              ) : (
                displayedDocuments.map(d => (
                  <button
                    key={d._id}
                    onClick={() => {
                      setActiveDocId(d._id);
                      setDoc(initialDoc); // Temporary reset before sync catches up
                    }}
                    className="surface-item"
                    style={{
                      padding: "8px 12px",
                      borderRadius: 8,
                      textAlign: "left",
                      border: "none",
                      backgroundColor: activeDocId === d._id ? "var(--surface-hover)" : "transparent",
                      color: activeDocId === d._id ? "var(--accent)" : "var(--foreground)",
                      fontWeight: activeDocId === d._id ? 600 : "normal",
                      cursor: "pointer",
                      display: "flex",
                      flexDirection: "column",
                      gap: 4
                    }}
                  >
                    <span style={{ fontSize: 14 }}>{d.title}</span>
                    <span style={{ fontSize: 11, color: activeDocId === d._id ? "var(--accent)" : "var(--foreground-muted)", opacity: activeDocId === d._id ? 0.8 : 0.6 }}>
                      Updated {formatTimeAgo(d.updatedAt)}
                    </span>
                  </button>
                ))
              )}
            </div>

            <div style={{ marginTop: "auto", paddingTop: 16, borderTop: "1px solid var(--border)", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <span style={{ width: 12, height: 12, borderRadius: "50%", backgroundColor: userColor }} />
                <span style={{ fontSize: 13, color: "var(--foreground)", maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis" }}>{userLabel}</span>
              </div>
              <button onClick={handleSignOut} disabled={submitting} className="btn btn-outline" style={{ fontSize: 12, padding: "4px 8px" }}>
                Sign Out
              </button>
            </div>
          </aside>

          {/* Main Editor Content */}
          <div style={{ flex: 1, height: "100vh", overflowY: "auto", padding: "40px" }}>
            {!activeDocId ? (
              <div style={{ display: "flex", height: "100%", alignItems: "center", justifyContent: "center", color: "var(--foreground-muted)" }}>
                Select a document from the sidebar or define a new one.
              </div>
            ) : (
              <>
                <header
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: 16,
                    marginBottom: 20,
                    border: "1px solid var(--border-subtle)",
                    borderRadius: 16,
                    backgroundColor: "var(--surface)",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 16 }}>
                    <h2 style={{ margin: 0, fontSize: 24, fontWeight: "600", letterSpacing: "-0.02em" }}>{activeDocObj?.title || DOC_ID}</h2>
                    {activeDocObj?.teamId && (
                      <span style={{ fontSize: 12, padding: "4px 8px", backgroundColor: "var(--surface)", border: "1px solid var(--border)", color: "var(--foreground-muted)", borderRadius: 8 }}>Team Document</span>
                    )}
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
                    <div style={{ display: "flex" }}>
                        <input
                          type="email"
                          placeholder="Share by email"
                          value={shareEmail}
                          onChange={(e) => setShareEmail(e.target.value)}
                          className="input-base"
                          style={{
                            borderTopRightRadius: 0,
                            borderBottomRightRadius: 0,
                            borderRight: "none",
                            width: 150
                          }}
                        />
                        <button
                          type="button"
                          onClick={handleShareDoc}
                          disabled={sharing || !shareEmail.trim()}
                          className="btn btn-outline"
                          style={{
                            borderTopLeftRadius: 0,
                            borderBottomLeftRadius: 0,
                            backgroundColor: "var(--surface-hover)"
                          }}
                        >
                          {sharing ? "..." : "Share"}
                        </button>
                    </div>
                    <button type="button" onClick={() => void saveSnapshot()} disabled={savingSnapshot} className="btn btn-outline">
                      {savingSnapshot ? "Saving..." : "Save Snapshot"}
                    </button>
                    <button
                      type="button"
                      onClick={handleDownload}
                      className="btn btn-outline"
                      title="Download as Markdown"
                      style={{ display: "flex", alignItems: "center", gap: 6 }}
                    >
                      ⬇ Download
                    </button>
                  </div>
                </header>
                {shareStatus && <p style={{ fontSize: 12, color: shareStatus.includes("Failed") ? "red" : "green", marginTop: -10, marginBottom: 10, textAlign: "right" }}>{shareStatus}</p>}

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
                      minHeight: 500,
                    }}
                  >
                    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 32 }}>
                      <div style={{ fontSize: 13, color: "var(--foreground-muted)" }}>
                        {currentAuthor ? (
                          <>
                            Editing:{" "}
                            <strong>
                              {currentAuthor === userId
                                ? "you"
                                : getUserLabelFromId(currentAuthor, activeUsers)}
                            </strong>
                          </>
                        ) : (
                          "Ready"
                        )}
                      </div>

                      <div style={{ fontSize: 13, color: "var(--foreground-muted)" }}>
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
                    </div>

                    <div style={{ marginBottom: 32 }}>
                      <button 
                        type="button" 
                        onClick={() => void handleSummarize()}
                        disabled={loadingSummary}
                        className="btn btn-ghost"
                        style={{ padding: "4px 0", fontSize: 13, color: "var(--accent)" }}
                      >
                        {loadingSummary ? "Summarizing..." : "✦ Generate Summary"}
                      </button>
                      
                      {summary && (
                        <div className="animate-slide-up" style={{ marginTop: 12, padding: 16, backgroundColor: "var(--surface-hover)", borderRadius: 12, border: "1px solid var(--border-subtle)" }}>
                          <h3 style={{ margin: "0 0 8px 0", fontSize: 14 }}>Summary</h3>
                          <p style={{ margin: 0, fontSize: 14, whiteSpace: "pre-wrap", color: "var(--foreground)" }}>{summary}</p>
                        </div>
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
                        border: "1px solid var(--border-subtle)",
                        borderRadius: 16,
                        backgroundColor: "var(--surface)",
                      }}
                    >
                      <h2 style={{ marginTop: 0, marginBottom: 12, fontSize: 14, fontWeight: 600 }}>Active Users</h2>
                      <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
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
                                backgroundColor: isCurrentUser ? "var(--surface-hover)" : "transparent",
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
                        border: "1px solid var(--border-subtle)",
                        borderRadius: 16,
                        backgroundColor: "var(--surface)",
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
                        <h2 style={{ margin: 0, fontSize: 14, fontWeight: 600 }}>Snapshots</h2>
                        <button type="button" onClick={() => setShowClearSnapshotsModal(true)} className="btn btn-ghost" style={{fontSize: 12, padding: "2px 6px"}}>
                          Clear All
                        </button>
                      </div>
                      <div style={{ maxHeight: 320, overflowY: "auto", display: "flex", flexDirection: "column", gap: 8 }}>
                        {snapshots.map((snapshot) => (
                          <div
                            key={snapshot.snapshotId}
                            style={{
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "space-between",
                              gap: 8,
                              padding: "10px 12px",
                              borderRadius: 10,
                              backgroundColor: "var(--surface-hover)",
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
                                color: "var(--foreground)"
                              }}
                            >
                              <div style={{ fontSize: 13, fontWeight: 500 }}>{new Date(snapshot.timestamp).toLocaleString()}</div>
                              <div style={{ color: "var(--foreground-muted)", fontSize: 12, marginTop: 4 }}>
                                {snapshot.authorId.slice(0, 8)}
                              </div>
                            </button>
                            <button
                              type="button"
                              onClick={() => void deleteSnapshot(snapshot.snapshotId)}
                              disabled={deletingSnapshotId === snapshot.snapshotId}
                              className="btn btn-ghost"
                              style={{ fontSize: 11, padding: "4px 8px"}}
                            >
                              {deletingSnapshotId === snapshot.snapshotId ? "..." : "X"}
                            </button>
                          </div>
                        ))}
                        {snapshots.length === 0 && <p style={{ fontSize: 13, color: "var(--foreground-muted)", fontStyle: "italic", margin: 0 }}>No snapshots yet.</p>}
                      </div>
                    </section>
                  </aside>
                </section>
              </>
            )}
          </div>
        </>
      )}

      {showClearSnapshotsModal ? (
        <div
          className="animate-fade-in"
          style={{
            position: "fixed",
            inset: 0,
            backgroundColor: "rgba(15, 23, 42, 0.4)",
            backdropFilter: "blur(4px)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            padding: 24,
            zIndex: 1000
          }}
        >
          <div
            className="animate-slide-up"
            style={{
              width: "100%",
              maxWidth: 420,
              backgroundColor: "var(--surface)",
              borderRadius: 16,
              padding: 24,
              border: "1px solid var(--border-subtle)",
              boxShadow: "0 20px 25px -5px rgba(0,0,0,0.1)",
            }}
          >
            <h3 style={{ marginTop: 0 }}>Clear all snapshots?</h3>
            <p style={{ color: "var(--foreground-muted)", fontSize: 14 }}>
              This will permanently remove all saved snapshots for this document.
            </p>
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 12, marginTop: 24 }}>
              <button type="button" onClick={() => setShowClearSnapshotsModal(false)} className="btn btn-ghost">
                Cancel
              </button>
              <button type="button" onClick={() => void clearAllSnapshots()} className="btn" style={{ backgroundColor: "#ef4444", color: "white" }}>
                Delete All
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {snapshotError ? <div style={{ position: "fixed", bottom: 20, right: 20, padding: 16, backgroundColor: "#fee2e2", color: "#b91c1c", borderRadius: 8, border: "1px solid #f87171", zIndex: 1000 }}>Snapshot Error: {snapshotError}</div> : null}
    </main>
  );
}