"use client";
import { useEffect, useState } from "react";
import { db } from "@/lib/firebase";
import { collection, getDocs } from "firebase/firestore";

export default function Home() {
  const [status, setStatus] = useState("Connecting to Firebase...");

  useEffect(() => {
    getDocs(collection(db, "test"))
      .then(() => setStatus("Firebase connected successfully!"))
      .catch((e) => setStatus("Error: " + e.message));
  }, []);

  return (
    <main style={{ padding: 40, fontFamily: "monospace", fontSize: 18 }}>
      <h1>Flux</h1>
      <p>{status}</p>
    </main>
  );
}