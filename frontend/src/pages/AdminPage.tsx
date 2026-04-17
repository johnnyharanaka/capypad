import { useCallback, useEffect, useRef, useState } from "react";
import { API } from "@/api";
import ThemeToggle from "@/components/actions/ThemeToggle";
import { SpinnerIcon } from "@/components/icons";
import Logo from "@/components/layout/Logo";
import { useAuth } from "@/hooks/useAuth";
import { useDarkMode } from "@/hooks/useDarkMode";

type Tab = "users" | "pads" | "settings";
type SiteSettings = {
  maintenanceMode: boolean;
  blockFiles: boolean;
  cleanupMaxAgeDays: number;
};
type UserItem = {
  id: number;
  username: string;
  role: string;
  approved: boolean;
};
type PadItem = {
  id: number;
  path: string;
  contentLength: number;
  imageCount: number;
  updatedAt: string;
};
type PageData<T> = {
  items: T[];
  total: number;
  page: number;
  totalPages: number;
};

const PAGE_SIZE = 20;

function Pagination({
  page,
  totalPages,
  onPage,
}: {
  page: number;
  totalPages: number;
  onPage: (p: number) => void;
}) {
  if (totalPages <= 1) return null;
  return (
    <div className="flex items-center justify-center gap-3 mt-4">
      <button
        onClick={() => onPage(page - 1)}
        disabled={page === 0}
        className="text-sm px-3 py-1.5 rounded-lg border border-stone-200 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
      >
        Anterior
      </button>
      <span className="text-xs text-stone-400 dark:text-stone-500">
        {page + 1} / {totalPages}
      </span>
      <button
        onClick={() => onPage(page + 1)}
        disabled={page >= totalPages - 1}
        className="text-sm px-3 py-1.5 rounded-lg border border-stone-200 dark:border-stone-700 hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors disabled:opacity-30 disabled:cursor-not-allowed"
      >
        Próxima
      </button>
    </div>
  );
}

