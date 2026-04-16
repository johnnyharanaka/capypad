import { useCallback } from "react";
import DOMPurify from "dompurify";
import { jsPDF } from "jspdf";
import { marked } from "marked";
import katex from "katex";
import html2canvas from "html2canvas-pro";
import { API } from "../api";

const imageDataUrlCache = new Map<string, string>();

function buildImageCandidates(imageRef: string): string[] {
  const ref = imageRef.trim();
  if (!ref) return [];

  const out: string[] = [];
  const add = (value: string) => {
    if (value && !out.includes(value)) out.push(value);
  };

  const asPath = (() => {
    try {
      return new URL(ref).pathname;
    } catch {
      return ref;
    }
  })();

  if (/^https?:\/\//i.test(ref)) {
    add(ref);
  }

  if (asPath.startsWith("/api/images/")) {
    add(asPath);
  }

  let imageId = ref;
  if (asPath.startsWith("/api/images/")) {
    imageId = decodeURIComponent(asPath.slice("/api/images/".length));
  }

  const encoded = encodeURIComponent(imageId);
  add(`${API}/api/images/${encoded}`);
  add(`/api/images/${encoded}`);

  return out;
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(new Error("Failed to convert image blob"));
    reader.readAsDataURL(blob);
  });
}

async function fetchImageDataUrl(imageId: string): Promise<string | null> {
  const cacheKey = imageId.trim();
  const cached = imageDataUrlCache.get(cacheKey);
  if (cached) return cached;

  const candidates = buildImageCandidates(cacheKey);

  for (const url of candidates) {
    for (const credentials of ["include", "omit"] as const) {
      try {
        const response = await fetch(url, { credentials });
        if (!response.ok) continue;
        const contentType = response.headers.get("content-type") || "";
        if (!contentType.startsWith("image/")) continue;
        const blob = await response.blob();
        const dataUrl = await blobToDataUrl(blob);
        imageDataUrlCache.set(cacheKey, dataUrl);
        return dataUrl;
      } catch {
        // Try next candidate.
      }
    }
  }

  return null;
}

async function inlineContainerImages(container: HTMLElement): Promise<void> {
  const images = Array.from(container.querySelectorAll("img"));

  await Promise.all(
    images.map(async (img) => {
      const imageId = img.getAttribute("data-capypad-image-id")?.trim();
        const endpointCandidates = imageId ? buildImageCandidates(imageId) : [];
        const endpoint = endpointCandidates[0] ?? null;

      const src = img.getAttribute("src");
      const shouldHydrateFromEndpoint = Boolean(
        endpoint && (!src || src === endpoint || src.startsWith("/api/images/")),
      );

      if (shouldHydrateFromEndpoint) {
        try {
          let response = await fetch(endpoint!, { credentials: "include" });
          if (!response.ok) {
            response = await fetch(endpoint!, { credentials: "omit" });
          }
          if (response.ok) {
            const blob = await response.blob();
            const dataUrl = await blobToDataUrl(blob);
            img.src = dataUrl;
          } else if (endpoint) {
            img.src = endpoint;
          }
        } catch {
          if (endpoint) {
            img.src = endpoint;
          }
        }
      }

      const finalSrc = img.getAttribute("src");
      if (finalSrc && !finalSrc.startsWith("data:") && !shouldHydrateFromEndpoint) {
        try {
          let response = await fetch(finalSrc, { credentials: "include" });
          if (!response.ok) {
            response = await fetch(finalSrc, { credentials: "omit" });
          }
          if (response.ok) {
            const blob = await response.blob();
            const dataUrl = await blobToDataUrl(blob);
            img.src = dataUrl;
          }
        } catch {
          // Keep original src as fallback.
        }
      }

      if (typeof img.decode === "function") {
        try {
          await img.decode();
          return;
        } catch {
          // Keep fallback handlers below.
        }
      }

      await new Promise<void>((resolve) => {
        if (img.complete && img.naturalWidth > 0) {
          resolve();
          return;
        }
        img.onload = () => resolve();
        img.onerror = () => resolve();
      });
    }),
  );
}

