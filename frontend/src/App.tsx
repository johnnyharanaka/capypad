import { useEffect, useState, useCallback, useRef } from "react";
import { API, getStoredUser, storeUser, clearStoredUser, type UserInfo } from "./api";
import DOMPurify from "dompurify";
import { jsPDF } from "jspdf";
import { marked } from "marked";
import katex from "katex";
import html2canvas from "html2canvas-pro";
import type { EditorView } from "@codemirror/view";
import PadCodeEditor from "./editor/PadEditor";
import Background from "./components/Background";
import {
  toggleBold,
  toggleItalic,
  toggleUnderline,
  toggleStrikethrough,
  toggleCode,
  toggleBulletList,
  toggleNumberedList,
  toggleBlockquote,
  setHeading,
  setAlignment,
} from "./editor/formatting";

function useDarkMode() {
  const [dark, setDark] = useState(
    () =>
      localStorage.getItem("theme") === "dark" ||
      (!localStorage.getItem("theme") &&
        window.matchMedia("(prefers-color-scheme: dark)").matches),
  );

  useEffect(() => {
    document.documentElement.classList.toggle("dark", dark);
    localStorage.setItem("theme", dark ? "dark" : "light");
  }, [dark]);

  return [dark, () => setDark(!dark)] as const;
}

function useAuth() {
  const [user, setUser] = useState<UserInfo | null>(getStoredUser);
  const [loading, setLoading] = useState(true);

  // Check session on mount via /api/auth/me
  useEffect(() => {
    fetch(`${API}/api/auth/me`, { credentials: "include" })
      .then((res) => {
        if (res.status === 403) return null; // approved=false
        return res.ok ? res.json() : null;
      })
      .then((data) => {
        if (data) {
          const info: UserInfo = {
            username: data.username,
            role: data.role,
            isAdmin: data.role === "ADMIN",
          };
          storeUser(info);
          setUser(info);
        } else {
          clearStoredUser();
          setUser(null);
        }
      })
      .catch(() => {
        clearStoredUser();
        setUser(null);
      })
      .finally(() => setLoading(false));
  }, []);

  const login = useCallback(() => {
    const redirect = encodeURIComponent(window.location.href);
    fetch(`${API}/api/auth/login?redirect=${redirect}`, { credentials: "include" })
      .then(res => res.json())
      .then(data => { window.location.href = data.url; })
      .catch(() => { window.location.href = `${API}/api/auth/login?redirect=${redirect}`; });
  }, []);

  const logout = useCallback(() => {
    fetch(`${API}/api/auth/logout`, { method: "POST", credentials: "include" })
      .catch(() => {})
      .finally(() => {
        clearStoredUser();
        setUser(null);
      });
  }, []);

  return {
    isAuthenticated: user !== null,
    isAdmin: user?.isAdmin ?? false,
    username: user?.username ?? null,
    login,
    logout,
    loading,
  };
}

// LoginModal is removed as we now use Keycloak's login page


function ThemeToggle({ dark, toggle }: { dark: boolean; toggle: () => void }) {
  return (
    <button
      onClick={toggle}
      className="p-1.5 rounded-md hover:bg-stone-200 dark:hover:bg-stone-700 transition-colors"
      aria-label="Toggle dark mode"
    >
      {dark ? (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="w-4 h-4"
        >
          <path d="M10 2a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5A.75.75 0 0110 2zm0 13a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5A.75.75 0 0110 15zm8-5a.75.75 0 01-.75.75h-1.5a.75.75 0 010-1.5h1.5A.75.75 0 0118 10zM5 10a.75.75 0 01-.75.75h-1.5a.75.75 0 010-1.5h1.5A.75.75 0 015 10zm10.657-5.657a.75.75 0 010 1.06l-1.06 1.061a.75.75 0 11-1.061-1.06l1.06-1.061a.75.75 0 011.061 0zm-9.193 9.193a.75.75 0 010 1.06l-1.06 1.061a.75.75 0 11-1.061-1.06l1.06-1.061a.75.75 0 011.061 0zm9.193 0a.75.75 0 010 1.061l-1.06 1.06a.75.75 0 01-1.061-1.06l1.06-1.06a.75.75 0 011.061 0zM5.464 4.343a.75.75 0 010 1.061L4.403 6.465a.75.75 0 01-1.06-1.06l1.06-1.062a.75.75 0 011.061 0zM10 6.5a3.5 3.5 0 100 7 3.5 3.5 0 000-7z" />
        </svg>
      ) : (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="w-4 h-4"
        >
          <path
            fillRule="evenodd"
            d="M7.455 2.004a.75.75 0 01.26.77 7 7 0 009.958 7.967.75.75 0 011.067.853A8.5 8.5 0 116.647 1.921a.75.75 0 01.808.083z"
            clipRule="evenodd"
          />
        </svg>
      )}
    </button>
  );
}

