import { useEffect, useState } from "react";
import Background from "../components/Background";
import Logo from "../components/Logo";
import ThemeToggle from "../components/ThemeToggle";
import { useDarkMode } from "../hooks/useDarkMode";

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

export default function Home() {
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
