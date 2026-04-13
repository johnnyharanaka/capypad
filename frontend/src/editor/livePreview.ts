import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from "@codemirror/view";
import { type EditorState, type Range } from "@codemirror/state";
import { syntaxTree } from "@codemirror/language";
import katex from "katex";
import "katex/dist/katex.min.css";
import { compressImageForUpload } from "./imageUpload";
import { API } from "../api";

const hideMark = Decoration.replace({});

const headingLine: Record<number, Decoration> = {
  1: Decoration.line({ class: "cm-live-h1" }),
  2: Decoration.line({ class: "cm-live-h2" }),
  3: Decoration.line({ class: "cm-live-h3" }),
  4: Decoration.line({ class: "cm-live-h4" }),
  5: Decoration.line({ class: "cm-live-h5" }),
  6: Decoration.line({ class: "cm-live-h6" }),
};

const boldMark = Decoration.mark({ class: "cm-live-bold" });
const italicMark = Decoration.mark({ class: "cm-live-italic" });
const underlineMark = Decoration.mark({ class: "cm-live-underline" });
const strikethroughMark = Decoration.mark({ class: "cm-live-strikethrough" });
const codeMark = Decoration.mark({ class: "cm-live-code" });

class LinkWidget extends WidgetType {
  text: string;
  url: string;
  constructor(text: string, url: string) {
    super();
    this.text = text;
    this.url = url;
  }
  eq(other: LinkWidget) {
    return this.text === other.text && this.url === other.url;
  }
  toDOM() {
    const a = document.createElement("a");
    a.className = "cm-live-link";
    a.textContent = this.text;
    a.href = this.url;
    a.target = "_blank";
    a.rel = "noopener noreferrer";
    a.addEventListener("click", (e) => {
      e.preventDefault();
      window.open(a.href, "_blank", "noopener,noreferrer");
    });
    return a;
  }
}
const quoteLine = Decoration.line({ class: "cm-live-blockquote" });
const alignCenter = Decoration.line({ class: "cm-live-align-center" });
const alignRight = Decoration.line({ class: "cm-live-align-right" });
const alignJustify = Decoration.line({ class: "cm-live-align-justify" });

class HrWidget extends WidgetType {
  toDOM() {
    const el = document.createElement("hr");
    el.className = "cm-live-hr-line";
    return el;
  }
}

class KatexInlineWidget extends WidgetType {
  latex: string;
  constructor(latex: string) {
    super();
    this.latex = latex;
  }

  eq(other: KatexInlineWidget) {
    return this.latex === other.latex;
  }

  toDOM() {
    const span = document.createElement("span");
    span.className = "cm-live-katex-inline";
    try {
      katex.render(this.latex, span, {
        throwOnError: false,
        displayMode: false,
      });
    } catch {
      span.textContent = this.latex;
    }
    return span;
  }
}

class KatexBlockWidget extends WidgetType {
  latex: string;
  constructor(latex: string) {
    super();
    this.latex = latex;
  }

  eq(other: KatexBlockWidget) {
    return this.latex === other.latex;
  }

  toDOM() {
    const div = document.createElement("div");
    div.className = "cm-live-katex-block";
    try {
      katex.render(this.latex, div, { throwOnError: false, displayMode: true });
    } catch {
      div.textContent = this.latex;
    }
    return div;
  }
}

class ImageWidget extends WidgetType {
  imageId: string | null;
  width: number | null;
  view: EditorView;
  from: number;
  to: number;
  padPath: string;
  uploadBlocked: boolean;
  uploadBlockReason: string | null;
  onUploadLimitsUpdate: (next: {
    imageCount: number;
    imageCountLimit: number;
    totalImageBytes: number;
    totalImageBytesLimit: number;
  }) => void;
  onUploadError: (message: string) => void;
  cleanup: (() => void) | null = null;

