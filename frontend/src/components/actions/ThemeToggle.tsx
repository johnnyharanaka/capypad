import { MoonIcon, SunIcon } from "@/components/icons";

export default function ThemeToggle({
  dark,
  toggle,
}: {
  dark: boolean;
  toggle: () => void;
}) {
  return (
    <button
      onClick={toggle}
      className="p-1.5 rounded-md hover:bg-stone-200 dark:hover:bg-stone-700 transition-colors"
      aria-label="Toggle dark mode"
    >
      {dark ? (
        <SunIcon className="w-4 h-4" />
      ) : (
        <MoonIcon className="w-4 h-4" />
      )}
    </button>
  );
}
