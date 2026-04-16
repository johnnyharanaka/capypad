import { useCallback } from "react";
import DOMPurify from "dompurify";
import { jsPDF } from "jspdf";
import { marked } from "marked";
import katex from "katex";
import html2canvas from "html2canvas-pro";
import { API } from "../api";

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

function renderImages(text: string): string {
  return text.replace(
    /\\image\[([^\]|]+)(?:\|(\d+))?\]/g,
    (match, id, width) => {
      if (!UUID_RE.test(id)) return match;
      const style = width
        ? `width:${width}px;max-width:100%;border-radius:6px`
        : `max-width:100%;border-radius:6px`;
      return `<img src="${API}/api/images/${id}" alt="image" style="${style}">`;
    },
  );
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
    const rawHtml = renderAlignment(await marked(renderImages(content)));
    const html = renderLatex(rawHtml);

    const container = document.createElement("div");
    container.style.cssText =
      "position:absolute;left:-9999px;top:0;width:700px;padding:40px;font-family:system-ui,sans-serif;font-size:15px;line-height:1.7;color:#1c1917;background:#fff;";
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
      p { margin:0.4em 0; }
      img { max-width:100%; border-radius:6px; margin:0.5em 0; }
    `;
    container.appendChild(style);

    const contentDiv = document.createElement("div");
    contentDiv.innerHTML = DOMPurify.sanitize(html, {
      USE_PROFILES: { html: true, svg: true, mathMl: true },
    });
    container.appendChild(contentDiv);
    document.body.appendChild(container);

    await document.fonts.ready;
    const images = container.querySelectorAll("img");
    await Promise.all(
      Array.from(images).map((img) =>
        img.complete
          ? Promise.resolve()
          : new Promise((r) => {
              img.onload = r;
              img.onerror = r;
            }),
      ),
    );
    await new Promise((r) => setTimeout(r, 100));

    const canvas = await html2canvas(container, { scale: 2, useCORS: true });
    document.body.removeChild(container);

    const imgWidth = 190;
    const imgHeight = (canvas.height * imgWidth) / canvas.width;
    const pdf = new jsPDF("p", "mm", "a4");
    const pageHeight = pdf.internal.pageSize.getHeight() - 20;

    let y = 10;
    let srcY = 0;
    const totalHeight = imgHeight;

    while (srcY < totalHeight) {
      const sliceHeight = Math.min(pageHeight, totalHeight - srcY);
      const sliceCanvas = document.createElement("canvas");
      sliceCanvas.width = canvas.width;
      sliceCanvas.height = (sliceHeight / imgHeight) * canvas.height;
      const ctx = sliceCanvas.getContext("2d")!;
      ctx.drawImage(
        canvas,
        0,
        (srcY / imgHeight) * canvas.height,
        canvas.width,
        sliceCanvas.height,
        0,
        0,
        canvas.width,
        sliceCanvas.height,
      );

      const sliceImg = sliceCanvas.toDataURL("image/png");
      if (srcY > 0) pdf.addPage();
      pdf.addImage(sliceImg, "PNG", 10, y, imgWidth, sliceHeight);
      srcY += sliceHeight;
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