  constructor(
    imageId: string | null,
    width: number | null,
    view: EditorView,
    from: number,
    to: number,
    padPath: string,
    uploadBlocked: boolean,
    uploadBlockReason: string | null,
    onUploadLimitsUpdate: (next: {
      imageCount: number;
      imageCountLimit: number;
      totalImageBytes: number;
      totalImageBytesLimit: number;
    }) => void,
    onUploadError: (message: string) => void,
  ) {
    super();
    this.imageId = imageId;
    this.width = width;
    this.view = view;
    this.from = from;
    this.to = to;
    this.padPath = padPath;
    this.uploadBlocked = uploadBlocked;
    this.uploadBlockReason = uploadBlockReason;
    this.onUploadLimitsUpdate = onUploadLimitsUpdate;
    this.onUploadError = onUploadError;
  }

  eq(other: ImageWidget) {
    return (
      this.imageId === other.imageId &&
      this.width === other.width &&
      this.from === other.from &&
      this.to === other.to &&
      this.uploadBlocked === other.uploadBlocked &&
      this.uploadBlockReason === other.uploadBlockReason
    );
  }

  toDOM() {
    const wrapper = document.createElement("span");
    wrapper.className = "cm-live-image-upload";

    if (!this.imageId) {
      const label = document.createElement("label");
      label.className = "cm-live-image-upload-btn";
      label.textContent = this.uploadBlocked
        ? (this.uploadBlockReason ?? "Upload blocked")
        : "Upload image";
      const input = document.createElement("input");
      input.type = "file";
      input.accept = "image/jpeg,image/png,image/gif,image/webp";
      input.style.display = "none";
      if (this.uploadBlocked) {
        label.classList.add("cm-live-image-uploading");
      }
      const {
        view,
        from,
        to,
        padPath,
        uploadBlocked,
        uploadBlockReason,
        onUploadLimitsUpdate,
        onUploadError,
      } = this;
      input.addEventListener("change", async () => {
        if (uploadBlocked) {
          const message =
            uploadBlockReason ?? "Image upload blocked for this pad";
          label.textContent = message;
          onUploadError(message);
          return;
        }
        const file = input.files?.[0];
        if (!file) return;
        const allowedTypes = new Set([
          "image/jpeg",
          "image/png",
          "image/gif",
          "image/webp",
        ]);
        if (!allowedTypes.has(file.type)) {
          const message = "Only JPEG, PNG, GIF, or WebP images are allowed.";
          label.textContent = message;
          onUploadError(message);
          return;
        }
        if (file.size > 10 * 1024 * 1024) {
          label.textContent = "Max 10MB. Try another file.";
          onUploadError("File too large. Max 10MB.");
          return;
        }
        label.textContent = "Uploading...";
        label.classList.add("cm-live-image-uploading");
        let optimized = file;
        try {
          optimized = await compressImageForUpload(file);
        } catch {
          optimized = file;
        }
        const formData = new FormData();
        formData.append("file", optimized);
        fetch(`${API}/api/pad/${padPath}/images`, { method: "POST", credentials: "include", body: formData })
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
              view.dispatch({
                changes: { from, to, insert: `\\image[${data.imageId}]` },
              });
            },
          )
          .catch((err: unknown) => {
            const message =
              err instanceof Error ? err.message : "Upload failed. Try again.";
            label.textContent = message;
            label.classList.remove("cm-live-image-uploading");
            onUploadError(message);
          });
      });
      label.appendChild(input);
      wrapper.appendChild(label);
    } else {
      const container = document.createElement("span");
      container.className = "cm-live-image-container";
      container.style.setProperty("display", "inline-block", "important");
      container.style.setProperty("max-width", "100%", "important");

      const frame = document.createElement("span");
      frame.className = "cm-live-image-frame";
      frame.style.setProperty("position", "relative", "important");
      frame.style.setProperty("display", "inline-block", "important");
      frame.style.setProperty("max-width", "100%", "important");
      if (this.width) frame.style.width = `${this.width}px`;

      const img = document.createElement("img");
      img.src = `${API}/api/images/${this.imageId}`;
      img.className = "cm-live-image";
      img.alt = "Uploaded image";
      img.style.display = "block";
      if (this.width) {
        img.style.width = "100%";
        img.style.maxHeight = "none";
      }

      let scheduleInitialSync = null as (() => void) | null;

      if (!this.width) {
        const syncFrameWidth = (attempts = 12) => {
          const renderedW = img.getBoundingClientRect().width;
          if (renderedW > 0) {
            frame.style.width = `${Math.round(renderedW)}px`;
            img.style.width = "100%";
            img.style.maxHeight = "none";
            return;
          }
          if (attempts > 0) {
            requestAnimationFrame(() => syncFrameWidth(attempts - 1));
          }
        };

        const scheduleSync = () => {
          requestAnimationFrame(() => syncFrameWidth());
        };
        scheduleInitialSync = scheduleSync;

        const onLoad = () => scheduleSync();
        img.addEventListener("load", onLoad);
        if (img.complete) scheduleSync();
        if (typeof img.decode === "function") {
          img.decode().then(scheduleSync).catch(() => {
            // Ignore decode failures and keep fallback listeners.
          });
        }

        let resizeObserver: ResizeObserver | null = null;
        if (typeof ResizeObserver !== "undefined") {
          resizeObserver = new ResizeObserver(() => scheduleSync());
          resizeObserver.observe(img);
          resizeObserver.observe(this.view.contentDOM);
        } else {
          window.addEventListener("resize", scheduleSync);
        }

        this.cleanup = () => {
          img.removeEventListener("load", onLoad);
          if (resizeObserver) {
            resizeObserver.disconnect();
          } else {
            window.removeEventListener("resize", scheduleSync);
          }
        };
      } else {
        this.cleanup = null;
      }

      const deleteBtn = document.createElement("button");
      deleteBtn.className = "cm-live-image-delete";
      deleteBtn.textContent = "\u00d7";
      deleteBtn.title = "Delete image";
      const { view, from, to, imageId } = this;
      deleteBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        fetch(`${API}/api/images/${imageId}`, { method: "DELETE", credentials: "include" }).then(() => {
          view.dispatch({ changes: { from, to, insert: "" } });
        });
      });

      // Resize handle
      const handle = document.createElement("span");
      handle.className = "cm-live-image-resize";
      handle.addEventListener("mousedown", (e) => {
        e.preventDefault();
        e.stopPropagation();
        const startX = e.clientX;
        const startY = e.clientY;
        const startW = frame.offsetWidth;
        img.style.maxHeight = "none";
        const onMove = (ev: MouseEvent) => {
          const dx = ev.clientX - startX;
          const dy = ev.clientY - startY;
          const dist = Math.sqrt(dx * dx + dy * dy) * (dx + dy >= 0 ? 1 : -1);
          const newW = Math.max(50, startW + dist);
          frame.style.width = `${newW}px`;
          img.style.width = "100%";
        };
        const onUp = (ev: MouseEvent) => {
          document.removeEventListener("mousemove", onMove);
          document.removeEventListener("mouseup", onUp);
          const dx = ev.clientX - startX;
          const dy = ev.clientY - startY;
          const dist = Math.sqrt(dx * dx + dy * dy) * (dx + dy >= 0 ? 1 : -1);
          const finalW = Math.max(50, startW + dist);
          const newText = `\\image[${imageId}|${Math.round(finalW)}]`;
          view.dispatch({ changes: { from, to, insert: newText } });
        };
        document.addEventListener("mousemove", onMove);
        document.addEventListener("mouseup", onUp);
      });

      frame.appendChild(img);
      frame.appendChild(deleteBtn);
      frame.appendChild(handle);
      container.appendChild(frame);
      wrapper.appendChild(container);

      if (scheduleInitialSync) {
        scheduleInitialSync();
      }
    }
    return wrapper;
  }
}