async function renderImages(text: string): Promise<string> {
  const regex = /\\image\[([^\]|]+)(?:\|(\d+))?\]/g;
  const matches = Array.from(text.matchAll(regex));
  if (matches.length === 0) return text;

  const replacements = await Promise.all(
    matches.map(async (m) => {
      const fullMatch = m[0];
      const imageId = m[1]?.trim();
      const width = m[2];
      if (!imageId) return { fullMatch, replacement: fullMatch };

      const style = width
        ? `width:${width}px;max-width:100%;border-radius:6px`
        : `max-width:100%;border-radius:6px`;
      const endpoint = buildImageCandidates(imageId)[0] ?? `${API}/api/images/${encodeURIComponent(imageId)}`;
      const dataUrl = await fetchImageDataUrl(imageId);
      const src = dataUrl ?? endpoint;

      return {
        fullMatch,
        replacement: `<img data-capypad-image-id="${imageId}" src="${src}" alt="image" style="${style}">`,
      };
    }),
  );

  let output = text;
  for (const { fullMatch, replacement } of replacements) {
    output = output.replace(fullMatch, replacement);
  }
  return output;
}

function normalizePdfMarkdown(text: string): string {
  // Support escaped newlines coming from pasted/serialized content.
  return text.replace(/\\n/g, "\n");
}

function renderAlignment(html: string): string {
  return html.replace(
    /<(p|h[1-6]|li|div)([^>]*)>\s*\{(center|right|justify)\}/g,
    (_, tag, attrs, align) => `<${tag}${attrs} style="text-align:${align}">`,
  );
}

function renderLatex(html: string): string {
  html = html.replace(/\$\$([^$]+?)\$\$/g, (_, tex) => {
    try {
      return katex.renderToString(tex.trim(), {
        displayMode: true,
        throwOnError: false,
      });
    } catch {
      return tex;
    }
  });
  html = html.replace(/(?<!\$)\$(?!\$)([^$\n]+?)\$(?!\$)/g, (_, tex) => {
    try {
      return katex.renderToString(tex, {
        displayMode: false,
        throwOnError: false,
      });
    } catch {
      return tex;
    }
  });
  return html;
}

