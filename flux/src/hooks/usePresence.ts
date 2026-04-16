"use client";

import { useEffect, useRef, useState } from "react";
import { collection, doc, onSnapshot, setDoc } from "firebase/firestore";

import { db } from "@/lib/firebase";

const DOC_ID = "main";
const ACTIVE_WINDOW_MS = 10000;
const HEARTBEAT_MS = 5000;

type PresenceUser = {
  userId: string;
  email: string;
  color: string;
  lastActive: number;
};

function getActiveUsers(users: PresenceUser[] | undefined) {
  const now = Date.now();

  return (users ?? []).filter((user) => now - user.lastActive < ACTIVE_WINDOW_MS);
}

export function usePresence(userId: string, email: string, color: string) {
  const [activeUsers, setActiveUsers] = useState<PresenceUser[]>([]);
  const usersRef = useRef<PresenceUser[]>([]);

  useEffect(() => {
    if (!userId || userId === "anonymous") {
      setActiveUsers([]);
      return;
    }

    const userRef = doc(db, "presence", DOC_ID, "users", userId);
    const usersCollectionRef = collection(db, "presence", DOC_ID, "users");

    const upsertPresence = async () => {
      const nextUsers = getActiveUsers(usersRef.current).filter(
        (user) => user.userId !== userId,
      );

      nextUsers.push({
        userId,
        email,
        color,
        lastActive: Date.now(),
      });

      await setDoc(
        userRef,
        {
          userId,
          email,
          color,
          lastActive: Date.now(),
        },
      );
    };

    void upsertPresence();

    const heartbeatId = window.setInterval(() => {
      void upsertPresence();
    }, HEARTBEAT_MS);

    const unsubscribe = onSnapshot(usersCollectionRef, (snapshot) => {
      if (snapshot.empty) {
        setActiveUsers([]);
        return;
      }

      const dedupedUsers = new Map<string, PresenceUser>();

      const snapshotUsers = snapshot.docs.map((document) => document.data() as PresenceUser);

      for (const user of getActiveUsers(snapshotUsers)) {
        dedupedUsers.set(user.userId, user);
      }

      const nextActiveUsers = Array.from(dedupedUsers.values());
      usersRef.current = nextActiveUsers;
      setActiveUsers(nextActiveUsers);
    });

    return () => {
      window.clearInterval(heartbeatId);
      unsubscribe();
    };
  }, [color, email, userId]);

  return { activeUsers };
}
