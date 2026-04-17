import { useMemo } from "react";
import CodeMirror from "@uiw/react-codemirror";
import { markdown, markdownLanguage } from "@codemirror/lang-markdown";
import { languages } from "@codemirror/language-data";
import { EditorView, ViewPlugin } from "@codemirror/view";
import { EditorState } from "@codemirror/state";
import { syntaxHighlighting, HighlightStyle } from "@codemirror/language";
import { tags } from "@lezer/highlight";
import { createLivePreview, livePreviewTheme } from "./livePreview";
import { compressImageForUpload } from "./imageUpload";
import { API } from "../api";

// Override default markdown syntax highlighting to remove underlines etc.
const markdownHighlight = HighlightStyle.define([
  { tag: tags.heading1, textDecoration: "none" },
  { tag: tags.heading2, textDecoration: "none" },
  { tag: tags.heading3, textDecoration: "none" },
  { tag: tags.heading4, textDecoration: "none" },
  { tag: tags.heading5, textDecoration: "none" },
  { tag: tags.heading6, textDecoration: "none" },
  { tag: tags.strong, textDecoration: "none" },
  { tag: tags.emphasis, textDecoration: "none" },
  { tag: tags.link, textDecoration: "none" },
  { tag: tags.url, textDecoration: "none" },
  { tag: tags.processingInstruction, textDecoration: "none" },
  { tag: tags.contentSeparator, textDecoration: "none" },
]);

const ALLOWED_IMAGE_TYPES = new Set([
  "image/jpeg",
  "image/png",
  "image/gif",
  "image/webp",
]);

const UNSUPPORTED_IMAGE_MESSAGE =
  "Only JPEG, PNG, GIF, or WebP images are allowed.";

const blurOnMount = ViewPlugin.fromClass(
  class {
    constructor(view: EditorView) {
      requestAnimationFrame(() => {
        view.contentDOM.blur();
      });
    }
  },
);

const cleanTheme = EditorView.theme({
  "&": {
    height: "100%",
    fontSize: "15px",
    backgroundColor: "transparent",
    border: "none",
    outline: "none",
  },
  ".cm-scroller": {
    fontFamily: "system-ui, sans-serif",
    lineHeight: "1.7",
    padding: "16px 0 60px",
  },
  ".cm-content": { caretColor: "currentColor", padding: "0 48px 0 16px" },
  ".cm-focused": { outline: "none" },
  ".cm-gutters": {
    backgroundColor: "transparent",
    border: "none",
    paddingLeft: "16px",
  },
  ".cm-lineNumbers .cm-gutterElement": {
    color: "rgba(128,128,128,0.5)",
    fontSize: "13px",
    minWidth: "3ch",
    paddingRight: "12px",
    textAlign: "right",
  },
  ".cm-activeLineGutter .cm-gutterElement, .cm-lineNumbers .cm-gutterElement.cm-activeLineGutter":
    { color: "rgba(128,128,128,0.9)" },
  ".cm-activeLineGutter": { backgroundColor: "transparent" },
  ".cm-activeLine": { backgroundColor: "transparent" },
  ".cm-line": { padding: "1px 0" },
});

interface Props {
  value: string;
  onChange: (value: string) => void;
  dark: boolean;
  padPath: string;
  readOnly?: boolean;
  uploadBlocked: boolean;
  uploadBlockReason: string | null;
  onUploadLimitsUpdate: (next: {
    imageCount: number;
    imageCountLimit: number;
    totalImageBytes: number;
    totalImageBytesLimit: number;
  }) => void;
  onUploadError: (message: string) => void;
  onEditorReady?: (view: EditorView) => void;
  onReadOnlyInput?: () => void;
}

