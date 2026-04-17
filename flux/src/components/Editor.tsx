"use client";

import { useEffect, useRef } from "react";
import { EditorContent, useEditor } from "@tiptap/react";
import Placeholder from "@tiptap/extension-placeholder";
import StarterKit from "@tiptap/starter-kit";
import type { JSONContent } from "@tiptap/core";
import { Extension } from "@tiptap/core";

const GlobalAttributes = Extension.create({
  name: 'globalAttributes',
  addGlobalAttributes() {
    return [
      {
        types: ['paragraph', 'heading', 'bulletList', 'orderedList', 'listItem'],
        attributes: {
          authorId: {
            default: null,
            parseHTML: (element) => element.getAttribute('data-author-id'),
            renderHTML: (attributes) => {
              if (!attributes.authorId) return {};
              return { 'data-author-id': attributes.authorId };
            },
          },
          nodeId: {
            // Use null default — factory functions are NOT serializable to Firestore
            default: null,
            parseHTML: (element) => element.getAttribute('data-node-id'),
            renderHTML: (attributes) => {
              if (!attributes.nodeId) return {};
              return { 'data-node-id': attributes.nodeId };
            },
          },
        },
      },
    ];
  },
});

type EditorProps = {
  value: JSONContent;
  onChange: (val: JSONContent) => void;
  userId: string;
  onCursorAuthorChange: (authorId: string | null) => void;
};

const INITIAL_DOC: JSONContent = {
  type: "doc",
  content: [{ type: "paragraph" }],
};

export default function Editor({ value, onChange, userId, onCursorAuthorChange }: EditorProps) {
  const isApplyingExternalUpdate = useRef(false);

  const editor = useEditor({
    immediatelyRender: false,
    extensions: [
      StarterKit,
      GlobalAttributes,
      Placeholder.configure({
        placeholder: "Start typing collaboratively...",
      }),
    ],
    content: value ?? INITIAL_DOC,
    onSelectionUpdate: ({ editor: currentEditor }) => {
      function getCurrentAuthor() {
        const { $head } = currentEditor.state.selection;
        if ($head && $head.parent && ["paragraph", "heading", "bulletList", "orderedList", "listItem"].includes($head.parent.type.name)) {
          return $head.parent.attrs.authorId || null;
        }
        return null;
      }
      onCursorAuthorChange(getCurrentAuthor());
    },
    onUpdate: ({ editor: currentEditor }) => {
      if (isApplyingExternalUpdate.current) {
        isApplyingExternalUpdate.current = false;
        return;
      }

      function getCurrentAuthor() {
        const { $head } = currentEditor.state.selection;
        if ($head && $head.parent && ["paragraph", "heading", "bulletList", "orderedList", "listItem"].includes($head.parent.type.name)) {
          return $head.parent.attrs.authorId || null;
        }
        return null;
      }

      const { state, view } = currentEditor;
      const { $head } = state.selection;
      const node = $head.parent;

      if (node && ["paragraph", "heading", "bulletList", "orderedList", "listItem"].includes(node.type.name) && node.attrs.authorId !== userId) {
        const pos = $head.before();
        view.dispatch(
          state.tr.setNodeMarkup(pos, undefined, {
            ...node.attrs,
            authorId: userId,
          })
        );
      }

      const authorId = getCurrentAuthor();
      onCursorAuthorChange(authorId);

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

  const toolbarBtnStyle = (isActive: boolean) => ({
    padding: "6px 12px",
    fontSize: "0.875rem",
    fontWeight: isActive ? 600 : 500,
    border: "none",
    borderRadius: "8px",
    backgroundColor: isActive ? "var(--surface-hover)" : "transparent",
    color: isActive ? "var(--accent)" : "var(--foreground-muted)",
    cursor: "pointer" as const,
    transition: "all 0.2s ease",
  });

  return (
    <>
      <div
        className="animate-slide-up"
        style={{
          padding: "24px 0",
          minHeight: "calc(100vh - 200px)",
          cursor: "text",
          backgroundColor: "var(--surface)",
        }}
        onClick={() => {
          if (editor && !editor.isFocused) {
            editor.chain().focus().run();
          }
        }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 6,
            padding: "8px 16px",
            marginBottom: 32,
            flexWrap: "wrap",
            position: "sticky",
            top: 16,
            zIndex: 10,
            background: "rgba(255, 255, 255, 0.8)",
            backdropFilter: "blur(8px)",
            borderRadius: "16px",
            border: "1px solid var(--border-subtle)",
            boxShadow: "0 4px 6px -1px rgba(0, 0, 0, 0.05)",
            maxWidth: "max-content",
            margin: "0 auto 32px",
          }}
        >
          <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleBold().run(); }}
            style={toolbarBtnStyle(editor.isActive("bold"))}
          >
            <strong>B</strong>
          </button>
          <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleItalic().run(); }}
            style={toolbarBtnStyle(editor.isActive("italic"))}
          >
            <em>I</em>
          </button>
          <div style={{ width: 1, height: 20, backgroundColor: "#d1d5db", margin: "0 4px" }} />
          <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleHeading({ level: 1 }).run(); }}
            style={toolbarBtnStyle(editor.isActive("heading", { level: 1 }))}
            onMouseEnter={(e) => { if (!editor.isActive("heading", { level: 1 })) (e.currentTarget as HTMLElement).style.backgroundColor = 'var(--surface-hover)'; }}
            onMouseLeave={(e) => { if (!editor.isActive("heading", { level: 1 })) (e.currentTarget as HTMLElement).style.backgroundColor = 'transparent'; }}
          >
            H1
          </button>
          <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleHeading({ level: 2 }).run(); }}
            style={toolbarBtnStyle(editor.isActive("heading", { level: 2 }))}
          >
            H2
          </button>
          <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleHeading({ level: 3 }).run(); }}
            style={toolbarBtnStyle(editor.isActive("heading", { level: 3 }))}
          >
            H3
          </button>
          <div style={{ width: 1, height: 20, backgroundColor: "#d1d5db", margin: "0 4px" }} />
          <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleBulletList().run(); }}
            style={toolbarBtnStyle(editor.isActive("bulletList"))}
          >
            • List
          </button>
          <button
            type="button"
            onMouseDown={(e) => { e.preventDefault(); editor.chain().focus().toggleOrderedList().run(); }}
            style={toolbarBtnStyle(editor.isActive("orderedList"))}
          >
            1. List
          </button>
        </div>
        <EditorContent editor={editor} className="flux-editor-content" />
      </div>


    </>
  );
}
