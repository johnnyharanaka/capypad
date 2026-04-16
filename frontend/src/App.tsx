import AdminPage from "./pages/AdminPage";
import Home from "./pages/Home";
import PadEditorPage from "./pages/PadEditorPage";

export default function App() {
  const base = import.meta.env.BASE_URL.replace(/\/+$/, "");
  const raw = window.location.pathname;
  const stripped = base && raw.startsWith(base) ? raw.slice(base.length) : raw;
  const padPath = stripped.replace(/^\/+/, "").toLowerCase();

  if (!padPath) return <Home />;
  if (padPath === "admin") return <AdminPage />;
  return <PadEditorPage padPath={padPath} />;
}