function Logo({ className = "" }: { className?: string }) {
  return (
    <span className={`font-bold font-mono ${className}`}>
      <span className="bg-gradient-to-r from-purple-400 to-purple-500 bg-clip-text text-transparent">
        &lt;/
      </span>
      <span className="bg-gradient-to-r from-pink-400 to-pink-500 bg-clip-text text-transparent">
        Capy
      </span>
      <span className="bg-gradient-to-r from-stone-700 to-stone-800 dark:from-stone-100 dark:to-stone-200 bg-clip-text text-transparent">
        Pad
      </span>
      <span className="bg-gradient-to-r from-purple-400 to-purple-500 bg-clip-text text-transparent">
        &gt;
      </span>
    </span>
  );
}

function CopyUrlButton() {
  const [copied, setCopied] = useState(false);

  const copy = useCallback(() => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, []);

  return (
    <button
      onClick={copy}
      className="p-1.5 rounded-md hover:bg-stone-200 dark:hover:bg-stone-700 transition-colors"
      aria-label="Copy URL"
    >
      {copied ? (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="w-4 h-4 text-green-500"
        >
          <path
            fillRule="evenodd"
            d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
            clipRule="evenodd"
          />
        </svg>
      ) : (
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 20 20"
          fill="currentColor"
          className="w-4 h-4"
        >
          <path d="M12.232 4.232a2.5 2.5 0 013.536 3.536l-1.225 1.224a.75.75 0 001.061 1.06l1.224-1.224a4 4 0 00-5.656-5.656l-3 3a4 4 0 00.225 5.865.75.75 0 00.977-1.138 2.5 2.5 0 01-.142-3.667l3-3z" />
          <path d="M11.603 7.963a.75.75 0 00-.977 1.138 2.5 2.5 0 01.142 3.667l-3 3a2.5 2.5 0 01-3.536-3.536l1.225-1.224a.75.75 0 00-1.061-1.06l-1.224 1.224a4 4 0 105.656 5.656l3-3a4 4 0 00-.225-5.865z" />
        </svg>
      )}
    </button>
  );
}

const UUID_RE =
  /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

function renderImages(text: string): string {
  return text.replace(/\\image\[([^\]|]+)(?:\|(\d+))?\]/g, (match, id, width) => {
    if (!UUID_RE.test(id)) return match;
    const style = width
      ? `width:${width}px;max-width:100%;border-radius:6px`
      : `max-width:100%;border-radius:6px`;
    return `<img src="${API}/api/images/${id}" alt="image" style="${style}">`;
  });
}

function renderAlignment(html: string): string {
  // Post-marked: {center} etc. end up inside <p>, <h1>-<h6>, <li> tags
  return html.replace(
    /<(p|h[1-6]|li|div)([^>]*)>\s*\{(center|right|justify)\}/g,
    (_, tag, attrs, align) => `<${tag}${attrs} style="text-align:${align}">`,
  );
}

