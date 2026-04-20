import { useEffect, useRef, useState } from "react";

export default function DropOverlay() {
  const [dragging, setDragging] = useState(false);
  const counter = useRef(0);

  useEffect(() => {
    const onEnter = (e: DragEvent) => {
      if (!e.dataTransfer?.types.includes("Files")) return;
      counter.current++;
      setDragging(true);
    };

    const onLeave = () => {
      counter.current--;
      if (counter.current <= 0) {
        counter.current = 0;
        setDragging(false);
      }
    };

    const onDrop = () => {
      counter.current = 0;
      setDragging(false);
    };

    const onOver = (e: DragEvent) => {
      if (e.dataTransfer?.types.includes("Files")) {
        e.preventDefault();
      }
    };

    window.addEventListener("dragenter", onEnter);
    window.addEventListener("dragleave", onLeave);
    window.addEventListener("drop", onDrop, true);
    window.addEventListener("dragover", onOver);
    return () => {
      window.removeEventListener("dragenter", onEnter);
      window.removeEventListener("dragleave", onLeave);
      window.removeEventListener("drop", onDrop, true);
      window.removeEventListener("dragover", onOver);
    };
  }, []);

  if (!dragging) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-stone-900/40 dark:bg-black/50 backdrop-blur-sm transition-opacity animate-in fade-in duration-150 pointer-events-none">
      <div className="flex flex-col items-center justify-center gap-5 rounded-3xl border-3 border-dashed border-stone-400 dark:border-stone-500 bg-white/80 dark:bg-stone-800/80 shadow-2xl w-[80vw] h-[70vh] max-w-4xl max-h-[600px]">
        <svg
          xmlns="http://www.w3.org/2000/svg"
          viewBox="0 0 24 24"
          fill="currentColor"
          className="w-20 h-20 text-stone-400 dark:text-stone-500"
        >
          <path
            fillRule="evenodd"
            d="M1.5 6a2.25 2.25 0 012.25-2.25h16.5A2.25 2.25 0 0122.5 6v12a2.25 2.25 0 01-2.25 2.25H3.75A2.25 2.25 0 011.5 18V6zM3 16.06V18c0 .414.336.75.75.75h16.5A.75.75 0 0021 18v-1.94l-2.69-2.689a1.5 1.5 0 00-2.12 0l-.88.879.97.97a.75.75 0 11-1.06 1.06l-5.16-5.159a1.5 1.5 0 00-2.12 0L3 16.061zm10.125-7.81a1.125 1.125 0 112.25 0 1.125 1.125 0 01-2.25 0z"
            clipRule="evenodd"
          />
        </svg>
        <span className="text-lg font-medium text-stone-600 dark:text-stone-300">
          Drop image here
        </span>
      </div>
    </div>
  );
}
