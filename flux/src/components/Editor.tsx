"use client";

import { useEffect, useRef } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import Placeholder from "@tiptap/extension-placeholder";
import StarterKit from "@tiptap/starter-kit";
import type { JSONContent } from "@tiptap/core";

type EditorProps = {
  value: any;
  onChange: (val: any) => void;
};

const INITIAL_DOC: JSONContent = {
  type: "doc",
  content: [{ type: "paragraph" }],
};

export default function Editor({ value, onChange }: EditorProps) {
  const isApplyingExternalUpdate = useRef(false);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      Placeholder.configure({
        placeholder: "Start typing collaboratively...",
      }),
    ],
    content: value ?? INITIAL_DOC,
    onUpdate: ({ editor: currentEditor }) => {
      if (isApplyingExternalUpdate.current) {
        isApplyingExternalUpdate.current = false;
        return;
      }

      const json = currentEditor.getJSON();
      onChange(json);
    },
  });

  useEffect(() => {
    if (!editor) return;

    const current = editor.state.doc.toJSON();
    const nextValue = value ?? INITIAL_DOC;

    if (JSON.stringify(current) !== JSON.stringify(nextValue)) {
      isApplyingExternalUpdate.current = true;
      editor.commands.setContent(nextValue, { emitUpdate: false });
    }
  }, [editor, value]);

  if (!editor) {
    return null;
  }

  return (
    <>
      <div
        style={{
          border: "1px solid #d1d5db",
          borderRadius: 12,
          padding: 14,
          minHeight: 280,
          cursor: "text",
          backgroundColor: "#ffffff",
          boxShadow: "0 1px 2px rgba(0, 0, 0, 0.04)",
        }}
      >
        <div
          style={{
            fontSize: 12,
            fontWeight: 600,
            letterSpacing: 0.3,
            textTransform: "uppercase",
            color: "#6b7280",
            marginBottom: 10,
          }}
        >
          Document Editor
        </div>
        <EditorContent editor={editor} className="flux-editor-content" />
      </div>

      <style jsx global>{`
        .flux-editor-content .ProseMirror {
          min-height: 220px;
          outline: none;
          color: #111827;
          font-size: 16px;
          line-height: 1.7;
          white-space: pre-wrap;
          word-break: break-word;
        }

        .flux-editor-content .ProseMirror p {
          margin: 0 0 0.9em;
        }

        .flux-editor-content .ProseMirror p.is-editor-empty:first-child::before {
          content: attr(data-placeholder);
          color: #9ca3af;
          float: left;
          height: 0;
          pointer-events: none;
        }

        .flux-editor-content .ProseMirror-focused {
          outline: none;
        }

        .flux-editor-content .ProseMirror h1,
        .flux-editor-content .ProseMirror h2,
        .flux-editor-content .ProseMirror h3 {
          margin: 1em 0 0.5em;
          line-height: 1.25;
        }

        .flux-editor-content .ProseMirror ul,
        .flux-editor-content .ProseMirror ol {
          padding-left: 1.4rem;
          margin: 0.75em 0;
        }
      `}</style>
    </>
  );
}
