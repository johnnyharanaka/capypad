import { useMemo } from 'react'
import CodeMirror from '@uiw/react-codemirror'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import { EditorView, ViewPlugin } from '@codemirror/view'
import { syntaxHighlighting, HighlightStyle } from '@codemirror/language'
import { tags } from '@lezer/highlight'
import { createLivePreview, livePreviewTheme } from './livePreview'

// Override default markdown syntax highlighting to remove underlines etc.
const markdownHighlight = HighlightStyle.define([
  { tag: tags.heading1, textDecoration: 'none' },
  { tag: tags.heading2, textDecoration: 'none' },
  { tag: tags.heading3, textDecoration: 'none' },
  { tag: tags.heading4, textDecoration: 'none' },
  { tag: tags.heading5, textDecoration: 'none' },
  { tag: tags.heading6, textDecoration: 'none' },
  { tag: tags.strong, textDecoration: 'none' },
  { tag: tags.emphasis, textDecoration: 'none' },
  { tag: tags.link, textDecoration: 'none' },
  { tag: tags.url, textDecoration: 'none' },
  { tag: tags.processingInstruction, textDecoration: 'none' },
  { tag: tags.contentSeparator, textDecoration: 'none' },
])

const blurOnMount = ViewPlugin.fromClass(class {
  constructor(view: EditorView) {
    requestAnimationFrame(() => {
      view.contentDOM.blur()
    })
  }
})

const cleanTheme = EditorView.theme({
  '&': { height: '100%', fontSize: '15px', backgroundColor: 'transparent', border: 'none', outline: 'none' },
  '.cm-scroller': { fontFamily: 'system-ui, sans-serif', lineHeight: '1.7', padding: '16px 48px 60px' },
  '.cm-content': { caretColor: 'currentColor' },
  '.cm-focused': { outline: 'none' },
  '.cm-gutters': { display: 'none' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent' },
  '.cm-activeLine': { backgroundColor: 'transparent' },
  '.cm-line': { padding: '1px 0' },
})

interface Props {
  value: string
  onChange: (value: string) => void
  dark: boolean
  padPath: string
  onEditorReady?: (view: EditorView) => void
}

export default function PadCodeEditor({ value, onChange, dark, padPath, onEditorReady }: Props) {
  const extensions = useMemo(() => [
    cleanTheme,
    markdown({ base: markdownLanguage, codeLanguages: languages }),
    syntaxHighlighting(markdownHighlight),
    createLivePreview({ padPath }),
    livePreviewTheme,
    EditorView.lineWrapping,
    blurOnMount,
    EditorView.updateListener.of(update => {
      if (!update.docChanged && !update.selectionSet && !update.focusChanged) return
      const { doc } = update.state
      const focused = update.view.hasFocus
      const cursorLineNum = doc.lineAt(update.state.selection.main.head).number

      // Propagation: newline was inserted after an alignment line with content → add prefix
      if (update.docChanged) {
        let hasNewline = false
        let insertPos = -1
        update.changes.iterChanges((fromA, _toA, _fromB, _toB, inserted) => {
          if (inserted.toString().includes('\n')) {
            hasNewline = true
            insertPos = fromA
          }
        })
        if (hasNewline && insertPos >= 0) {
          const oldLine = update.startState.doc.lineAt(insertPos)
          const alignMatch = oldLine.text.match(/^(?:#{1,6}\s)?\{(center|right|justify)\}.+/)
          if (alignMatch) {
            const prefix = oldLine.text.match(/\{(center|right|justify)\}/)![0]
            const cursorLine = doc.lineAt(update.state.selection.main.head)
            if (cursorLine.text.trim() === '') {
              update.view.dispatch({
                changes: { from: cursorLine.from, insert: prefix },
                selection: { anchor: cursorLine.from + prefix.length },
              })
              return
            }
          }
        }
      }

      // Cleanup: remove empty alignment-only lines when cursor leaves or focus lost
      const changes: Array<{ from: number; to: number; insert: string }> = []
      for (let i = 1; i <= doc.lines; i++) {
        if (focused && i === cursorLineNum) continue
        const line = doc.line(i)
        if (/^(?:#{1,6}\s)?\{(?:center|right|justify)\}\s*$/.test(line.text)) {
          changes.push({ from: line.from, to: line.to, insert: '' })
        }
      }
      if (changes.length > 0) {
        update.view.dispatch({ changes })
      }
    }),
    EditorView.domEventHandlers({
      paste(event, view) {
        const items = event.clipboardData?.items
        if (!items) return false
        for (const item of items) {
          if (item.type.startsWith('image/')) {
            event.preventDefault()
            const file = item.getAsFile()
            if (!file) return true
            if (file.size > 10 * 1024 * 1024) return true
            // Insert placeholder \image at cursor
            const pos = view.state.selection.main.head
            view.dispatch({
              changes: { from: pos, insert: '\n\\image\n' },
            })
            // Upload and replace with \image[id]
            const formData = new FormData()
            formData.append('file', file)
            fetch(`/api/pad/${padPath}/images`, { method: 'POST', body: formData })
              .then(r => r.json())
              .then((data: { imageId: string }) => {
                // Find the bare \image we just inserted
                const doc = view.state.doc.toString()
                const idx = doc.indexOf('\\image', pos)
                if (idx !== -1 && doc.slice(idx, idx + 7) !== '\\image[') {
                  view.dispatch({
                    changes: { from: idx, to: idx + 6, insert: `\\image[${data.imageId}]` },
                  })
                }
              })
              .catch(() => {
                // Remove placeholder on failure
                const doc = view.state.doc.toString()
                const idx = doc.indexOf('\\image', pos)
                if (idx !== -1 && doc.slice(idx, idx + 7) !== '\\image[') {
                  const end = doc[idx + 6] === '\n' ? idx + 7 : idx + 6
                  view.dispatch({
                    changes: { from: idx > 0 && doc[idx - 1] === '\n' ? idx - 1 : idx, to: end, insert: '' },
                  })
                }
              })
            return true
          }
        }
        return false
      },
    }),
  ], [padPath])

  return (
    <CodeMirror
      value={value}
      onChange={onChange}
      theme={'none' as 'light'}
      className={dark ? 'dark' : ''}
      basicSetup={{
        lineNumbers: false,
        foldGutter: false,
        highlightActiveLine: false,
        highlightSelectionMatches: false,
        drawSelection: true,
        syntaxHighlighting: false,
      }}
      extensions={extensions}
      onCreateEditor={onEditorReady}
      placeholder="Start typing..."
    />
  )
}