export default function PadCodeEditor({
  value,
  onChange,
  dark,
  padPath,
  readOnly = false,
  uploadBlocked,
  uploadBlockReason,
  onUploadLimitsUpdate,
  onUploadError,
  onEditorReady,
  onReadOnlyInput,
}: Props) {
  const extensions = useMemo(
    () => {
      const handleImageFile = async (file: File, view: EditorView) => {
        if (file.size > 10 * 1024 * 1024) {
          onUploadError("File too large. Max 10MB.");
          return;
        }
        // Insert placeholder \image at cursor
        const pos = view.state.selection.main.head;
        view.dispatch({
          changes: { from: pos, insert: "\n\\image\n" },
        });
        // Compress before upload (falls back to original if compression fails)
        let optimized = file;
        try {
          optimized = await compressImageForUpload(file);
        } catch {
          optimized = file;
        }
        // Upload and replace with \image[id]
        const formData = new FormData();
        formData.append("file", optimized);
        fetch(`${API}/api/pad/${padPath}/images`, {
          method: "POST",
          credentials: "include",
          body: formData,
        })
          .then(async (r) => {
            if (!r.ok) {
              const message = await r
                .text()
                .catch(() => "Upload failed. Try again.");
              throw new Error(message || "Upload failed. Try again.");
            }
            return r.json();
          })
          .then(
            (data: {
              imageId: string;
              imageCount: number;
              imageCountLimit: number;
              totalImageBytes: number;
              totalImageBytesLimit: number;
            }) => {
              onUploadLimitsUpdate({
                imageCount: data.imageCount,
                imageCountLimit: data.imageCountLimit,
                totalImageBytes: data.totalImageBytes,
                totalImageBytesLimit: data.totalImageBytesLimit,
              });
              // Find the bare \image we just inserted
              const doc = view.state.doc.toString();
              const idx = doc.indexOf("\\image", pos);
              if (idx !== -1 && doc.slice(idx, idx + 7) !== "\\image[") {
                view.dispatch({
                  changes: {
                    from: idx,
                    to: idx + 6,
                    insert: `\\image[${data.imageId}]`,
                  },
                });
              }
            },
          )
          .catch((err: unknown) => {
            onUploadError(
              err instanceof Error
                ? err.message
                : "Upload failed. Try again.",
            );
            // Remove placeholder on failure
            const doc = view.state.doc.toString();
            const idx = doc.indexOf("\\image", pos);
            if (idx !== -1 && doc.slice(idx, idx + 7) !== "\\image[") {
              const end = doc[idx + 6] === "\n" ? idx + 7 : idx + 6;
              view.dispatch({
                changes: {
                  from: idx > 0 && doc[idx - 1] === "\n" ? idx - 1 : idx,
                  to: end,
                  insert: "",
                },
              });
            }
          });
      };

      return [
      cleanTheme,
      EditorState.readOnly.of(readOnly),
      markdown({ base: markdownLanguage, codeLanguages: languages }),
      syntaxHighlighting(markdownHighlight),
      createLivePreview({
        padPath,
        uploadBlocked,
        uploadBlockReason,
        onUploadLimitsUpdate,
        onUploadError,
      }),
      livePreviewTheme,
      EditorView.lineWrapping,
      blurOnMount,
      EditorView.updateListener.of((update) => {
        if (!update.docChanged && !update.selectionSet && !update.focusChanged)
          return;
        const { doc } = update.state;
        const focused = update.view.hasFocus;
        const cursorLineNum = doc.lineAt(
          update.state.selection.main.head,
        ).number;

        // Propagation: newline was inserted after an alignment line with content → add prefix
        if (update.docChanged) {
          let hasNewline = false;
          let insertPos = -1;
          update.changes.iterChanges((fromA, _toA, _fromB, _toB, inserted) => {
            if (inserted.toString().includes("\n")) {
              hasNewline = true;
              insertPos = fromA;
            }
          });
          if (hasNewline && insertPos >= 0) {
            const oldLine = update.startState.doc.lineAt(insertPos);
            const alignMatch = oldLine.text.match(
              /^(?:#{1,6}\s)?\{(center|right|justify)\}.+/,
            );
            if (alignMatch) {
              const prefix = oldLine.text.match(
                /\{(center|right|justify)\}/,
              )![0];
              const cursorLine = doc.lineAt(update.state.selection.main.head);
              if (cursorLine.text.trim() === "") {
                update.view.dispatch({
                  changes: { from: cursorLine.from, insert: prefix },
                  selection: { anchor: cursorLine.from + prefix.length },
                });
                return;
              }
            }
          }
        }

        // Cleanup: remove empty alignment-only lines when cursor leaves or focus lost
        const changes: Array<{ from: number; to: number; insert: string }> = [];
        for (let i = 1; i <= doc.lines; i++) {
          if (focused && i === cursorLineNum) continue;
          const line = doc.line(i);
          if (
            /^(?:#{1,6}\s)?\{(?:center|right|justify)\}\s*$/.test(line.text)
          ) {
            changes.push({ from: line.from, to: line.to, insert: "" });
          }
        }
        if (changes.length > 0) {
          update.view.dispatch({ changes });
        }
      }),
      EditorView.domEventHandlers({
        paste(event, view) {
          const items = event.clipboardData?.items;
          if (!items) return false;
          for (const item of items) {
            if (item.type.startsWith("image/")) {
              event.preventDefault();
              if (!ALLOWED_IMAGE_TYPES.has(item.type)) {
                onUploadError(UNSUPPORTED_IMAGE_MESSAGE);
                return true;
              }
              if (uploadBlocked) {
                onUploadError(
                  uploadBlockReason ?? "Image upload blocked for this pad",
                );
                return true;
              }
              const file = item.getAsFile();
              if (!file) return true;
              handleImageFile(file, view);
              return true;
            }
          }
          return false;
        },
      }),
      // Drag-and-drop: attach on view.dom with capture to intercept before browser navigates
      ViewPlugin.fromClass(
        class {
          onDragOver: (e: DragEvent) => void;
          onDrop: (e: DragEvent) => void;
          dom: HTMLElement;

          constructor(view: EditorView) {
            this.dom = view.dom;

            this.onDragOver = (e: DragEvent) => {
              if (e.dataTransfer && Array.from(e.dataTransfer.types).includes("Files")) {
                e.preventDefault();
                e.dataTransfer.dropEffect = "copy";
              }
            };

            this.onDrop = (e: DragEvent) => {
              const files = e.dataTransfer?.files;
              if (!files || files.length === 0) return;
              const droppedImages = Array.from(files).filter((f) =>
                f.type.startsWith("image/"),
              );
              if (droppedImages.length === 0) return;
              e.preventDefault();
              e.stopPropagation();
              const imageFiles = droppedImages.filter((f) =>
                ALLOWED_IMAGE_TYPES.has(f.type),
              );
              if (imageFiles.length < droppedImages.length) {
                onUploadError(UNSUPPORTED_IMAGE_MESSAGE);
                if (imageFiles.length === 0) return;
              }
              if (uploadBlocked) {
                onUploadError(
                  uploadBlockReason ?? "Image upload blocked for this pad",
                );
                return;
              }
              const dropPos = view.posAtCoords({
                x: e.clientX,
                y: e.clientY,
              });
              if (dropPos != null) {
                view.dispatch({ selection: { anchor: dropPos } });
              }
              for (const file of imageFiles) {
                handleImageFile(file, view);
              }
            };

            this.dom.addEventListener("dragover", this.onDragOver, true);
            this.dom.addEventListener("drop", this.onDrop, true);
          }

          destroy() {
            this.dom.removeEventListener("dragover", this.onDragOver, true);
            this.dom.removeEventListener("drop", this.onDrop, true);
          }
        },
      ),
      ...(readOnly && onReadOnlyInput
        ? [
            EditorView.domEventHandlers({
              keydown(event) {
                if (
                  event.key.length === 1 &&
                  !event.ctrlKey &&
                  !event.metaKey &&
                  !event.altKey
                ) {
                  onReadOnlyInput();
                }
              },
            }),
          ]
        : []),
    ];},
    [
      padPath,
      readOnly,
      uploadBlocked,
      uploadBlockReason,
      onUploadLimitsUpdate,
      onUploadError,
      onReadOnlyInput,
    ],
  );

  return (
    <CodeMirror
      value={value}
      onChange={onChange}
      theme={"none" as "light"}
      className={dark ? "dark" : ""}
      basicSetup={{
        lineNumbers: true,
        foldGutter: false,
        highlightActiveLine: false,
        highlightSelectionMatches: false,
        drawSelection: true,
        syntaxHighlighting: false,
      }}
      extensions={extensions}
      onCreateEditor={onEditorReady}
      placeholder="Start typing..."
    />
  );
}