function getCursorLines(state: EditorState): Set<number> {
  const lines = new Set<number>();
  for (const range of state.selection.ranges) {
    const startLine = state.doc.lineAt(range.from).number;
    const endLine = state.doc.lineAt(range.to).number;
    for (let i = startLine; i <= endLine; i++) {
      lines.add(i);
    }
  }
  return lines;
}

function isOnCursorLines(
  from: number,
  to: number,
  cursorLines: Set<number>,
  doc: any,
): boolean {
  const lineStart = doc.lineAt(from).number;
  const lineEnd = doc.lineAt(to).number;
  for (let i = lineStart; i <= lineEnd; i++) {
    if (cursorLines.has(i)) return true;
  }
  return false;
}

function addImageDecorations(
  doc: string,
  docObj: any,
  cursorLines: Set<number>,
  decorations: Range<Decoration>[],
  view: EditorView,
  config: {
    padPath: string;
    uploadBlocked: boolean;
    uploadBlockReason: string | null;
    onUploadLimitsUpdate: (next: {
      imageCount: number;
      imageCountLimit: number;
      totalImageBytes: number;
      totalImageBytesLimit: number;
    }) => void;
    onUploadError: (message: string) => void;
  },
) {
  const imageRegex = /\\image(?:\[([^\]]+)\])?/g;
  let match;
  while ((match = imageRegex.exec(doc)) !== null) {
    const from = match.index;
    const to = from + match[0].length;
    if (isOnCursorLines(from, to, cursorLines, docObj)) continue;
    let imageId: string | null = null;
    let width: number | null = null;
    if (match[1]) {
      const parts = match[1].split("|");
      imageId = parts[0];
      if (parts[1]) width = parseInt(parts[1], 10) || null;
    }
    decorations.push(
      Decoration.replace({
        widget: new ImageWidget(
          imageId,
          width,
          view,
          from,
          to,
          config.padPath,
          config.uploadBlocked,
          config.uploadBlockReason,
          config.onUploadLimitsUpdate,
          config.onUploadError,
        ),
      }).range(from, to),
    );
  }
}