export default function AdminPage() {
  const [dark, toggle] = useDarkMode();
  const {
    isAuthenticated,
    isAdmin,
    username,
    login,
    logout,
    loading: authLoading,
  } = useAuth();

  const [tab, setTab] = useState<Tab>("users");

  // ── Users state ──
  const [pendingData, setPendingData] = useState<PageData<UserItem>>({
    items: [],
    total: 0,
    page: 0,
    totalPages: 1,
  });
  const [approvedData, setApprovedData] = useState<PageData<UserItem>>({
    items: [],
    total: 0,
    page: 0,
    totalPages: 1,
  });
  const [showCreate, setShowCreate] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(
    null,
  );
  const [generatedUser, setGeneratedUser] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  // ── Pads state ──
  const [padsData, setPadsData] = useState<PageData<PadItem>>({
    items: [],
    total: 0,
    page: 0,
    totalPages: 1,
  });
  const [padSearch, setPadSearch] = useState("");
  const searchTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  // ── Settings state ──
  const [settings, setSettings] = useState<SiteSettings>({
    maintenanceMode: false,
    blockFiles: false,
    cleanupMaxAgeDays: 30,
  });
  const [settingsLoading, setSettingsLoading] = useState(false);
  const [settingsSaved, setSettingsSaved] = useState(false);
  const [settingsDaysInput, setSettingsDaysInput] = useState("30");
  const [confirmToggle, setConfirmToggle] = useState<{
    field: "maintenanceMode" | "blockFiles";
    label: string;
  } | null>(null);
  const [cleanupLoading, setCleanupLoading] = useState(false);
  const [cleanupResult, setCleanupResult] = useState<{
    deletedFiles: number;
    freedBytes: number;
  } | null>(null);

  // ── Auth message ──
  const [authMsg, setAuthMsg] = useState<string | null>(() => {
    const params = new URLSearchParams(window.location.search);
    const authStatus = params.get("auth");
    if (authStatus === "pending")
      return "Conta criada! Aguarde aprovação do administrador.";
    if (authStatus === "error") {
      const msg = params.get("message");
      return msg
        ? `Erro na autenticação: ${msg}`
        : "Houve um erro na autenticação.";
    }
    return null;
  });

  useEffect(() => {
    if (!authMsg) return;
    const params = new URLSearchParams(window.location.search);
    if (params.get("auth"))
      window.history.replaceState({}, "", window.location.pathname);
    const t = setTimeout(() => setAuthMsg(null), 8000);
    return () => clearTimeout(t);
  }, [authMsg]);

  // ── Fetch helpers ──
  const fetchPending = useCallback(async (page = 0, signal?: AbortSignal) => {
    const res = await fetch(
      `${API}/api/admin/users?approved=false&page=${page}&size=${PAGE_SIZE}`,
      { credentials: "include", signal },
    );
    if (res.ok) setPendingData(await res.json());
  }, []);

  const fetchApproved = useCallback(async (page = 0, signal?: AbortSignal) => {
    const res = await fetch(
      `${API}/api/admin/users?approved=true&page=${page}&size=${PAGE_SIZE}`,
      { credentials: "include", signal },
    );
    if (res.ok) setApprovedData(await res.json());
  }, []);

  const saveSettings = async (updated: SiteSettings) => {
    setSettingsLoading(true);
    const res = await fetch(`${API}/api/admin/settings`, {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      credentials: "include",
      body: JSON.stringify(updated),
    });
    setSettingsLoading(false);
    if (res.ok) {
      const data: SiteSettings = await res.json();
      setSettings(data);
      setSettingsDaysInput(String(data.cleanupMaxAgeDays));
      setSettingsSaved(true);
      setTimeout(() => setSettingsSaved(false), 2000);
    }
  };

  const fetchPads = useCallback(
    async (page = 0, search = padSearch, signal?: AbortSignal) => {
      const q = search.trim();
      const url = `${API}/api/admin/pads?page=${page}&size=${PAGE_SIZE}${q ? `&search=${encodeURIComponent(q)}` : ""}`;
      const res = await fetch(url, { credentials: "include", signal });
      if (res.ok) setPadsData(await res.json());
    },
    [padSearch],
  );

  // ── Initial load ──
  useEffect(() => {
    if (!isAuthenticated || !isAdmin) return;
    const controller = new AbortController();
    const signal = controller.signal;
    (async () => {
      const [pendingRes, approvedRes, padsRes, settingsRes] = await Promise.all(
        [
          fetch(
            `${API}/api/admin/users?approved=false&page=0&size=${PAGE_SIZE}`,
            {
              credentials: "include",
              signal,
            },
          ),
          fetch(
            `${API}/api/admin/users?approved=true&page=0&size=${PAGE_SIZE}`,
            {
              credentials: "include",
              signal,
            },
          ),
          fetch(`${API}/api/admin/pads?page=0&size=${PAGE_SIZE}`, {
            credentials: "include",
            signal,
          }),
          fetch(`${API}/api/admin/settings`, {
            credentials: "include",
            signal,
          }),
        ],
      );
      if (signal.aborted) return;
      if (pendingRes.ok) setPendingData(await pendingRes.json());
      if (approvedRes.ok) setApprovedData(await approvedRes.json());
      if (padsRes.ok) setPadsData(await padsRes.json());
      if (settingsRes.ok) {
        const s: SiteSettings = await settingsRes.json();
        setSettings(s);
        setSettingsDaysInput(String(s.cleanupMaxAgeDays));
      }
    })().catch(() => {});
    return () => controller.abort();
  }, [isAuthenticated, isAdmin]);

  // ── Pad search debounce ──
  const handlePadSearch = (value: string) => {
    setPadSearch(value);
    clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => {
      fetchPads(0, value);
    }, 300);
  };

  // ── User actions ──
  const createUser = async () => {
    if (!newUsername) {
      setError("Preencha o nome de usuário");
      return;
    }
    setLoading(true);
    setError(null);
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
    setNewUsername("");
    setShowCreate(false);
    fetchApproved(approvedData.page);
  };

  const approveUser = async (id: number) => {
    await fetch(`${API}/api/admin/users/${id}/approve`, {
      method: "PUT",
      credentials: "include",
    });
    fetchPending(pendingData.page);
    fetchApproved(approvedData.page);
  };

  const deleteUser = async (id: number, approved: boolean) => {
    if (!confirm("Tem certeza que deseja remover este usuário?")) return;
    await fetch(`${API}/api/admin/users/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    if (approved) fetchApproved(approvedData.page);
    else fetchPending(pendingData.page);
  };

  const copyPassword = () => {
    if (generatedPassword) {
      navigator.clipboard.writeText(generatedPassword);
      setCopied(true);
    }
  };

  // ── Pad actions ──
  const deletePad = async (id: number, path: string) => {
    if (
      !confirm(
        `Tem certeza que deseja remover o pad "/${path}" e todas as suas imagens?`,
      )
    )
      return;
    await fetch(`${API}/api/admin/pads/${id}`, {
      method: "DELETE",
      credentials: "include",
    });
    fetchPads(padsData.page, padSearch);
  };

  // ── Cleanup orphan files ──
  const cleanupOrphanFiles = async () => {
    if (!confirm("Isso vai apagar arquivos de imagem no disco que não estão mais referenciados no banco. Continuar?")) return;
    setCleanupLoading(true);
    setCleanupResult(null);
    try {
      const res = await fetch(`${API}/api/admin/cleanup-orphan-files`, {
        method: "POST",
        credentials: "include",
      });
      if (res.ok) {
        setCleanupResult(await res.json());
      }
    } finally {
      setCleanupLoading(false);
    }
  };

  // ── Formatters ──
  const formatSize = (chars: number) => {
    if (chars < 1000) return `${chars} chars`;
    if (chars < 1_000_000) return `${(chars / 1000).toFixed(1)}k chars`;
    return `${(chars / 1_000_000).toFixed(1)}M chars`;
  };

  const formatBytes = (bytes: number) => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  const formatDate = (iso: string) => {
    const d = new Date(iso);
    return d.toLocaleDateString("pt-BR", {
      day: "2-digit",
      month: "2-digit",
      year: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  // ── Tab styling ──
  const tabClass = (t: Tab) =>
    `px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
      tab === t
        ? "bg-stone-800 dark:bg-stone-100 text-stone-100 dark:text-stone-800"
        : "text-stone-500 hover:text-stone-700 dark:hover:text-stone-300 hover:bg-stone-100 dark:hover:bg-stone-800"
    }`;

  return (
    <>
      {confirmToggle && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={(e) =>
            e.target === e.currentTarget && setConfirmToggle(null)
          }
        >
          <div className="bg-white dark:bg-stone-800 rounded-xl shadow-xl p-6 w-full max-w-sm mx-4 flex flex-col gap-4">
            <h2 className="text-base font-semibold text-stone-800 dark:text-stone-100">
              Desativar {confirmToggle.label}?
            </h2>
            <p className="text-sm text-stone-500 dark:text-stone-400">
              Tem certeza que deseja desativar{" "}
              <span className="font-medium text-stone-700 dark:text-stone-200">
                {confirmToggle.label}
              </span>
              ? A alteração terá efeito imediato.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => {
                  const updated = { ...settings, [confirmToggle.field]: false };
                  setSettings(updated);
                  saveSettings(updated);
                  setConfirmToggle(null);
                }}
                className="flex-1 bg-red-600 text-white rounded-lg py-2 text-sm hover:bg-red-700 transition-colors"
              >
                Desativar
              </button>
              <button
                onClick={() => setConfirmToggle(null)}
                className="flex-1 bg-white dark:bg-stone-700 border border-stone-200 dark:border-stone-600 rounded-lg py-2 text-sm text-stone-700 dark:text-stone-200 hover:bg-stone-50 dark:hover:bg-stone-600 transition-colors"
              >
                Cancelar
              </button>
            </div>
          </div>
        </div>
      )}

      {generatedPassword && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 backdrop-blur-sm"
          onClick={(e) =>
            e.target === e.currentTarget && setGeneratedPassword(null)
          }
        >
          <div className="bg-white dark:bg-stone-800 rounded-xl shadow-xl p-6 w-full max-w-sm mx-4 flex flex-col gap-4">
            <h2 className="text-base font-semibold text-stone-800 dark:text-stone-100">
              Usuário criado
            </h2>
            <p className="text-sm text-stone-500 dark:text-stone-400">
              Envie a senha abaixo para{" "}
              <span className="font-medium text-stone-700 dark:text-stone-200">
                {generatedUser}
              </span>
              . Ela não será exibida novamente.
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
          <a
            href={import.meta.env.BASE_URL}
            className="no-underline hover:opacity-70 transition-opacity"
          >
            <Logo className="text-sm" />
          </a>
          <span className="text-stone-400 dark:text-stone-500 text-sm">
            /admin
          </span>
          <div className="flex-1" />
          {isAuthenticated ? (
            <div className="flex items-center gap-3">
              <span className="text-sm text-stone-500">{username}</span>
              <button
                onClick={logout}
                className="text-xs text-stone-400 hover:text-stone-600 dark:hover:text-stone-300 transition-colors"
              >
                Logout
              </button>
            </div>
          ) : (
            <button
              onClick={login}
              className="text-sm text-stone-500 hover:text-stone-700 dark:hover:text-stone-300 transition-colors"
            >
              Login
            </button>
          )}
          <ThemeToggle dark={dark} toggle={toggle} />
        </header>

        <main className="max-w-2xl mx-auto px-6 py-8">
          {authMsg && (
            <div className="mb-4 px-4 py-3 rounded-lg bg-amber-100 dark:bg-amber-900/30 text-amber-800 dark:text-amber-200 text-sm text-center">
              {authMsg}
            </div>
          )}
          {!isAuthenticated ? (
            <div className="text-center text-stone-400 dark:text-stone-500 py-16">
              <p className="mb-4">Faça login para acessar o painel admin.</p>
              <button
                onClick={login}
                className="text-sm bg-stone-800 dark:bg-stone-100 text-stone-100 dark:text-stone-800 rounded-lg px-4 py-2 hover:opacity-80 transition-opacity"
              >
                Login
              </button>
            </div>
          ) : !isAdmin ? (
            <div className="text-center text-stone-400 dark:text-stone-500 py-16">
              <p>Acesso restrito a administradores.</p>
            </div>
          ) : authLoading ? (
            <div className="flex justify-center py-16">
              <SpinnerIcon className="w-6 h-6 animate-spin text-stone-400" />
            </div>
          ) : (
            <>
              {/* Tabs */}
              <div className="flex gap-2 mb-6">
                <button
                  className={tabClass("users")}
                  onClick={() => setTab("users")}
                >
                  Usuários
                  {pendingData.total > 0 && (
                    <span className="ml-2 inline-flex items-center justify-center w-5 h-5 text-[10px] font-bold rounded-full bg-amber-500 text-white">
                      {pendingData.total}
                    </span>
                  )}
                </button>
                <button
                  className={tabClass("pads")}
                  onClick={() => setTab("pads")}
                >
                  Pads
                </button>
                <button
                  className={tabClass("settings")}
                  onClick={() => setTab("settings")}
                >
                  Settings
                </button>
              </div>

              {/* ════════ Users Tab ════════ */}
              {tab === "users" && (
                <>
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-lg font-semibold">Usuários</h2>
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
                      <p className="text-xs text-stone-400">
                        A senha será gerada automaticamente.
                      </p>
                      {error && <p className="text-xs text-red-500">{error}</p>}
                      <div className="flex gap-2">
                        <button
                          onClick={createUser}
                          disabled={loading}
                          className="flex-1 bg-stone-800 dark:bg-stone-100 text-stone-100 dark:text-stone-800 rounded-lg py-2 text-sm hover:opacity-80 transition-opacity disabled:opacity-50"
                        >
                          {loading ? "Criando..." : "Criar"}
                        </button>
                        <button
                          onClick={() => {
                            setShowCreate(false);
                            setError(null);
                          }}
                          className="flex-1 border border-stone-200 dark:border-stone-700 rounded-lg py-2 text-sm hover:bg-stone-100 dark:hover:bg-stone-800 transition-colors"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Pending users */}
                  {pendingData.total > 0 && (
                    <div className="mb-6">
                      <div className="flex items-center justify-between mb-3">
                        <h3 className="text-sm font-medium text-stone-500 dark:text-stone-400">
                          Pendentes ({pendingData.total})
                        </h3>
                      </div>
                      <div className="divide-y divide-stone-100 dark:divide-stone-800 border border-amber-200 dark:border-amber-700/50 rounded-xl overflow-hidden">
                        {pendingData.items.map((u) => (
                          <div
                            key={u.id}
                            className="flex items-center px-4 py-3 bg-amber-50/50 dark:bg-amber-900/10"
                          >
                            <span className="flex-1 text-sm font-medium">
                              {u.username}
                            </span>
                            <span className="text-xs text-amber-600 dark:text-amber-400 mr-4">
                              pendente
                            </span>
                            <div className="flex gap-2">
                              <button
                                onClick={() => approveUser(u.id)}
                                className="text-xs text-green-600 hover:text-green-700 dark:text-green-400 dark:hover:text-green-300 transition-colors"
                              >
                                Aprovar
                              </button>
                              <button
                                onClick={() => deleteUser(u.id, false)}
                                className="text-xs text-red-400 hover:text-red-600 transition-colors"
                              >
                                Recusar
                              </button>
                            </div>
                          </div>
                        ))}
                      </div>
                      <Pagination
                        page={pendingData.page}
                        totalPages={pendingData.totalPages}
                        onPage={(p) => fetchPending(p)}
                      />
                    </div>
                  )}

                  {/* Approved users */}
                  <div className="mb-3">
                    <h3 className="text-sm font-medium text-stone-500 dark:text-stone-400">
                      Aprovados ({approvedData.total})
                    </h3>
                  </div>
                  <div className="divide-y divide-stone-100 dark:divide-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl overflow-hidden">
                    {approvedData.items.length === 0 ? (
                      <p className="text-sm text-stone-400 text-center py-8">
                        Nenhum usuário aprovado.
                      </p>
                    ) : (
                      approvedData.items.map((u) => (
                        <div
                          key={u.id}
                          className="flex items-center px-4 py-3 bg-white dark:bg-stone-800/50"
                        >
                          <span className="flex-1 text-sm font-medium">
                            {u.username}
                          </span>
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
                                onClick={() => deleteUser(u.id, true)}
                                className="text-xs font-medium text-red-500 hover:text-red-700 transition-colors"
                              >
                                Remover
                              </button>
                            )}
                          </div>
                        </div>
                      ))
                    )}
                  </div>
                  <Pagination
                    page={approvedData.page}
                    totalPages={approvedData.totalPages}
                    onPage={(p) => fetchApproved(p)}
                  />
                </>
              )}

              {/* ════════ Settings Tab ════════ */}
              {tab === "settings" && (
                <>
                  <div className="flex items-center justify-between mb-6">
                    <h2 className="text-lg font-semibold">Settings</h2>
                    {settingsSaved && (
                      <span className="text-sm text-green-600 dark:text-green-400">
                        Salvo!
                      </span>
                    )}
                  </div>

                  <div className="flex flex-col gap-4">
                    {/* Maintenance Mode */}
                    <div className="flex items-center justify-between p-4 border border-stone-200 dark:border-stone-700 rounded-xl bg-white dark:bg-stone-800/50">
                      <div className="flex flex-col gap-1">
                        <span className="text-sm font-medium">
                          Modo de manutenção
                        </span>
                        <span className="text-xs text-stone-400 dark:text-stone-500">
                          Quando ativo, bloqueia edição de pads e upload de
                          arquivos.
                        </span>
                      </div>
                      <button
                        onClick={() => {
                          if (settings.maintenanceMode) {
                            setConfirmToggle({
                              field: "maintenanceMode",
                              label: "modo de manutenção",
                            });
                          } else {
                            const updated = {
                              ...settings,
                              maintenanceMode: true,
                            };
                            setSettings(updated);
                            saveSettings(updated);
                          }
                        }}
                        disabled={settingsLoading}
                        className={`relative w-11 h-6 rounded-full transition-colors ${settings.maintenanceMode ? "bg-amber-500" : "bg-stone-300 dark:bg-stone-600"}`}
                      >
                        <span
                          className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${settings.maintenanceMode ? "translate-x-5" : ""}`}
                        />
                      </button>
                    </div>

                    {/* Block Files */}
                    <div className="flex items-center justify-between p-4 border border-stone-200 dark:border-stone-700 rounded-xl bg-white dark:bg-stone-800/50">
                      <div className="flex flex-col gap-1">
                        <span className="text-sm font-medium">
                          Bloquear arquivos
                        </span>
                        <span className="text-xs text-stone-400 dark:text-stone-500">
                          Impede upload de arquivos nos pads.
                        </span>
                      </div>
                      <button
                        onClick={() => {
                          if (settings.blockFiles) {
                            setConfirmToggle({
                              field: "blockFiles",
                              label: "bloqueio de arquivos",
                            });
                          } else {
                            const updated = { ...settings, blockFiles: true };
                            setSettings(updated);
                            saveSettings(updated);
                          }
                        }}
                        disabled={settingsLoading}
                        className={`relative w-11 h-6 rounded-full transition-colors ${settings.blockFiles ? "bg-amber-500" : "bg-stone-300 dark:bg-stone-600"}`}
                      >
                        <span
                          className={`absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow transition-transform ${settings.blockFiles ? "translate-x-5" : ""}`}
                        />
                      </button>
                    </div>

                    {/* Cleanup Max Age Days */}
                    <div className="flex items-center justify-between p-4 border border-stone-200 dark:border-stone-700 rounded-xl bg-white dark:bg-stone-800/50">
                      <div className="flex flex-col gap-1">
                        <span className="text-sm font-medium">
                          Dias para apagar pads inativos
                        </span>
                        <span className="text-xs text-stone-400 dark:text-stone-500">
                          Pads sem edição serão removidos após esse período.
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min={1}
                          value={settingsDaysInput}
                          onChange={(e) => setSettingsDaysInput(e.target.value)}
                          onBlur={() => {
                            const days = Math.max(
                              1,
                              parseInt(settingsDaysInput) || 30,
                            );
                            setSettingsDaysInput(String(days));
                            if (days !== settings.cleanupMaxAgeDays) {
                              const updated = {
                                ...settings,
                                cleanupMaxAgeDays: days,
                              };
                              setSettings(updated);
                              saveSettings(updated);
                            }
                          }}
                          onKeyDown={(e) => {
                            if (e.key === "Enter")
                              (e.target as HTMLInputElement).blur();
                          }}
                          className="w-24 border border-stone-200 dark:border-stone-600 rounded-lg pl-3 pr-1 py-1.5 text-sm bg-white dark:bg-stone-700 text-stone-800 dark:text-stone-100 text-right focus:outline-none focus:ring-2 focus:ring-stone-300 dark:focus:ring-stone-600 [&::-webkit-inner-spin-button]:ml-2 [&::-webkit-inner-spin-button]:opacity-100"
                        />
                        <span className="text-xs text-stone-400 dark:text-stone-500">
                          dias
                        </span>
                      </div>
                    </div>

                    {/* Cleanup Orphan Files */}
                    <div className="flex items-center justify-between p-4 border border-stone-200 dark:border-stone-700 rounded-xl bg-white dark:bg-stone-800/50">
                      <div className="flex flex-col gap-1">
                        <span className="text-sm font-medium">
                          Limpar arquivos órfãos
                        </span>
                        <span className="text-xs text-stone-400 dark:text-stone-500">
                          Remove imagens no disco sem referência no banco de dados.
                        </span>
                        {cleanupResult && (
                          <span className="text-xs text-green-600 dark:text-green-400 mt-1">
                            {cleanupResult.deletedFiles === 0
                              ? "Nenhum arquivo órfão encontrado."
                              : `${cleanupResult.deletedFiles} ${cleanupResult.deletedFiles === 1 ? "arquivo removido" : "arquivos removidos"} (${formatBytes(cleanupResult.freedBytes)} liberados)`}
                          </span>
                        )}
                      </div>
                      <button
                        onClick={cleanupOrphanFiles}
                        disabled={cleanupLoading}
                        className="text-sm bg-red-600 text-white rounded-lg px-4 py-2 hover:bg-red-700 transition-colors disabled:opacity-50 whitespace-nowrap"
                      >
                        {cleanupLoading ? "Limpando..." : "Limpar"}
                      </button>
                    </div>
                  </div>
                </>
              )}

              {/* ════════ Pads Tab ════════ */}
              {tab === "pads" && (
                <>
                  <div className="flex items-center justify-between mb-4">
                    <h2 className="text-lg font-semibold">Pads</h2>
                    <span className="text-sm text-stone-400 dark:text-stone-500">
                      {padsData.total} {padsData.total === 1 ? "pad" : "pads"}{" "}
                      com conteúdo
                    </span>
                  </div>

                  <input
                    type="text"
                    placeholder="Pesquisar por nome do pad..."
                    value={padSearch}
                    onChange={(e) => handlePadSearch(e.target.value)}
                    className="w-full mb-4 border border-stone-200 dark:border-stone-600 rounded-lg px-3 py-2 text-sm bg-transparent focus:outline-none focus:ring-2 focus:ring-stone-300 dark:focus:ring-stone-600 placeholder:text-stone-400"
                  />

                  <div className="divide-y divide-stone-100 dark:divide-stone-800 border border-stone-200 dark:border-stone-700 rounded-xl overflow-hidden">
                    {padsData.items.length === 0 ? (
                      <p className="text-sm text-stone-400 text-center py-8">
                        {padSearch.trim()
                          ? "Nenhum pad encontrado."
                          : "Nenhum pad com conteúdo."}
                      </p>
                    ) : (
                      padsData.items.map((p) => (
                        <div
                          key={p.id}
                          className="flex items-center px-4 py-3 bg-white dark:bg-stone-800/50 gap-3"
                        >
                          <a
                            href={`${import.meta.env.BASE_URL}${p.path}`}
                            className="flex-1 text-sm font-medium text-stone-700 dark:text-stone-200 hover:text-stone-900 dark:hover:text-white transition-colors truncate"
                          >
                            /{p.path}
                          </a>
                          <span className="text-xs text-stone-400 dark:text-stone-500 whitespace-nowrap">
                            {formatSize(p.contentLength)}
                          </span>
                          {p.imageCount > 0 && (
                            <span className="text-xs text-stone-400 dark:text-stone-500 whitespace-nowrap">
                              {p.imageCount}{" "}
                              {p.imageCount === 1 ? "img" : "imgs"}
                            </span>
                          )}
                          <span className="text-xs text-stone-400 dark:text-stone-500 whitespace-nowrap">
                            {formatDate(p.updatedAt)}
                          </span>
                          <button
                            onClick={() => deletePad(p.id, p.path)}
                            className="text-xs font-medium text-red-500 hover:text-red-700 transition-colors whitespace-nowrap"
                          >
                            Remover
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                  <Pagination
                    page={padsData.page}
                    totalPages={padsData.totalPages}
                    onPage={(p) => fetchPads(p, padSearch)}
                  />
                </>
              )}
            </>
          )}
        </main>
      </div>
    </>
  );
}
