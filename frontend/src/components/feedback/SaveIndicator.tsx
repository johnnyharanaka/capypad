import { useEffect, useState } from "react";
import { CheckIcon, SpinnerIcon, CloudCheckIcon } from "@/components/icons";

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
        <SpinnerIcon className="w-3 h-3 animate-spin" />
      </div>
    );
  }

  if (showCheck) {
    return (
      <CheckIcon className="w-4 h-4 text-green-500 transition-opacity duration-300" />
    );
  }

  return (
    <CloudCheckIcon className="w-4 h-4 text-stone-300 dark:text-stone-600" />
  );
}
