import { useEffect, useState } from 'react'
import PadCodeEditor from './editor/PadEditor'

function useDarkMode() {
  const [dark, setDark] = useState(() =>
    localStorage.getItem('theme') === 'dark' ||
    (!localStorage.getItem('theme') && window.matchMedia('(prefers-color-scheme: dark)').matches)
  )

  useEffect(() => {
    document.documentElement.classList.toggle('dark', dark)
    localStorage.setItem('theme', dark ? 'dark' : 'light')
  }, [dark])

  return [dark, () => setDark(!dark)] as const
}

function ThemeToggle({ dark, toggle }: { dark: boolean; toggle: () => void }) {
  return (
    <button
      onClick={toggle}
      className="p-1.5 rounded-md hover:bg-stone-200 dark:hover:bg-stone-700 transition-colors"
      aria-label="Toggle dark mode"
    >
      {dark ? (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
          <path d="M10 2a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5A.75.75 0 0110 2zm0 13a.75.75 0 01.75.75v1.5a.75.75 0 01-1.5 0v-1.5A.75.75 0 0110 15zm8-5a.75.75 0 01-.75.75h-1.5a.75.75 0 010-1.5h1.5A.75.75 0 0118 10zM5 10a.75.75 0 01-.75.75h-1.5a.75.75 0 010-1.5h1.5A.75.75 0 015 10zm10.657-5.657a.75.75 0 010 1.06l-1.06 1.061a.75.75 0 11-1.061-1.06l1.06-1.061a.75.75 0 011.061 0zm-9.193 9.193a.75.75 0 010 1.06l-1.06 1.061a.75.75 0 11-1.061-1.06l1.06-1.061a.75.75 0 011.061 0zm9.193 0a.75.75 0 010 1.061l-1.06 1.06a.75.75 0 01-1.061-1.06l1.06-1.06a.75.75 0 011.061 0zM5.464 4.343a.75.75 0 010 1.061L4.403 6.465a.75.75 0 01-1.06-1.06l1.06-1.062a.75.75 0 011.061 0zM10 6.5a3.5 3.5 0 100 7 3.5 3.5 0 000-7z" />
        </svg>
      ) : (
        <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 20 20" fill="currentColor" className="w-5 h-5">
          <path fillRule="evenodd" d="M7.455 2.004a.75.75 0 01.26.77 7 7 0 009.958 7.967.75.75 0 011.067.853A8.5 8.5 0 116.647 1.921a.75.75 0 01.808.083z" clipRule="evenodd" />
        </svg>
      )}
    </button>
  )
}

function Home() {
  const [name, setName] = useState('')
  const [dark, toggle] = useDarkMode()

  const go = () => {
    const trimmed = name.trim()
    if (trimmed) {
      window.location.href = `/${trimmed}`
    }
  }

  return (
    <div className="min-h-screen bg-stone-50 dark:bg-stone-900 flex flex-col">
      <header className="px-6 py-3 flex justify-end">
        <ThemeToggle dark={dark} toggle={toggle} />
      </header>
      <div className="flex-1 flex flex-col items-center justify-center px-4">
        <h1 className="text-4xl font-semibold tracking-tight text-stone-800 dark:text-stone-100 mb-2">
          capypad
        </h1>
        <p className="text-stone-400 dark:text-stone-500 mb-8">Digite o nome do pad para começar</p>
        <div className="w-full max-w-md">
          <input
            className="w-full bg-white dark:bg-stone-800 border border-stone-200 dark:border-stone-700 rounded-lg px-4 py-3 text-lg text-stone-800 dark:text-stone-100 focus:outline-none focus:ring-2 focus:ring-stone-300 dark:focus:ring-stone-600 placeholder:text-stone-300 dark:placeholder:text-stone-600"
            value={name}
            onChange={(e) => setName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && go()}
            placeholder="meu-pad"
            aria-label="Pad name"
            autoFocus
          />
        </div>
      </div>
    </div>
  )
}

function PadEditorPage({ padPath }: { padPath: string }) {
  const [content, setContent] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [dark, toggle] = useDarkMode()

  useEffect(() => {
    fetch(`/api/pad/${padPath}`)
      .then((res) => res.json())
      .then((data) => setContent(data.content))
  }, [padPath])

  useEffect(() => {
    if (content === null) return
    const timeout = setTimeout(() => {
      setSaving(true)
      fetch(`/api/pad/${padPath}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content }),
      }).finally(() => setSaving(false))
    }, 500)
    return () => clearTimeout(timeout)
  }, [content, padPath])

  return (
    <div className="h-screen flex flex-col bg-stone-50 dark:bg-stone-900 text-stone-800 dark:text-stone-100">
      <header className="border-b border-stone-200 dark:border-stone-700 px-6 py-3 flex items-center justify-between shrink-0">
        <a href="/" className="text-lg font-semibold tracking-tight no-underline hover:opacity-70">
          capypad<span className="text-stone-400 dark:text-stone-500">/{padPath}</span>
        </a>
        <div className="flex items-center gap-3">
          {saving && (
            <span className="text-xs text-stone-400 dark:text-stone-500">saving...</span>
          )}
          <ThemeToggle dark={dark} toggle={toggle} />
        </div>
      </header>
      <div className="flex-1 overflow-auto">
        {content !== null && (
          <PadCodeEditor value={content} onChange={setContent} dark={dark} />
        )}
      </div>
    </div>
  )
}

function App() {
  const padPath = window.location.pathname.replace(/^\/+/, '')

  if (!padPath) return <Home />
  return <PadEditorPage padPath={padPath} />
}

export default App