function addInlineDecorations(
  doc: string,
  docObj: any,
  cursorLines: Set<number>,
  decorations: Range<Decoration>[],
) {
  // Underline: <u>...</u>
  const uRegex = /<u>(.*?)<\/u>/g;
  let m;
  while ((m = uRegex.exec(doc)) !== null) {
    const from = m.index;
    const to = from + m[0].length;
    if (isOnCursorLines(from, to, cursorLines, docObj)) continue;
    decorations.push(hideMark.range(from, from + 3)); // <u>
    decorations.push(hideMark.range(to - 4, to)); // </u>
    decorations.push(underlineMark.range(from + 3, to - 4));
  }

  // Strikethrough: ~~...~~
  const sRegex = /~~([^~]+?)~~/g;
  while ((m = sRegex.exec(doc)) !== null) {
    const from = m.index;
    const to = from + m[0].length;
    if (isOnCursorLines(from, to, cursorLines, docObj)) continue;
    decorations.push(hideMark.range(from, from + 2));
    decorations.push(hideMark.range(to - 2, to));
    decorations.push(strikethroughMark.range(from + 2, to - 2));
  }

  // Alignment: {center}, {right}, {justify} after optional heading prefix
  const alignRegex = /^(?:#{1,6}\s)?(\{(center|right|justify)\})/gm;
  while ((m = alignRegex.exec(doc)) !== null) {
    const from = m.index + m[0].indexOf(m[1]);
    const to = from + m[1].length;
    const line = docObj.lineAt(from);
    if (cursorLines.has(line.number)) continue;
    decorations.push(hideMark.range(from, to));
    const alignDeco =
      m[2] === "center"
        ? alignCenter
        : m[2] === "right"
          ? alignRight
          : alignJustify;
    decorations.push(alignDeco.range(line.from));
  }

  // Bare URLs: https://example.com
  const urlRegex = /(?<!\]\()https?:\/\/[^\s<]+/g;
  while ((m = urlRegex.exec(doc)) !== null) {
    const from = m.index;
    let url = m[0];
    // Trim punctuation that's usually not part of URLs in prose.
    while (/[),.;!?]$/.test(url)) {
      url = url.slice(0, -1);
    }
    const to = from + url.length;
    if (!url) continue;
    if (isOnCursorLines(from, to, cursorLines, docObj)) continue;
    decorations.push(
      Decoration.replace({
        widget: new LinkWidget(url, url),
      }).range(from, to),
    );
  }
}

