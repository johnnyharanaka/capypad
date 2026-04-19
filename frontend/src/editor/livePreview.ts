import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from "@codemirror/view";
import {
  type EditorState,
  type Range,
  type Text,
} from "@codemirror/state";
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

    if (this.imageId?.startsWith("uploading-")) {
      const container = document.createElement("div");
      container.className = "cm-live-image-spinner-container";
      container.style.cursor = "default";
      const icon = document.createElement("span");
      icon.className = "cm-live-spin";
      icon.style.display = "flex";
      icon.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="2" x2="12" y2="6"></line><line x1="12" y1="18" x2="12" y2="22"></line><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line><line x1="2" y1="12" x2="6" y2="12"></line><line x1="18" y1="12" x2="22" y2="12"></line><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line><line x1="16.24" y1="4.93" x2="19.07" y2="7.76"></line></svg>`;
      const textNode = document.createElement("span");
      textNode.textContent = "Uploading image...";
      container.appendChild(icon);
      container.appendChild(textNode);
      wrapper.appendChild(container);
    } else if (!this.imageId) {
      const label = document.createElement("label");
      label.className = "cm-live-image-upload-btn";
      
      const icon = document.createElement("span");
      icon.style.display = "flex";
      icon.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2" ry="2"></rect><circle cx="8.5" cy="8.5" r="1.5"></circle><polyline points="21 15 16 10 5 21"></polyline></svg>`;
      
      const textNode = document.createElement("span");
      textNode.textContent = this.uploadBlocked
        ? (this.uploadBlockReason ?? "Upload blocked")
        : "Upload image";
        
      label.appendChild(icon);
      label.appendChild(textNode);
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
          textNode.textContent = message;
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
          textNode.textContent = message;
          onUploadError(message);
          return;
        }
        if (file.size > 10 * 1024 * 1024) {
          textNode.textContent = "Max 10MB. Try another file.";
          onUploadError("File too large. Max 10MB.");
          return;
        }
        textNode.textContent = "Uploading...";
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
            textNode.textContent = message;
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
      img.crossOrigin = "anonymous";
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

class VideoWidget extends WidgetType {
  url: string | null;
  view: EditorView;
  from: number;
  to: number;

  constructor(url: string | null, view: EditorView, from: number, to: number) {
    super();
    this.url = url;
    this.view = view;
    this.from = from;
    this.to = to;
  }
  
  eq(other: VideoWidget) {
    return this.url === other.url && this.from === other.from && this.to === other.to;
  }
  
  toDOM() {
    const container = document.createElement("div");
    container.className = "cm-live-video-container";
    container.contentEditable = "false";

    if (!this.url) {
      const prompt = document.createElement("div");
      prompt.className = "cm-live-video-prompt";
      
      const icon = document.createElement("span");
      icon.style.display = "flex";
      icon.style.color = "rgba(120, 113, 108, 0.7)";
      icon.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><polygon points="23 7 16 12 23 17 23 7"></polygon><rect x="1" y="5" width="15" height="14" rx="2" ry="2"></rect></svg>`;
      
      const input = document.createElement("input");
      input.type = "text";
      input.placeholder = "Paste YouTube or Drive link...";
      input.className = "cm-live-video-input";
      
      const btn = document.createElement("button");
      btn.textContent = "Embed";
      btn.className = "cm-live-video-embed-btn";
      
      const { view, from, to } = this;
      const applyLink = () => {
        if (input.value.trim()) {
           view.dispatch({ changes: { from, to, insert: `\\video[${input.value.trim()}]` } });
        }
      };
      
      btn.addEventListener("click", applyLink);
      input.addEventListener("keydown", (e) => {
        if (e.key === "Enter") applyLink();
      });

      prompt.appendChild(icon);
      prompt.appendChild(input);
      prompt.appendChild(btn);
      container.appendChild(prompt);
      return container;
    }

    const ytMatch = this.url.match(/(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([^&?]+)/);
    const driveMatch = this.url.match(/drive\.google\.com\/file\/d\/([^/]+)/);

    if (ytMatch && ytMatch[1]) {
      const iframe = document.createElement("iframe");
      iframe.src = `https://www.youtube.com/embed/${ytMatch[1]}`;
      iframe.allowFullscreen = true;
      iframe.allow = "accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture";
      iframe.className = "cm-live-video-iframe";
      container.appendChild(iframe);
    } else if (driveMatch && driveMatch[1]) {
      const iframe = document.createElement("iframe");
      iframe.src = `https://drive.google.com/file/d/${driveMatch[1]}/preview`;
      iframe.allowFullscreen = true;
      iframe.className = "cm-live-video-iframe";
      container.appendChild(iframe);
    } else {
      const video = document.createElement("video");
      video.src = this.url;
      video.controls = true;
      video.className = "cm-live-video-native";
      container.appendChild(video);
    }
    return container;
  }
}

