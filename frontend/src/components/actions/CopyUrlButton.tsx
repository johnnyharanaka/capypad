import { useCallback, useState } from "react";
import { CheckIcon, LinkIcon } from "@/components/icons";

export default function CopyUrlButton() {
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
        <CheckIcon className="w-4 h-4 text-green-500" />
      ) : (
        <LinkIcon className="w-4 h-4" />
      )}
    </button>
  );
}