function addLatexDecorations(
  doc: string,
  docObj: any,
  cursorLines: Set<number>,
  decorations: Range<Decoration>[],
) {
  // Block math: $$...$$
  const blockRegex = /\$\$([^$]+?)\$\$/g;
  let match;
  while ((match = blockRegex.exec(doc)) !== null) {
    const from = match.index;
    const to = from + match[0].length;
    if (isOnCursorLines(from, to, cursorLines, docObj)) continue;
    decorations.push(
      Decoration.replace({
        widget: new KatexBlockWidget(match[1].trim()),
        block: true,
      }).range(from, to),
    );
  }

  // Inline math: $...$  (but not $$)
  const inlineRegex = /(?<!\$)\$(?!\$)([^$\n]+?)\$(?!\$)/g;
  while ((match = inlineRegex.exec(doc)) !== null) {
    const from = match.index;
    const to = from + match[0].length;
    if (isOnCursorLines(from, to, cursorLines, docObj)) continue;
    decorations.push(
      Decoration.replace({
        widget: new KatexInlineWidget(match[1]),
      }).range(from, to),
    );
  }
}

function getImageRanges(doc: string): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
  const regex = /\\image(?:\[([^\]]+)\])?/g;
  let match;
  while ((match = regex.exec(doc)) !== null) {
    ranges.push([match.index, match.index + match[0].length]);
  }
  return ranges;
}

function isInImageRange(
  from: number,
  to: number,
  imageRanges: Array<[number, number]>,
): boolean {
  for (const [start, end] of imageRanges) {
    if (from < end && to > start) return true;
  }
  return false;
}

function buildDecorations(
  view: EditorView,
  config: {
    padPath: string;
    uploadBlocked: boolean;
    uploadBlockReason: string | null;
    onUploadLimitsUpdate: (next: {
      imageCount: number;
      imageCountLimit: number;
      totalImageBytes: number;
      totalImageBytesLimit: number;
    }) => void;
    onUploadError: (message: string) => void;
  },
): DecorationSet {
  const focused = view.hasFocus;
  const cursorLines = focused ? getCursorLines(view.state) : new Set<number>();
  const decorations: Range<Decoration>[] = [];
  const tree = syntaxTree(view.state);
  const docText = view.state.doc.toString();
  const imageRanges = getImageRanges(docText);

  tree.iterate({
    enter(node) {
      const lineStart = view.state.doc.lineAt(node.from);
      const lineEnd = view.state.doc.lineAt(node.to);
      const isOnCursor = (() => {
        for (let i = lineStart.number; i <= lineEnd.number; i++) {
          if (cursorLines.has(i)) return true;
        }
        return false;
      })();

      if (isOnCursor) return;

      // Headings
      const headingMatch = node.name.match(/^ATXHeading(\d)$/);
      if (headingMatch) {
        const level = parseInt(headingMatch[1]);
        decorations.push(headingLine[level].range(lineStart.from));
        return;
      }

      // Hide heading marks (# symbols + space)
      if (node.name === "HeaderMark") {
        const after = node.to;
        const nextChar = view.state.doc.sliceString(after, after + 1);
        const end = nextChar === " " ? after + 1 : after;
        decorations.push(hideMark.range(node.from, end));
        return;
      }

      // Bold
      if (node.name === "StrongEmphasis") {
        const text = view.state.doc.sliceString(node.from, node.to);
        const markerLen = text.startsWith("**") ? 2 : 1;
        decorations.push(hideMark.range(node.from, node.from + markerLen));
        decorations.push(hideMark.range(node.to - markerLen, node.to));
        decorations.push(
          boldMark.range(node.from + markerLen, node.to - markerLen),
        );
        return false;
      }

      // Italic
      if (node.name === "Emphasis") {
        decorations.push(hideMark.range(node.from, node.from + 1));
        decorations.push(hideMark.range(node.to - 1, node.to));
        decorations.push(italicMark.range(node.from + 1, node.to - 1));
        return false;
      }

      // Inline code
      if (node.name === "InlineCode") {
        const text = view.state.doc.sliceString(node.from, node.to);
        const ticks = text.startsWith("``") ? 2 : 1;
        decorations.push(hideMark.range(node.from, node.from + ticks));
        decorations.push(hideMark.range(node.to - ticks, node.to));
        decorations.push(codeMark.range(node.from + ticks, node.to - ticks));
        return false;
      }

      // Links [text](url)
      if (node.name === "Link") {
        const fullText = view.state.doc.sliceString(node.from, node.to);
        const closeBracket = fullText.indexOf("](");
        if (closeBracket !== -1) {
          const linkText = fullText.slice(1, closeBracket);
          const url = fullText.slice(closeBracket + 2, -1);
          decorations.push(
            Decoration.replace({
              widget: new LinkWidget(linkText, url),
            }).range(node.from, node.to),
          );
        }
        return false;
      }

      // Blockquotes
      if (node.name === "Blockquote") {
        for (let i = lineStart.number; i <= lineEnd.number; i++) {
          const line = view.state.doc.line(i);
          decorations.push(quoteLine.range(line.from));
        }
        return;
      }

      // Quote marks (> )
      if (node.name === "QuoteMark") {
        const after = node.to;
        const nextChar = view.state.doc.sliceString(after, after + 1);
        const end = nextChar === " " ? after + 1 : after;
        decorations.push(hideMark.range(node.from, end));
        return;
      }

      // Thematic breaks (---, ***, ___)
      if (node.name === "HorizontalRule") {
        decorations.push(hideMark.range(node.from, node.to));
        decorations.push(
          Decoration.widget({ widget: new HrWidget(), block: true }).range(
            node.from,
          ),
        );
        return false;
      }
    },
  });

  // Regex-based decorations (not handled by markdown parser)
  addInlineDecorations(docText, view.state.doc, cursorLines, decorations);
  addLatexDecorations(docText, view.state.doc, cursorLines, decorations);

  // Filter out tree/latex decorations that overlap with \image ranges, then add image widgets
  const filtered =
    imageRanges.length > 0
      ? decorations.filter((d) => !isInImageRange(d.from, d.to, imageRanges))
      : decorations;
  const final = imageRanges.length > 0 ? filtered : decorations;
  addImageDecorations(
    docText,
    view.state.doc,
    cursorLines,
    final,
    view,
    config,
  );

  // Sort by position (required by CodeMirror)
  final.sort(
    (a, b) => a.from - b.from || a.value.startSide - b.value.startSide,
  );
  return Decoration.set(final);
}