class FileWidget extends WidgetType {
  fileId: string | null;
  filename: string | null;
  view: EditorView;
  from: number;
  to: number;
  padPath: string;

  constructor(
    fileId: string | null,
    filename: string | null,
    view: EditorView,
    from: number,
    to: number,
    padPath: string
  ) {
    super();
    this.fileId = fileId;
    this.filename = filename;
    this.view = view;
    this.from = from;
    this.to = to;
    this.padPath = padPath;
  }

  eq(other: FileWidget) {
    return this.fileId === other.fileId && this.filename === other.filename && this.from === other.from && this.to === other.to;
  }

  toDOM() {
    const wrapper = document.createElement("span");
    wrapper.className = "cm-live-file-wrapper";

    if (this.fileId?.startsWith("uploading-")) {
      const container = document.createElement("div");
      container.className = "cm-live-file-spinner-container";
      container.style.cursor = "default";
      const icon = document.createElement("span");
      icon.className = "cm-live-spin";
      icon.style.display = "flex";
      icon.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><line x1="12" y1="2" x2="12" y2="6"></line><line x1="12" y1="18" x2="12" y2="22"></line><line x1="4.93" y1="4.93" x2="7.76" y2="7.76"></line><line x1="16.24" y1="16.24" x2="19.07" y2="19.07"></line><line x1="2" y1="12" x2="6" y2="12"></line><line x1="18" y1="12" x2="22" y2="12"></line><line x1="4.93" y1="19.07" x2="7.76" y2="16.24"></line><line x1="16.24" y1="4.93" x2="19.07" y2="7.76"></line></svg>`;
      const textNode = document.createElement("span");
      textNode.textContent = "Uploading file...";
      container.appendChild(icon);
      container.appendChild(textNode);
      wrapper.appendChild(container);
    } else if (!this.fileId) {
      const label = document.createElement("label");
      label.className = "cm-live-file-upload-btn";
      
      const icon = document.createElement("span");
      icon.style.display = "flex";
      icon.innerHTML = `<svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21.44 11.05l-9.19 9.19a6 6 0 0 1-8.49-8.49l9.19-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.19a2 2 0 0 1-2.83-2.83l8.49-8.48"></path></svg>`;
      
      const textNode = document.createElement("span");
      textNode.textContent = "Upload file";
      
      label.appendChild(icon);
      label.appendChild(textNode);
      const input = document.createElement("input");
      input.type = "file";
      input.style.display = "none";
      
      const { view, from, to, padPath } = this;
      input.addEventListener("change", async () => {
        const file = input.files?.[0];
        if (!file) return;

        textNode.textContent = "Uploading...";
        label.classList.add("cm-live-file-uploading");

        const formData = new FormData();
        formData.append("file", file);
        fetch(`${API}/api/pad/${padPath}/files`, { method: "POST", credentials: "include", body: formData })
          .then(async (r) => {
            if (!r.ok) {
              const message = await r.text().catch(() => "Upload failed.");
              throw new Error(message || "Upload failed.");
            }
            return r.json();
          })
          .then((data: { fileId: string, filename: string }) => {
            view.dispatch({
              changes: { from, to, insert: `\\file[${data.fileId}|${data.filename}]` },
            });
          })
          .catch((err: unknown) => {
            const message = err instanceof Error ? err.message : "Upload failed.";
            textNode.textContent = message;
            label.classList.remove("cm-live-file-uploading");
          });
      });
      label.appendChild(input);
      wrapper.appendChild(label);
    } else {
      const a = document.createElement("a");
      a.className = "cm-live-file-download-btn";
      a.href = `${API}/api/files/${this.fileId}`;
      a.target = "_blank";
      a.rel = "noopener noreferrer";
      a.title = "Download " + (this.filename || "file");

      const icon = document.createElement("span");
      icon.style.display = "flex";
      icon.innerHTML = `<svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path><polyline points="7 10 12 15 17 10"></polyline><line x1="12" y1="15" x2="12" y2="3"></line></svg>`;
      
      const textNode = document.createElement("span");
      textNode.textContent = this.filename || "Download file";
      
      a.appendChild(icon);
      a.appendChild(textNode);

      const deleteBtn = document.createElement("button");
      deleteBtn.className = "cm-live-file-delete";
      deleteBtn.innerHTML = "&times;";
      deleteBtn.title = "Delete file";
      const { view, from, to, fileId } = this;
      deleteBtn.addEventListener("click", (e) => {
        e.preventDefault();
        e.stopPropagation();
        fetch(`${API}/api/files/${fileId}`, { method: "DELETE", credentials: "include" }).then(() => {
          view.dispatch({ changes: { from, to, insert: "" } });
        });
      });

      wrapper.appendChild(a);
      wrapper.appendChild(deleteBtn);
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
  doc: Text,
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
  docObj: Text,
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
  docObj: Text,
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
  docObj: Text,
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

function getRegexRanges(doc: string, regex: RegExp): Array<[number, number]> {
  const ranges: Array<[number, number]> = [];
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

function addVideoDecorations(
  doc: string,
  docObj: Text,
  cursorLines: Set<number>,
  decorations: Range<Decoration>[],
  view: EditorView
) {
  const regex = /\\video(?:\[(.*?)\])?/g;
  let match;
  while ((match = regex.exec(doc)) !== null) {
    const from = match.index;
    const to = from + match[0].length;
    if (isOnCursorLines(from, to, cursorLines, docObj)) continue;
    let url: string | null = null;
    if (match[1]) url = match[1];
    
    decorations.push(
      Decoration.replace({
        widget: new VideoWidget(url, view, from, to),
      }).range(from, to)
    );
  }
}

function addFileDecorations(
  doc: string,
  docObj: Text,
  cursorLines: Set<number>,
  decorations: Range<Decoration>[],
  view: EditorView,
  config: { padPath: string }
) {
  const regex = /\\file(?:\[([^\]]+)\])?/g;
  let match;
  while ((match = regex.exec(doc)) !== null) {
    const from = match.index;
    const to = from + match[0].length;
    if (isOnCursorLines(from, to, cursorLines, docObj)) continue;
    let fileId: string | null = null;
    let filename: string | null = null;
    if (match[1]) {
      const parts = match[1].split("|");
      fileId = parts[0];
      if (parts[1]) filename = parts[1];
    }
    decorations.push(
      Decoration.replace({
        widget: new FileWidget(fileId, filename, view, from, to, config.padPath),
      }).range(from, to)
    );
  }
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

  const imageRanges = getRegexRanges(docText, /\\image(?:\[([^\]]+)\])?/g);
  const fileRanges = getRegexRanges(docText, /\\file(?:\[([^\]]+)\])?/g);
  const videoRanges = getRegexRanges(docText, /\\video(?:\[(.*?)\])?/g);
  const allOmittedRanges = [...imageRanges, ...fileRanges, ...videoRanges];

  // Filter out tree/latex decorations that overlap with special regex ranges
  const filtered =
    allOmittedRanges.length > 0
      ? decorations.filter((d) => !isInImageRange(d.from, d.to, allOmittedRanges))
      : decorations;
  const final = allOmittedRanges.length > 0 ? filtered : decorations;
  
  addVideoDecorations(docText, view.state.doc, cursorLines, final, view);
  addFileDecorations(docText, view.state.doc, cursorLines, final, view, config);
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
    fontSize: "14px",
    fontFamily: "system-ui, sans-serif",
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
  ".cm-live-image-spinner-container": {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    color: "rgba(120, 113, 108, 0.7)",
    fontSize: "14px",
    fontFamily: "system-ui, sans-serif",
    padding: "4px 0",
    opacity: "0.8",
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
  ".cm-line:has(.cm-live-file-wrapper)": {
    lineHeight: "0",
    fontSize: "0",
    padding: "0",
  },
  ".cm-live-file-wrapper": {
    display: "inline-block",
    padding: "4px 0",
    position: "relative",
  },
  ".cm-live-file-upload-btn": {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    padding: "8px 16px",
    background: "rgba(120, 113, 108, 0.05)",
    border: "2px solid rgba(120, 113, 108, 0.2)",
    borderRadius: "8px",
    color: "rgba(120, 113, 108, 0.8)",
    cursor: "pointer",
    fontSize: "14px",
    fontFamily: "system-ui, sans-serif",
    transition: "border-color 0.2s, background 0.2s",
    "&:hover": {
      borderColor: "rgba(120, 113, 108, 0.4)",
      background: "rgba(120, 113, 108, 0.1)",
    },
  },
  ".cm-live-file-uploading": {
    opacity: "0.6",
    pointerEvents: "none",
  },
  ".cm-live-file-spinner-container": {
    display: "inline-flex",
    alignItems: "center",
    gap: "6px",
    color: "rgba(120, 113, 108, 0.7)",
    fontSize: "14px",
    fontFamily: "system-ui, sans-serif",
    padding: "4px 0",
  },
  ".cm-live-file-download-btn": {
    display: "inline-flex",
    alignItems: "center",
    gap: "8px",
    padding: "8px 16px",
    background: "#f0fdf4",
    border: "1px solid #bbf7d0",
    borderRadius: "8px",
    color: "#166534",
    cursor: "pointer",
    fontSize: "14px",
    fontWeight: "500",
    fontFamily: "system-ui, sans-serif",
    textDecoration: "none",
    transition: "background 0.2s, border-color 0.2s",
    "&:hover": {
      background: "#dcfce7",
      borderColor: "#86efac",
    },
  },
  ".cm-live-file-delete": {
    position: "absolute",
    top: "-6px",
    right: "-6px",
    width: "20px",
    height: "20px",
    borderRadius: "50%",
    border: "none",
    background: "#ef4444",
    color: "#fff",
    fontSize: "14px",
    cursor: "pointer",
    display: "flex",
    alignItems: "center",
    justifyContent: "center",
    opacity: "0",
    transition: "opacity 0.2s, transform 0.2s",
    "&:hover": {
      transform: "scale(1.1)",
    },
  },
  ".cm-live-file-wrapper:hover .cm-live-file-delete": {
    opacity: "1",
  },
  ".cm-line:has(.cm-live-video-container)": {
    lineHeight: "0",
    fontSize: "0",
    padding: "0",
  },
  ".cm-live-video-container": {
    display: "block",
    padding: "8px 0",
    maxWidth: "50%",
  },
  ".cm-live-video-iframe": {
    width: "100%",
    aspectRatio: "16 / 9",
    border: "none",
    borderRadius: "8px",
    background: "#000",
  },
  ".cm-live-video-native": {
    width: "100%",
    maxHeight: "500px",
    borderRadius: "8px",
    background: "#000",
    display: "block",
  },
  ".cm-live-video-prompt": {
    display: "flex",
    alignItems: "center",
    gap: "10px",
    padding: "12px 16px",
    background: "rgba(120, 113, 108, 0.05)",
    border: "2px dashed rgba(120, 113, 108, 0.3)",
    borderRadius: "8px",
  },
  ".cm-live-video-input": {
    flex: "1",
    height: "36px",
    boxSizing: "border-box",
    padding: "0 12px",
    border: "1px solid rgba(120, 113, 108, 0.3)",
    borderRadius: "6px",
    background: "transparent",
    color: "rgba(120, 113, 108, 0.9)",
    outline: "none",
    fontFamily: "system-ui, sans-serif",
    fontSize: "14px",
    minWidth: "200px"
  },
  ".cm-live-video-embed-btn": {
    display: "inline-flex",
    alignItems: "center",
    justifyContent: "center",
    height: "36px",
    boxSizing: "border-box",
    padding: "0 16px",
    background: "rgba(120, 113, 108, 0.05)",
    border: "1px solid rgba(120, 113, 108, 0.3)",
    borderRadius: "6px",
    color: "rgba(120, 113, 108, 0.8)",
    cursor: "pointer",
    fontSize: "14px",
    fontWeight: "500",
    fontFamily: "system-ui, sans-serif",
    transition: "border-color 0.2s, background 0.2s, color 0.2s",
    "&:hover": {
      borderColor: "rgba(120, 113, 108, 0.4)",
      background: "rgba(120, 113, 108, 0.1)",
      color: "rgba(120, 113, 108, 1)",
    }
  },
});
