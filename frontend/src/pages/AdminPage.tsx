import { useCallback, useEffect, useState } from "react";
import { API } from "../api";
import Logo from "../components/Logo";
import ThemeToggle from "../components/ThemeToggle";
import { useAuth } from "../hooks/useAuth";
import { useDarkMode } from "../hooks/useDarkMode";

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

  const [users, setUsers] = useState<
    { id: number; username: string; role: string; approved: boolean }[]
  >([]);
  const [showCreate, setShowCreate] = useState(false);
  const [newUsername, setNewUsername] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [authMsg, setAuthMsg] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const authStatus = params.get("auth");
    if (authStatus === "pending") {
      setAuthMsg("Conta criada! Aguarde aprovação do administrador.");
    } else if (authStatus === "error") {
      const msg = params.get("message");
      setAuthMsg(
        msg ? `Erro na autenticação: ${msg}` : "Houve um erro na autenticação.",
      );
    }
    if (authStatus) {
      window.history.replaceState({}, "", window.location.pathname);
      setTimeout(() => setAuthMsg(null), 8000);
    }
  }, []);
  const [loading, setLoading] = useState(false);
  const [generatedPassword, setGeneratedPassword] = useState<string | null>(
    null,
  );
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
          ) : (
            <>
              {authLoading ? (
                <div className="flex justify-center py-16">
                  <svg
                    className="w-6 h-6 animate-spin text-stone-400"
                    viewBox="0 0 16 16"
                    fill="none"
                  >
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

                  {pendingUsers.length > 0 && (
                    <div className="mb-6">
                      <h2 className="text-sm font-medium text-stone-500 dark:text-stone-400 mb-3">
                        Pendentes
                      </h2>
                      <div className="divide-y divide-stone-100 dark:divide-stone-800 border border-amber-200 dark:border-amber-700/50 rounded-xl overflow-hidden">
                        {pendingUsers.map((u) => (
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
                    {approvedUsers.length === 0 &&
                      pendingUsers.length === 0 && (
                        <p className="text-sm text-stone-400 text-center py-8">
                          Nenhum usuário cadastrado.
                        </p>
                      )}
                    {approvedUsers.map((u) => (
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
