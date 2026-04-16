import { useEffect, useState } from "react";

export default function SaveIndicator({ saving }: { saving: boolean }) {
  const [prevSaving, setPrevSaving] = useState(saving);
  const [showCheck, setShowCheck] = useState(false);

  if (prevSaving !== saving) {
    setPrevSaving(saving);
    if (prevSaving && !saving) setShowCheck(true);
    if (saving) setShowCheck(false);
  }

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