export function createLivePreview(config: {
  padPath: string;
  uploadBlocked: boolean;
  uploadBlockReason: string | null;
  onUploadLimitsUpdate: (next: {
    imageCount: number;
    imageCountLimit: number;
    totalImageBytes: number;
    totalImageBytesLimit: number;
  }) => void;
  onUploadError: (message: string) => void;
}) {
  return ViewPlugin.fromClass(
    class {
      decorations: DecorationSet;
      retryTimer: ReturnType<typeof setTimeout> | null = null;

      constructor(view: EditorView) {
        this.decorations = buildDecorations(view, config);
        this.scheduleRetry(view);
      }

      update(update: ViewUpdate) {
        this.decorations = buildDecorations(update.view, config);
        if (update.docChanged) {
          this.scheduleRetry(update.view);
        }
        if (update.focusChanged) {
          this.decorations = buildDecorations(update.view, config);
        }
      }

      scheduleRetry(view: EditorView, attempts = 5) {
        if (this.retryTimer) clearTimeout(this.retryTimer);
        if (attempts <= 0) return;
        this.retryTimer = setTimeout(() => {
          this.retryTimer = null;
          const treeReady =
            syntaxTree(view.state).length >= view.state.doc.length;
          view.dispatch({});
          if (!treeReady) this.scheduleRetry(view, attempts - 1);
        }, 150);
      }

      destroy() {
        if (this.retryTimer) clearTimeout(this.retryTimer);
      }
    },
    { decorations: (v) => v.decorations },
  );
}