function renderLatex(html: string): string {
  // Block math: $$...$$
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
  // Inline math: $...$
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

function DownloadPdfButton({
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
    // Build container with safe static elements + sanitized user content
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

    // Wait for fonts and images to load
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

type GroupId = "text" | "heading" | "list" | "align";

const GROUP_LABELS: Record<GroupId, string> = {
  text: "A",
  heading: "H",
  list: "•",
  align: "\u2261",
};

const GROUP_TITLES: Record<GroupId, string> = {
  text: "Text formatting",
  heading: "Headings",
  list: "Lists & blocks",
  align: "Text alignment",
};

function useWindowWidth() {
  const [width, setWidth] = useState(window.innerWidth);
  useEffect(() => {
    const onResize = () => setWidth(window.innerWidth);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);
  return width;
}

const dockBtn =
  "w-12 h-12 rounded-xl flex items-center justify-center text-stone-500 dark:text-stone-400 text-base font-semibold transition-all active:scale-90";
const dockBtnActive =
  "w-12 h-12 rounded-xl flex items-center justify-center text-stone-800 dark:text-stone-100 bg-stone-200 dark:bg-stone-700 text-base font-semibold transition-all active:scale-90";
const dockItem =
  "px-2.5 py-1.5 rounded-lg flex items-center justify-center text-stone-600 dark:text-stone-300 text-sm font-semibold transition-all active:scale-95 hover:bg-stone-200 dark:hover:bg-stone-700";

function FloatingDock({ editorView }: { editorView: EditorView | null }) {
  const [expanded, setExpanded] = useState<GroupId | null>(null);
  const windowWidth = useWindowWidth();
  const wide = windowWidth >= 640;

  if (!editorView) return null;

  const toggle = (id: GroupId) => {
    setExpanded(expanded === id ? null : id);
    editorView.focus();
  };

  const act = (action: () => void) => {
    action();
    if (!wide) setExpanded(null);
  };

  const groupIds: GroupId[] = ["text", "heading", "list", "align"];

  const groupItems: Record<
    GroupId,
    Array<{ label: React.ReactNode; action: () => void; title: string }>
  > = {
    text: [
      { label: "B", action: () => toggleBold(editorView), title: "Bold" },
      { label: "I", action: () => toggleItalic(editorView), title: "Italic" },
      {
        label: "U",
        action: () => toggleUnderline(editorView),
        title: "Underline",
      },
      {
        label: "S",
        action: () => toggleStrikethrough(editorView),
        title: "Strikethrough",
      },
    ],
    heading: [
      {
        label: "H1",
        action: () => setHeading(editorView, 1),
        title: "Heading 1",
      },
      {
        label: "H2",
        action: () => setHeading(editorView, 2),
        title: "Heading 2",
      },
      {
        label: "H3",
        action: () => setHeading(editorView, 3),
        title: "Heading 3",
      },
    ],
    list: [
      {
        label: "•",
        action: () => toggleBulletList(editorView),
        title: "Bullet list",
      },
      {
        label: "1.",
        action: () => toggleNumberedList(editorView),
        title: "Numbered list",
      },
      { label: "</>", action: () => toggleCode(editorView), title: "Code" },
      {
        label: '"',
        action: () => toggleBlockquote(editorView),
        title: "Blockquote",
      },
    ],
    align: [
      {
        label: (
          <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
            <rect x="1" y="2" width="12" height="1.5" rx=".5" />
            <rect x="1" y="5.5" width="8" height="1.5" rx=".5" />
            <rect x="1" y="9" width="12" height="1.5" rx=".5" />
          </svg>
        ),
        action: () => setAlignment(editorView, "left"),
        title: "Left",
      },
      {
        label: (
          <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
            <rect x="1" y="2" width="12" height="1.5" rx=".5" />
            <rect x="3" y="5.5" width="8" height="1.5" rx=".5" />
            <rect x="1" y="9" width="12" height="1.5" rx=".5" />
          </svg>
        ),
        action: () => setAlignment(editorView, "center"),
        title: "Center",
      },
      {
        label: (
          <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
            <rect x="1" y="2" width="12" height="1.5" rx=".5" />
            <rect x="5" y="5.5" width="8" height="1.5" rx=".5" />
            <rect x="1" y="9" width="12" height="1.5" rx=".5" />
          </svg>
        ),
        action: () => setAlignment(editorView, "right"),
        title: "Right",
      },
      {
        label: (
          <svg width="14" height="14" viewBox="0 0 14 14" fill="currentColor">
            <rect x="1" y="2" width="12" height="1.5" rx=".5" />
            <rect x="1" y="5.5" width="12" height="1.5" rx=".5" />
            <rect x="1" y="9" width="12" height="1.5" rx=".5" />
          </svg>
        ),
        action: () => setAlignment(editorView, "justify"),
        title: "Justify",
      },
    ],
  };

  const sep = (
    <div className="w-px h-5 bg-stone-300/50 dark:bg-stone-600/50 mx-1" />
  );

  if (wide) {
    return (
      <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-20">
        <div className="bg-stone-100/80 dark:bg-stone-800/80 backdrop-blur-xl rounded-2xl px-4 py-2 flex items-center gap-1 shadow-lg border border-stone-200/50 dark:border-stone-700/50">
          {groupIds.map((id, i) => (
            <div key={id} className="flex items-center gap-1">
              {i > 0 && sep}
              {groupItems[id].map((item) => (
                <button
                  key={item.title}
                  className={dockItem}
                  onClick={() => act(item.action)}
                  title={item.title}
                >
                  {item.label}
                </button>
              ))}
            </div>
          ))}
        </div>
      </div>
    );
  }

  return (
    <div className="fixed bottom-8 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center gap-2">
      {expanded && (
        <div className="bg-stone-100/90 dark:bg-stone-800/90 backdrop-blur-xl rounded-2xl px-3 py-2 flex items-center gap-1 shadow-lg border border-stone-200/50 dark:border-stone-700/50">
          {groupItems[expanded].map((item) => (
            <button
              key={item.title}
              className={dockItem}
              onClick={() => act(item.action)}
              title={item.title}
            >
              {item.label}
            </button>
          ))}
        </div>
      )}
      <div className="bg-stone-100/80 dark:bg-stone-800/80 backdrop-blur-xl rounded-2xl px-3 py-2 flex items-center gap-1.5 shadow-lg border border-stone-200/50 dark:border-stone-700/50">
        {groupIds.map((id) => (
          <button
            key={id}
            className={expanded === id ? dockBtnActive : dockBtn}
            onClick={() => toggle(id)}
            title={GROUP_TITLES[id]}
          >
            {GROUP_LABELS[id]}
          </button>
        ))}
      </div>
    </div>
  );
}

function SaveIndicator({ saving }: { saving: boolean }) {
  const [showCheck, setShowCheck] = useState(false);

  useEffect(() => {
    if (!saving && showCheck) return;
    if (!saving) return;
    setShowCheck(false);
    return () => setShowCheck(true);
  }, [saving]);

  useEffect(() => {
    if (!showCheck) return;
    const t = setTimeout(() => setShowCheck(false), 2000);
    return () => clearTimeout(t);
  }, [showCheck]);

  if (saving) {
    return (
      <div className="flex items-center gap-1 text-stone-400 dark:text-stone-500">
        <svg className="w-3 h-3 animate-spin" viewBox="0 0 16 16" fill="none">
          <circle
            cx="8"
            cy="8"
            r="6"
            stroke="currentColor"
            strokeWidth="2"
            opacity="0.3"
          />
          <path
            d="M14 8a6 6 0 00-6-6"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
          />
        </svg>
      </div>
    );
  }

  if (showCheck) {
    return (
      <svg
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 20 20"
        fill="currentColor"
        className="w-4 h-4 text-green-500 transition-opacity duration-300"
      >
        <path
          fillRule="evenodd"
          d="M16.704 4.153a.75.75 0 01.143 1.052l-8 10.5a.75.75 0 01-1.127.075l-4.5-4.5a.75.75 0 011.06-1.06l3.894 3.893 7.48-9.817a.75.75 0 011.05-.143z"
          clipRule="evenodd"
        />
      </svg>
    );
  }

  return null;
}

function useWordCount(content: string | null) {
  if (!content) return { words: 0, chars: 0 };
  const trimmed = content.trim();
  return {
    words: trimmed ? trimmed.split(/\s+/).length : 0,
    chars: content.length,
  };
}

function useTypewriter(
  words: string[],
  typingSpeed = 100,
  deletingSpeed = 60,
  pauseTime = 1500,
) {
  const [text, setText] = useState("");
  const [wordIndex, setWordIndex] = useState(0);
  const [isDeleting, setIsDeleting] = useState(false);

  useEffect(() => {
    const current = words[wordIndex];
    const timeout = setTimeout(
      () => {
        if (!isDeleting) {
          setText(current.slice(0, text.length + 1));
          if (text.length + 1 === current.length) {
            setTimeout(() => setIsDeleting(true), pauseTime);
            return;
          }
        } else {
          setText(current.slice(0, text.length - 1));
          if (text.length - 1 === 0) {
            setIsDeleting(false);
            setWordIndex((wordIndex + 1) % words.length);
          }
        }
      },
      isDeleting ? deletingSpeed : typingSpeed,
    );
    return () => clearTimeout(timeout);
  }, [
    text,
    isDeleting,
    wordIndex,
    words,
    typingSpeed,
    deletingSpeed,
    pauseTime,
  ]);

  return text;
}

function Home() {
  const [name, setName] = useState("");
  const [dark, toggle] = useDarkMode();
  const placeholder = useTypewriter([
    "my_diary...",
    "class_notes...",
    "ideas...",
  ]);

  const go = () => {
    const trimmed = name.trim().toLowerCase();
    if (trimmed) {
      window.location.href = `${import.meta.env.BASE_URL}${trimmed}`;
    }
  };

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-900 flex flex-col relative overflow-hidden">
      <Background dark={dark} />
      <header
        className="px-6 py-3 flex justify-end relative"
        style={{ zIndex: 1 }}
      >
        <ThemeToggle dark={dark} toggle={toggle} />
      </header>
      <div
        className="flex-1 flex flex-col items-center justify-center px-4 relative"
        style={{ zIndex: 1 }}
      >
        <h1 className="text-5xl tracking-tight mb-2">
          <Logo />
        </h1>
        <p className="text-stone-400 dark:text-stone-500 mb-8">
          Quick notes, instantly shared.
        </p>
        <div className="w-full max-w-md">
          <input
            className="w-full bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg px-4 py-3 text-lg text-center text-stone-800 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-stone-300 dark:focus:ring-stone-600 placeholder:text-stone-300 dark:placeholder:text-stone-600"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && go()}
            placeholder={placeholder || "\u200B"}
            aria-label="Pad name"
            autoFocus
          />
        </div>
      </div>
    </div>
  );
}

function PadEditorPage({ padPath }: { padPath: string }) {
  const [content, setContent] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [imageCount, setImageCount] = useState(0);
  const [imageCountLimit, setImageCountLimit] = useState(20);
  const [totalImageBytes, setTotalImageBytes] = useState(0);
  const [totalImageBytesLimit, setTotalImageBytesLimit] = useState(
    50 * 1024 * 1024,
  );
  const [uploadBlocked, setUploadBlocked] = useState(false);
  const [uploadBlockReason, setUploadBlockReason] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dark, toggle] = useDarkMode();
  const { words, chars } = useWordCount(content);
  const editorViewRef = useRef<EditorView | null>(null);
  const { isAuthenticated, isAdmin, username, login, logout, loading: authLoading } = useAuth();
  const [authMsg, setAuthMsg] = useState<string | null>(null);

  // Handle URL params like ?auth=pending
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const authStatus = params.get("auth");
    if (authStatus === "pending") {
      setAuthMsg("Conta criada! Aguarde aprovação do administrador.");
    } else if (authStatus === "error") {
      setAuthMsg("Houve um erro na autenticação.");
    }
    if (authStatus) {
      // Clear param
      window.history.replaceState({}, "", window.location.pathname);
      setTimeout(() => setAuthMsg(null), 5000);
    }
  }, []);

  const applyUploadLimits = useCallback(
    (next: {
      imageCount: number;
      imageCountLimit: number;
      totalImageBytes: number;
      totalImageBytesLimit: number;
      uploadBlocked?: boolean;
      uploadBlockReason?: string | null;
    }) => {
      setImageCount(next.imageCount);
      setImageCountLimit(next.imageCountLimit);
      setTotalImageBytes(next.totalImageBytes);
      setTotalImageBytesLimit(next.totalImageBytesLimit);

      const blockedByCount = next.imageCount >= next.imageCountLimit;
      const blockedByStorage =
        next.totalImageBytes >= next.totalImageBytesLimit;
      const explicitBlocked = next.uploadBlocked ?? false;

      if (explicitBlocked || blockedByCount || blockedByStorage) {
        setUploadBlocked(true);
        setUploadBlockReason(
          next.uploadBlockReason ??
            (blockedByCount
              ? "Image limit reached for this pad"
              : "Storage limit reached for this pad"),
        );
      } else {
        setUploadBlocked(false);
        setUploadBlockReason(null);
      }
    },
    [],
  );

  const onUploadError = useCallback((message: string) => {
    setUploadError(message);
    setTimeout(() => setUploadError(null), 4000);
  }, []);

  useEffect(() => {
    fetch(`${API}/api/pad/${padPath}`, { credentials: "include" })
      .then((res) => res.json())
      .then((data) => {
        setContent(data.content);
        applyUploadLimits({
          imageCount: data.imageCount ?? 0,
          imageCountLimit: data.imageCountLimit ?? 20,
          totalImageBytes: data.totalImageBytes ?? 0,
          totalImageBytesLimit: data.totalImageBytesLimit ?? 50 * 1024 * 1024,
          uploadBlocked: data.uploadBlocked,
          uploadBlockReason: data.uploadBlockReason ?? null,
        });
      })
      .catch(() => setContent(""));
  }, [padPath, applyUploadLimits]);

  useEffect(() => {
    if (content === null || !isAuthenticated) return;
    const timeout = setTimeout(() => {
      setSaving(true);
      fetch(`${API}/api/pad/${padPath}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        credentials: "include",
        body: JSON.stringify({ content }),
      })
        .then((res) => {
          if (res.status === 401) {
            logout();
            login();
          }
        })
        .finally(() => setSaving(false));
    }, 1000);
    return () => clearTimeout(timeout);
  }, [content, padPath, isAuthenticated, logout]);

  return (
    <>
    <div className="h-screen flex flex-col bg-stone-50 dark:bg-stone-900 text-stone-800 dark:text-stone-100">

      <header className="sticky top-0 z-10 bg-stone-50/80 dark:bg-stone-900/80 backdrop-blur-md px-12 py-4 flex items-center shrink-0">
        <a
          href={import.meta.env.BASE_URL}
          className="no-underline hover:opacity-70 transition-opacity text-sm shrink-0"
        >
          <Logo className="text-sm" />
          <span className="text-stone-400 dark:text-stone-500 font-normal text-sm ml-0.5">
            /{padPath}
          </span>
        </a>
        <div className="flex-1" />
        <div className="flex items-center gap-1.5 shrink-0">
          <span className="text-[11px] text-stone-400 dark:text-stone-500 tabular-nums mr-1">
            <span className="hidden sm:inline">
              {words} words · {chars} chars
            </span>
            <span className="sm:hidden">
              {words}w · {chars}c
            </span>
          </span>
          {isAuthenticated ? (
            <div className="flex items-center gap-1.5">
              {isAdmin && (
                <a
                  href={`${import.meta.env.BASE_URL}admin`}
                  className="text-[11px] text-stone-400 dark:text-stone-500 hover:text-stone-600 dark:hover:text-stone-300 transition-colors"
                >
                  admin
                </a>
              )}
              <span className="text-[11px] text-stone-400 dark:text-stone-500 max-w-[80px] truncate hidden sm:inline">
                {username}
              </span>
              <button
                onClick={logout}
                className="p-1.5 rounded-md hover:bg-stone-200 dark:hover:bg-stone-700 transition-colors"
                aria-label="Logout"
                title="Logout"
              >
                <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-4 h-4">
                  <path fillRule="evenodd" d="M3 4.25A2.25 2.25 0 015.25 2h5.5A2.25 2.25 0 0113 4.25v2a.75.75 0 01-1.5 0v-2a.75.75 0 00-.75-.75h-5.5a.75.75 0 00-.75.75v11.5c0 .414.336.75.75.75h5.5a.75.75 0 00.75-.75v-2a.75.75 0 011.5 0v2A2.25 2.25 0 0110.75 18h-5.5A2.25 2.25 0 013 15.75V4.25z" clipRule="evenodd" />
                  <path fillRule="evenodd" d="M6 10a.75.75 0 01.75-.75h9.546l-1.048-.943a.75.75 0 111.004-1.114l2.5 2.25a.75.75 0 010 1.114l-2.5 2.25a.75.75 0 11-1.004-1.114l1.048-.943H6.75A.75.75 0 016 10z" clipRule="evenodd" />
                </svg>
              </button>
            </div>
          ) : (
            <button
              onClick={login}
              className="flex items-center gap-1 text-[11px] text-stone-400 dark:text-stone-500 hover:text-stone-600 dark:hover:text-stone-300 transition-colors px-1.5 py-1 rounded-md hover:bg-stone-200 dark:hover:bg-stone-700"
              title="Login to edit"
            >
              <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 16" fill="currentColor" className="w-3 h-3">
                <path fillRule="evenodd" d="M8 1a3.5 3.5 0 1 1 0 7 3.5 3.5 0 0 1 0-7ZM4.5 4.5a3.5 3.5 0 1 0 7 0 3.5 3.5 0 0 0-7 0ZM2 13.5A3.5 3.5 0 0 1 5.5 10h5a3.5 3.5 0 0 1 3.5 3.5v.5a.5.5 0 0 1-.5.5h-11a.5.5 0 0 1-.5-.5v-.5Z" clipRule="evenodd" />
              </svg>
              <span className="hidden sm:inline">Login to edit</span>
            </button>
          )}
          <SaveIndicator saving={saving} />
          <DownloadPdfButton content={content ?? ""} padPath={padPath} />
          <CopyUrlButton />
          <ThemeToggle dark={dark} toggle={toggle} />
        </div>
      </header>
      {(uploadBlocked || uploadError || authMsg) && (
        <div className="px-12 py-2 text-xs border-b border-stone-200/60 dark:border-stone-700/60 bg-amber-50/70 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200">
          {authMsg ?? uploadError ?? uploadBlockReason}
          {uploadBlocked && !authMsg && !uploadError && (
            <span className="ml-2 opacity-80">
              ({imageCount}/{imageCountLimit} images,{" "}
              {Math.round(totalImageBytes / 1024 / 1024)}MB/
              {Math.round(totalImageBytesLimit / 1024 / 1024)}MB)
            </span>
          )}
        </div>
      )}
      <div className="flex-1 overflow-auto pb-28">
        {content !== null && (
          <PadCodeEditor
            value={content}
            onChange={setContent}
            dark={dark}
            padPath={padPath}
            readOnly={!isAuthenticated}
            uploadBlocked={uploadBlocked}
            uploadBlockReason={uploadBlockReason}
            onUploadLimitsUpdate={applyUploadLimits}
            onUploadError={onUploadError}
            onEditorReady={(view) => {
              editorViewRef.current = view;
            }}
          />
        )}
      </div>
      <FloatingDock editorView={editorViewRef.current} />
    </div>
    </>
  );
}

function AdminPage() {
  const [dark, toggle] = useDarkMode();
  const { isAuthenticated, isAdmin, username, login, logout, loading: authLoading } = useAuth();

  const [users, setUsers] = useState<{ id: number; username: string; role: string; approved: boolean }[]>([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(null);
  const [generatedUser, setGeneratedUser] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  const fetchUsers = useCallback(async () => {
    const res = await fetch(`${API}/api/admin/users`, {
      credentials: "include",
    });
    if (res.ok) setUsers(await res.json());
  }, []);

  useEffect(() => {
    if (isAuthenticated && isAdmin) fetchUsers();
  }, [isAuthenticated, isAdmin, fetchUsers]);

  const createUser = async () => {
    if (!newUsername) { setError("Preencha o nome de usuário"); return; }
    setLoading(true); setError(null);
    const res = await fetch(`${API}/api/admin/users`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify({ username: newUsername, role: "USER" }),
    });
    setLoading(false);
    if (!res.ok) {
      const data = await res.json().catch(() => ({}));
      setError(data.error ?? "Erro ao criar usuário");
      return;
    }
    const data = await res.json();
    setGeneratedUser(data.username);
    setGeneratedPassword(data.generatedPassword);
    setCopied(false);
    setNewUsername(""); setShowCreate(false);
    fetchUsers();
  };

  const approveUser = async (id: number) => {
    await fetch(`${API}/api/admin/users/${id}/approve`, {
      method: "PUT",
      credentials: "include",
    });
    fetchUsers();
  };

  const deleteUser = async (id: number) => {
    if (!confirm("Tem certeza que deseja remover este usuário?")) return;
    await fetch(`${API}/api/admin/users/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    fetchUsers();
  };

  const copyPassword = () => {
    if (generatedPassword) {
      navigator.clipboard.writeText(generatedPassword);
      setCopied(true);
    }
  };

  const pendingUsers = users.filter((u) => !u.approved);
  const approvedUsers = users.filter((u) => u.approved);

  return (
    <>
      {/* LoginModal is removed */}


      {generatedPassword && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={(e) => e.target === e.currentTarget && setGeneratedPassword(null)}
        >
          <div className="bg-white dark:bg-stone-800 rounded-xl shadow-xl p-6 w-full max-w-sm mx-4 flex flex-col gap-4">
            <h2 className="text-base font-semibold text-stone-800 dark:text-stone-100">
              Usuário criado
            </h2>
            <p className="text-sm text-stone-500 dark:text-stone-400">
              Envie a senha abaixo para <span className="font-medium text-stone-700 dark:text-stone-200">{generatedUser}</span>.
              Ela não será exibida novamente.
            </p>
            <div className="flex items-center gap-2">
              <code className="flex-1 bg-stone-100 dark:bg-stone-700 rounded-lg px-3 py-2 text-sm font-mono text-stone-800 dark:text-stone-100 select-all">
                {generatedPassword}
              </code>
              <button
                onClick={copyPassword}
                className="text-xs bg-stone-800 dark:bg-stone-100 text-stone-100 dark:text-stone-800 rounded-lg px-3 py-2 hover:opacity-80 transition-opacity whitespace-nowrap"
              >
                {copied ? "Copiado!" : "Copiar"}
              </button>
            </div>
            <button
              onClick={() => setGeneratedPassword(null)}
              className="w-full border border-stone-200 dark:border-stone-700 rounded-lg py-2 text-sm hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
            >
              Fechar
            </button>
          </div>
        </div>
      )}

      <div className="min-h-screen bg-stone-50 dark:bg-stone-900 text-stone-800 dark:text-stone-100">
        <header className="sticky top-0 z-10 bg-stone-50/80 dark:bg-stone-900/80 backdrop-blur-md px-8 py-4 flex items-center gap-4 border-b border-stone-200/60 dark:border-stone-700/60">
          <a href={import.meta.env.BASE_URL} className="no-underline hover:opacity-70 transition-opacity">
            <Logo className="text-sm" />
          </a>
          <span className="text-stone-400 dark:text-stone-500 text-sm">/admin</span>
          <div className="flex-1" />
          {isAuthenticated ? (
            <div className="flex items-center gap-3">
              <span className="text-sm text-stone-500">{username}</span>
              <button onClick={logout} className="text-xs text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 transition-colors">Logout</button>
            </div>
          ) : (
            <button onClick={login} className="text-sm text-stone-500 hover:text-stone-700 dark:hover:text-stone-300 transition-colors">Login</button>
          )}
          <ThemeToggle dark={dark} toggle={toggle} />
        </header>

        <main className="max-w-2xl mx-auto px-6 py-8">
          {!isAuthenticated ? (
            <div className="text-center text-stone-400 dark:text-stone-500 py-16">
              <p className="mb-4">Faça login para acessar o painel admin.</p>
              <button onClick={login} className="text-sm bg-stone-800 dark:bg-stone-100 text-stone-100 dark:text-stone-800 rounded-lg px-4 py-2 hover:opacity-80 transition-opacity">Login</button>
            </div>
          ) : !isAdmin ? (
            <div className="text-center text-stone-400 dark:text-stone-500 py-16">
              <p>Acesso restrito a administradores.</p>
            </div>
          ) : (
            <>
              {authLoading ? (
                <div className="flex justify-center py-16">
                  <svg className="w-6 h-6 animate-spin text-stone-400" viewBox="0 0 16 16" fill="none">
                    <circle cx="8" cy="8" r="6" stroke="currentColor" strokeWidth="2" opacity="0.3" />
                    <path d="M14 8a6 6 0 00-6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
                  </svg>
                </div>
              ) : (
                <>
                  <div className="flex items-center justify-between mb-6">
                    <h1 className="text-lg font-semibold">Usuários</h1>
                    <button
                      onClick={() => setShowCreate(!showCreate)}
                      className="text-sm bg-stone-800 dark:bg-stone-100 text-stone-100 dark:text-stone-800 rounded-lg px-3 py-1.5 hover:opacity-80 transition-opacity"
                    >
                      + Criar usuário
                    </button>
                  </div>

                  {showCreate && (
                    <div className="mb-6 p-4 border border-stone-200 dark:border-stone-700 rounded-xl flex flex-col gap-3">
                      <input
                        autoFocus
                        type="text"
                        placeholder="Usuário"
                        value={newUsername}
                        onChange={(e) => setNewUsername(e.target.value)}
                        onKeyDown={(e) => e.key === "Enter" && createUser()}
                        className="border border-stone-200 dark:border-stone-600 rounded-lg px-3 py-2 text-sm bg-transparent focus:outline-none focus:ring-2 focus:ring-stone-300 dark:focus:ring-stone-600 placeholder:text-stone-400"
                      />
                      <p className="text-xs text-stone-400">A senha será gerada automaticamente.</p>
                      {error && <p className="text-xs text-red-500">{error}</p>}
                      <div className="flex gap-2">
                        <button onClick={createUser} disabled={loading} className="flex-1 bg-stone-800 dark:bg-stone-100 text-stone-100 dark:text-stone-800 rounded-lg py-2 text-sm hover:opacity-80 transition-opacity disabled:opacity-50">
                          {loading ? "Criando..." : "Criar"}
                        </button>
                        <button onClick={() => { setShowCreate(false); setError(null); }} className="flex-1 border border-stone-200 dark:border-stone-700 rounded-lg py-2 text-sm hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors">
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}

                  {pendingUsers.length > 0 && (
                    <div className="mb-6">
                      <h2 className="text-sm font-medium text-stone-500 dark:text-stone-400 mb-3">Pendentes</h2>
                      <div className="divide-y divide-stone-100 dark:divide-stone-800 border border-amber-200 dark:border-amber-700/50 rounded-xl overflow-hidden">
                        {pendingUsers.map((u) => (
                          <div key={u.id} className="flex items-center px-4 py-3 bg-amber-50/50 dark:bg-amber-900/10">
                            <span className="flex-1 text-sm font-medium">{u.username}</span>
                            <span className="text-xs text-amber-600 dark:text-amber-400 mr-4">pendente</span>
                            <div className="flex gap-2">
                              <button
                                onClick={() => approveUser(u.id)}
                                className="text-xs text-green-600 hover:text-green-700 dark:text-green-400 dark:hover:text-green-300 transition-colors"
                              >
                                Aprovar
                              </button>
                              <button
                                onClick={() => deleteUser(u.id)}
                                className="text-xs text-red-400 hover:text-red-600 transition-colors"
                              >
                                Recusar
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  )}

                  <div className="divide-y divide-stone-100 dark:divide-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl overflow-hidden">
                    {approvedUsers.length === 0 && pendingUsers.length === 0 && (
                      <p className="text-sm text-stone-400 text-center py-8">Nenhum usuário cadastrado.</p>
                    )}
                    {approvedUsers.map((u) => (
                      <div key={u.id} className="flex items-center px-4 py-3 bg-white dark:bg-stone-800/50">
                        <span className="flex-1 text-sm font-medium">{u.username}</span>
                        <span className="flex items-center gap-1.5 w-24">
                          {u.role === "ADMIN" ? (
                            <span className="text-xs font-semibold px-2 py-0.5 rounded-full bg-purple-100 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400 border border-purple-200 dark:border-purple-800">
                              ADMIN
                            </span>
                          ) : (
                            <span className="text-xs text-stone-400 dark:text-stone-500 px-1">
                              USER
                            </span>
                          )}
                        </span>
                        <div className="flex items-center justify-end gap-3 w-32">
                          {u.username !== username && (
                            <button
                              onClick={() => deleteUser(u.id)}
                              className="text-xs font-medium text-red-500 hover:text-red-700 transition-colors"
                            >
                              Remover
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </>
          )}
        </main>
      </div>
    </>
  );
}

function App() {
  const base = import.meta.env.BASE_URL.replace(/\/+$/, "");
  const raw = window.location.pathname;
  const stripped = base && raw.startsWith(base) ? raw.slice(base.length) : raw;
  const padPath = stripped.replace(/^\/+/, "").toLowerCase();

  if (!padPath) return <Home />;
  if (padPath === "admin") return <AdminPage />;
  return <PadEditorPage padPath={padPath} />;
}

export default App;
