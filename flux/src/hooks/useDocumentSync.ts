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

export function useDocumentSync(
  userId: string,
  localDoc: JSONContent,
  setLocalDoc: SetLocalDoc,
) {
  const lastSentRef = useRef<JSONContent | null>(null);
  const hasSnapshotRef = useRef(false);
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
          lastSentRef.current = localDoc;

          await setDoc(docRef, {
            content: localDoc,
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

      lastSentRef.current = incomingContent;
      setLocalDoc(incomingContent);
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
        content: localDoc,
        updatedAt: nextUpdatedAt,
        updatedBy: userId,
      }, { merge: true });
    }, 300);

    return () => window.clearTimeout(timeoutId);
  }, [localDoc, userId]);

  return { meta };
}