export const livePreviewTheme = EditorView.baseTheme({
  ".cm-live-h1": { fontSize: "2em", fontWeight: "700", lineHeight: "1.3" },
  ".cm-live-h2": { fontSize: "1.5em", fontWeight: "600", lineHeight: "1.3" },
  ".cm-live-h3": { fontSize: "1.25em", fontWeight: "600", lineHeight: "1.4" },
  ".cm-live-h4": { fontSize: "1.1em", fontWeight: "600", lineHeight: "1.4" },
  ".cm-live-h5": { fontSize: "1em", fontWeight: "600", lineHeight: "1.4" },
  ".cm-live-h6": { fontSize: "0.9em", fontWeight: "600", lineHeight: "1.4" },
  ".cm-live-bold": { fontWeight: "700" },
  ".cm-live-italic": { fontStyle: "italic" },
  ".cm-live-underline": { textDecoration: "underline" },
  ".cm-live-strikethrough": { textDecoration: "line-through" },
  ".cm-live-align-center": { textAlign: "center" },
  ".cm-live-align-right": { textAlign: "right" },
  ".cm-live-align-justify": { textAlign: "justify" },
  ".cm-live-code": {
    fontFamily: "ui-monospace, Consolas, monospace",
    backgroundColor: "rgba(120, 113, 108, 0.15)",
    borderRadius: "3px",
    padding: "1px 4px",
    fontSize: "0.9em",
  },
  ".cm-live-link": {
    color: "#2563eb",
    textDecoration: "underline",
    cursor: "pointer",
  },
  ".cm-live-blockquote": {
    borderLeft: "3px solid rgba(120, 113, 108, 0.4)",
    paddingLeft: "12px",
    color: "rgba(120, 113, 108, 0.8)",
  },
  ".cm-live-hr-line": {
    border: "none",
    borderTop: "2px solid rgba(120, 113, 108, 0.3)",
    margin: "8px 0",
  },
  ".cm-live-katex-inline": {
    display: "inline",
    verticalAlign: "baseline",
  },
  ".cm-live-katex-block": {
    display: "block",
    textAlign: "center",
    padding: "8px 0",
  },
  ".cm-line:has(.cm-live-image-upload)": {
    lineHeight: "0",
    fontSize: "0",
    padding: "0",
  },
  ".cm-live-image-upload": {
    display: "block",
    padding: "0 0 8px 0",
  },
  ".cm-live-image-upload-btn": {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    padding: "10px 20px",
    border: "2px dashed rgba(120, 113, 108, 0.3)",
    borderRadius: "8px",
    color: "rgba(120, 113, 108, 0.7)",
    cursor: "pointer",
    fontSize: "0.9em",
    transition: "border-color 0.2s, color 0.2s",
    "&:hover": {
      borderColor: "rgba(120, 113, 108, 0.6)",
      color: "rgba(120, 113, 108, 1)",
    },
  },
  ".cm-live-image-uploading": {
    opacity: "0.6",
    pointerEvents: "none",
  },
  ".cm-live-spin": {
    animation: "spin 1s linear infinite",
  },
  ".cm-live-image-container": {
    display: "inline-block",
    maxWidth: "100%",
  },
  ".cm-live-image-frame": {
    position: "relative",
    display: "inline-block",
    maxWidth: "100%",
  },
  ".cm-live-image": {
    maxWidth: "100%",
    maxHeight: "500px",
    borderRadius: "6px",
    display: "block",
  },
  ".cm-live-image-delete": {
    position: "absolute",
    top: "8px",
    right: "8px",
    width: "28px",
    height: "28px",
    borderRadius: "50%",
    border: "none",
    background: "rgba(0,0,0,0.55)",
    color: "#fff",
    fontSize: "16px",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    opacity: "0",
    transition: "opacity 0.2s",
  },
  ".cm-live-image-frame:hover .cm-live-image-delete": {
    opacity: "1",
  },
  ".cm-live-image-resize": {
    position: "absolute",
    bottom: "4px",
    right: "4px",
    width: "16px",
    height: "16px",
    cursor: "nwse-resize",
    opacity: "0",
    transition: "opacity 0.2s",
    background: "rgba(0,0,0,0.55)",
    borderRadius: "4px",
    backgroundImage: `url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='10' viewBox='0 0 10 10'%3E%3Cpath d='M9 1v8H1' fill='none' stroke='white' stroke-width='1.5' stroke-linecap='round'/%3E%3C/svg%3E")`,
    backgroundRepeat: "no-repeat",
    backgroundPosition: "center",
  },
  ".cm-live-image-frame:hover .cm-live-image-resize": {
    opacity: "1",
  },
});