export default function DownloadPdfButton({
  content,
  padPath,
}: {
  content: string;
  padPath: string;
}) {
  const download = useCallback(async () => {
    const normalized = normalizePdfMarkdown(content);
    const withImages = await renderImages(normalized);
    const rawHtml = renderAlignment(
      await marked.parse(withImages, { gfm: true, breaks: true }),
    );
    const html = renderLatex(rawHtml);

    const container = document.createElement("div");
    container.style.cssText =
      "position:fixed;left:-10000px;top:0;width:700px;padding:32px;font-family:system-ui,sans-serif;font-size:13px;line-height:1.6;color:#1c1917;background:#fff;z-index:-1;pointer-events:none;box-sizing:border-box;";
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "https://cdn.jsdelivr.net/npm/katex@0.16.45/dist/katex.min.css";
    container.appendChild(link);

    const style = document.createElement("style");
    style.textContent = `
      h1 { font-size:2em; font-weight:700; margin:0.5em 0; }
      h2 { font-size:1.5em; font-weight:600; margin:0.5em 0; }
      h3 { font-size:1.25em; font-weight:600; margin:0.5em 0; }
      code { background:rgba(120,113,108,0.15); border-radius:3px; padding:1px 4px; font-size:0.9em; font-family:ui-monospace,Consolas,monospace; }
      blockquote { border-left:3px solid rgba(120,113,108,0.4); padding-left:12px; color:rgba(120,113,108,0.8); margin:0.5em 0; }
      hr { border:none; border-top:2px solid rgba(120,113,108,0.3); margin:8px 0; }
      a { color:#2563eb; text-decoration:underline; }
      p { margin:0.4em 0; white-space:pre-wrap; }
      img { max-width:100%; border-radius:6px; margin:0.5em 0; }
    `;
    container.appendChild(style);

    const contentDiv = document.createElement("div");
    contentDiv.innerHTML = DOMPurify.sanitize(html, {
      USE_PROFILES: { html: true, svg: true, mathMl: true },
    });
    container.appendChild(contentDiv);
    document.body.appendChild(container);

    const pdf = new jsPDF("p", "mm", "a4");
    const contentWidthMm = 190;
    const pageHeightMm = pdf.internal.pageSize.getHeight() - 20;

    try {
      await document.fonts.ready;
      await inlineContainerImages(container);
      await new Promise((r) => setTimeout(r, 100));

      const contentWidthPx = Math.ceil(container.getBoundingClientRect().width);
      const contentHeightPx = Math.ceil(container.scrollHeight);
      if (contentWidthPx <= 0 || contentHeightPx <= 0) {
        throw new Error("Failed to measure PDF content");
      }

      const pageHeightPx = (pageHeightMm * contentWidthPx) / contentWidthMm;
      let offsetPx = 0;
      let pageIndex = 0;

      while (offsetPx < contentHeightPx - 0.5) {
        const captureHeightPx = Math.min(pageHeightPx, contentHeightPx - offsetPx);

        const pageViewport = document.createElement("div");
        pageViewport.style.cssText =
          `position:fixed;left:-10000px;top:0;width:${contentWidthPx}px;height:${Math.ceil(captureHeightPx)}px;overflow:hidden;background:#fff;`;

        const pageContent = container.cloneNode(true) as HTMLElement;
        pageContent.style.marginTop = `-${Math.floor(offsetPx)}px`;
        pageViewport.appendChild(pageContent);
        document.body.appendChild(pageViewport);

        try {
          await inlineContainerImages(pageViewport);
          const canvas = await html2canvas(pageViewport, {
            scale: 2,
            useCORS: true,
            backgroundColor: "#ffffff",
            width: contentWidthPx,
            height: Math.ceil(captureHeightPx),
            windowWidth: contentWidthPx,
            windowHeight: Math.ceil(captureHeightPx),
            scrollX: 0,
            scrollY: 0,
          });

          const pageImageHeightMm = (captureHeightPx * contentWidthMm) / contentWidthPx;
          if (pageIndex > 0) pdf.addPage();
          pdf.addImage(
            canvas.toDataURL("image/png"),
            "PNG",
            10,
            10,
            contentWidthMm,
            pageImageHeightMm,
          );
        } finally {
          document.body.removeChild(pageViewport);
        }

        offsetPx += captureHeightPx;
        pageIndex += 1;
      }
    } finally {
      document.body.removeChild(container);
    }

    pdf.save(`${padPath}.pdf`);
  }, [content, padPath]);

  return (
    <button
      onClick={download}
      className="p-1.5 rounded-md hover:bg-stone-200 dark:hover:bg-stone-700 transition-colors"
      aria-label="Download as PDF"
    >
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
        className="w-4 h-4"
      >
        <path d="M10.75 2.75a.75.75 0 00-1.5 0v8.614L6.295 8.235a.75.75 0 10-1.09 1.03l4.25 4.5a.75.75 0 001.09 0l4.25-4.5a.75.75 0 00-1.09-1.03l-2.955 3.129V2.75z" />
        <path d="M3.5 12.75a.75.75 0 00-1.5 0v2.5A2.75 2.75 0 004.75 18h10.5A2.75 2.75 0 0018 15.25v-2.5a.75.75 0 00-1.5 0v2.5c0 .69-.56 1.25-1.25 1.25H4.75c-.69 0-1.25-.56-1.25-1.25v-2.5z" />
      </svg>
    </button>
  );
}
