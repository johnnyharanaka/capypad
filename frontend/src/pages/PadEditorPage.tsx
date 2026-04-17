import { useCallback, useEffect, useState } from "react";
import type { EditorView } from "@codemirror/view";
import { API } from "../api";
import PadCodeEditor from "../editor/PadEditor";
import CopyUrlButton from "../components/CopyUrlButton";
import DownloadPdfButton from "../components/DownloadPdfButton";
import FloatingDock from "../components/FloatingDock";
import Logo from "../components/Logo";
import SaveIndicator from "../components/SaveIndicator";
import ThemeToggle from "../components/ThemeToggle";
import { useAuth } from "../hooks/useAuth";
import { useDarkMode } from "../hooks/useDarkMode";

function useWordCount(content: string | null) {
  if (!content) return { words: 0, chars: 0 };
  const trimmed = content.trim();
  return {
    words: trimmed ? trimmed.split(/\s+/).length : 0,
    chars: content.length,
  };
}

export default function PadEditorPage({ padPath }: { padPath: string }) {
  const [content, setContent] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [imageCount, setImageCount] = useState(0);
  const [imageCountLimit, setImageCountLimit] = useState(20);
  const [totalImageBytes, setTotalImageBytes] = useState(0);
  const [totalImageBytesLimit, setTotalImageBytesLimit] = useState(
    50 * 1024 * 1024,
  );
  const [uploadBlocked, setUploadBlocked] = useState(false);
  const [uploadBlockReason, setUploadBlockReason] = useState<string | null>(
    null,
  );
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [dark, toggle] = useDarkMode();
  const { words, chars } = useWordCount(content);
  const [editorView, setEditorView] = useState<EditorView | null>(null);
  const { isAuthenticated, isAdmin, username, login, logout, loading } =
    useAuth();
  const [authMsg, setAuthMsg] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    const authStatus = params.get("auth");
    if (authStatus === "pending") {
      return "Conta criada! Aguarde aprovação do administrador.";
    }
    if (authStatus === "error") {
      return "Houve um erro na autenticação.";
    }
    return null;
  });

  useEffect(() => {
    if (!authMsg) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("auth")) {
      window.history.replaceState({}, "", window.location.pathname);
    }
    const t = setTimeout(() => setAuthMsg(null), 5000);
    return () => clearTimeout(t);
  }, [authMsg]);

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
  }, [content, padPath, isAuthenticated, logout, login]);

  return (
    <div className="h-screen flex flex-col bg-stone-50 dark:bg-stone-900 text-stone-800 dark:text-stone-100">
      <header className="sticky top-0 z-10 bg-stone-50/80 dark:bg-stone-900/80 backdrop-blur-md px-3 sm:px-6 md:px-12 py-2 sm:py-4 flex items-center gap-2 shrink-0">
        <a
          href={import.meta.env.BASE_URL}
          className="no-underline hover:opacity-70 transition-opacity text-sm shrink-0 min-w-0 flex items-baseline"
        >
          <Logo className="text-sm" />
          <span className="text-stone-400 dark:text-stone-500 font-normal text-sm ml-0.5 truncate max-w-[100px] sm:max-w-[200px] md:max-w-none inline-block align-baseline">
            /{padPath}
          </span>
        </a>
        <div className="flex-1 min-w-0" />
        <div className="flex items-center gap-1 sm:gap-1.5 shrink-0">
          <span className="text-[11px] text-stone-400 dark:text-stone-500 tabular-nums mr-1 hidden sm:inline">
            {words} words · {chars} chars
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
                <svg
                  xmlns="http://www.w3.org/2000/svg"
                  viewBox="0 0 20 20"
                  fill="currentColor"
                  className="w-4 h-4"
                >
                  <path
                    fillRule="evenodd"
                    d="M3 4.25A2.25 2.25 0 015.25 2h5.5A2.25 2.25 0 0113 4.25v2a.75.75 0 01-1.5 0v-2a.75.75 0 00-.75-.75h-5.5a.75.75 0 00-.75.75v11.5c0 .414.336.75.75.75h5.5a.75.75 0 00.75-.75v-2a.75.75 0 011.5 0v2A2.25 2.25 0 0110.75 18h-5.5A2.25 2.25 0 013 15.75V4.25z"
                    clipRule="evenodd"
                  />
                  <path
                    fillRule="evenodd"
                    d="M6 10a.75.75 0 01.75-.75h9.546l-1.048-.943a.75.75 0 111.004-1.114l2.5 2.25a.75.75 0 010 1.114l-2.5 2.25a.75.75 0 11-1.004-1.114l1.048-.943H6.75A.75.75 0 016 10z"
                    clipRule="evenodd"
                  />
                </svg>
              </button>
            </div>
          ) : (
            <button
              onClick={login}
              className="flex items-center gap-1 text-[11px] text-stone-400 dark:text-stone-500 hover:text-stone-600 dark:hover:text-stone-300 transition-colors px-1.5 py-1 rounded-md hover:bg-stone-200 dark:hover:bg-stone-700"
              title="Login to edit"
            >
              <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 20 20"
                fill="currentColor"
                className="w-4 h-4"
              >
                <path
                  fillRule="evenodd"
                  d="M17 4.25A2.25 2.25 0 0014.75 2h-5.5A2.25 2.25 0 007 4.25v2a.75.75 0 001.5 0v-2a.75.75 0 01.75-.75h5.5a.75.75 0 01.75.75v11.5a.75.75 0 01-.75.75h-5.5a.75.75 0 01-.75-.75v-2a.75.75 0 00-1.5 0v2A2.25 2.25 0 009.25 18h5.5A2.25 2.25 0 0017 15.75V4.25z"
                  clipRule="evenodd"
                />
                <path
                  fillRule="evenodd"
                  d="M1 10a.75.75 0 01.75-.75h9.546l-1.048-.943a.75.75 0 111.004-1.114l2.5 2.25a.75.75 0 010 1.114l-2.5 2.25a.75.75 0 11-1.004-1.114l1.048-.943H1.75A.75.75 0 011 10z"
                  clipRule="evenodd"
                />
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
      {!loading && !isAuthenticated && !authMsg && (
        <div className="px-3 sm:px-6 md:px-12 py-2 text-xs border-b border-stone-200/60 dark:border-stone-700/60 bg-sky-50/70 dark:bg-sky-900/20 text-sky-800 dark:text-sky-200 flex items-center gap-2">
          <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 20 20"
            fill="currentColor"
            className="w-3.5 h-3.5 shrink-0"
          >
            <path
              fillRule="evenodd"
              d="M10 1a4.5 4.5 0 00-4.5 4.5V9H5a2 2 0 00-2 2v6a2 2 0 002 2h10a2 2 0 002-2v-6a2 2 0 00-2-2h-.5V5.5A4.5 4.5 0 0010 1zm3 8V5.5a3 3 0 10-6 0V9h6z"
              clipRule="evenodd"
            />
          </svg>
          <span>
            Modo leitura.{" "}
            <button
              onClick={login}
              className="underline underline-offset-2 hover:text-sky-600 dark:hover:text-sky-100 transition-colors font-medium"
            >
              Faça login
            </button>{" "}
            para editar este pad.
          </span>
        </div>
      )}
      {(uploadBlocked || uploadError || authMsg) && (
        <div className="px-3 sm:px-6 md:px-12 py-2 text-xs border-b border-stone-200/60 dark:border-stone-700/60 bg-amber-50/70 dark:bg-amber-900/20 text-amber-800 dark:text-amber-200">
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
            onEditorReady={setEditorView}
          />
        )}
      </div>
      <FloatingDock editorView={editorView} />
    </div>
  );
}
