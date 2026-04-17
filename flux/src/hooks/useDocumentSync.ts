"use client";

import { useEffect, useRef, useState } from "react";
import type { JSONContent } from "@tiptap/core";
import { doc, onSnapshot, setDoc } from "firebase/firestore";

import { db } from "@/lib/firebase";

const DOC_ID = "main";

type SetLocalDoc = (doc: JSONContent) => void;

function isSameDocument(a: JSONContent, b: JSONContent) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function intelligentlyMerge(local: JSONContent, incoming: JSONContent, base: JSONContent | null): JSONContent {
  if (!local.content || !incoming.content || !base || !base.content) {
    return incoming;
  }

  const merged = [];
  
  const localMap = new Map(local.content.map((n: any) => [n.attrs?.nodeId, n]));
  const incomingMap = new Map(incoming.content.map((n: any) => [n.attrs?.nodeId, n]));
  const baseMap = new Map(base.content.map((n: any) => [n.attrs?.nodeId, n]));

  console.log("MERGE", { local, incoming, base });

  for (const [id, incomingNode] of incomingMap) {
    const localNode = localMap.get(id);
    const baseNode = baseMap.get(id);

    const localStr = localNode ? JSON.stringify(localNode) : null;
    const baseStr = baseNode ? JSON.stringify(baseNode) : null;

    if (localStr !== baseStr && localNode) {
      merged.push(localNode);
    } else {
      merged.push(incomingNode);
    }
  }

  for (const [id, localNode] of localMap) {
    if (!incomingMap.has(id)) {
      const baseNode = baseMap.get(id);
      const localStr = JSON.stringify(localNode);
      const baseStr = baseNode ? JSON.stringify(baseNode) : null;
      if (localStr !== baseStr) {
        merged.push(localNode);
      }
    }
  }

  return { ...incoming, content: merged };
}

/**
 * Recursively strips any non-Firestore-serializable values (functions, undefined)
 * from a JSON document tree before writing to Firestore.
 */
function sanitizeForFirestore(obj: unknown): unknown {
  if (typeof obj === 'function') return null;
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) {
    return (obj as unknown[]).map(sanitizeForFirestore);
  }
  const result: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(obj as Record<string, unknown>)) {
    const sanitized = sanitizeForFirestore(value);
    if (sanitized !== undefined) {
      result[key] = sanitized;
    }
  }
  return result;
}

export function useDocumentSync(
  userId: string,
  localDoc: JSONContent,
  setLocalDoc: SetLocalDoc,
) {
  const lastSentRef = useRef<JSONContent | null>(null);
  const localDocRef = useRef(localDoc);
  const hasSnapshotRef = useRef(false);

  useEffect(() => {
    localDocRef.current = localDoc;
  }, [localDoc]);
  const [meta, setMeta] = useState<{
    updatedBy?: string;
    updatedAt?: number;
  }>({});

  useEffect(() => {
    if (!userId || userId === "anonymous") {
      return;
    }

    const docRef = doc(db, "documents", DOC_ID);

    const unsubscribe = onSnapshot(docRef, async (snapshot) => {
      hasSnapshotRef.current = true;

      if (!snapshot.exists()) {
        if (!lastSentRef.current) {
          lastSentRef.current = localDocRef.current;

          await setDoc(docRef, {
            content: sanitizeForFirestore(localDocRef.current),
            updatedAt: Date.now(),
            updatedBy: userId,
          }, { merge: true });
        }

        return;
      }

      const data = snapshot.data() as {
        content?: JSONContent;
        updatedBy?: string;
        updatedAt?: number;
      };

      const incomingContent = data.content;

      if (!incomingContent) {
        setMeta({
          updatedBy: data.updatedBy,
          updatedAt: data.updatedAt,
        });
        return;
      }

      if (
        data.updatedBy === userId &&
        lastSentRef.current &&
        isSameDocument(incomingContent, lastSentRef.current)
      ) {
        return;
      }

      setMeta({
        updatedBy: data.updatedBy,
        updatedAt: data.updatedAt,
      });

      if (lastSentRef.current && isSameDocument(incomingContent, lastSentRef.current)) {
        return;
      }

      const merged = intelligentlyMerge(localDocRef.current, incomingContent, lastSentRef.current);
      lastSentRef.current = merged;
      setLocalDoc(merged);
    });

    return unsubscribe;
  }, [userId]);

  useEffect(() => {
    if (!userId || userId === "anonymous" || !hasSnapshotRef.current) {
      return;
    }

    if (lastSentRef.current && isSameDocument(localDoc, lastSentRef.current)) {
      return;
    }

    const docRef = doc(db, "documents", DOC_ID);
    const timeoutId = window.setTimeout(() => {
      const nextUpdatedAt = Date.now();

      setMeta((currentMeta) => {
        if (currentMeta.updatedBy === userId) {
          return currentMeta;
        }

        return {
          updatedBy: userId,
          updatedAt: nextUpdatedAt,
        };
      });

      lastSentRef.current = localDoc;

      void setDoc(docRef, {
        content: sanitizeForFirestore(localDoc),
        updatedAt: nextUpdatedAt,
        updatedBy: userId,
      }, { merge: true });
    }, 300);

    return () => window.clearTimeout(timeoutId);
  }, [localDoc, userId]);

  return { meta };
}
