import CodeMirror from '@uiw/react-codemirror'
import { markdown, markdownLanguage } from '@codemirror/lang-markdown'
import { languages } from '@codemirror/language-data'
import { EditorView } from '@codemirror/view'
import { syntaxHighlighting, HighlightStyle } from '@codemirror/language'
import { tags } from '@lezer/highlight'
import { livePreview, livePreviewTheme } from './livePreview'

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

const cleanTheme = EditorView.theme({
  '&': { height: '100%', fontSize: '15px', backgroundColor: 'transparent' },
  '.cm-scroller': { fontFamily: 'system-ui, sans-serif', lineHeight: '1.7', padding: '16px 24px' },
  '.cm-content': { caretColor: 'currentColor' },
  '.cm-focused': { outline: 'none' },
  '.cm-gutters': { display: 'none' },
  '.cm-activeLineGutter': { backgroundColor: 'transparent' },
  '.cm-line': { padding: '1px 0' },
})

interface Props {
  value: string
  onChange: (value: string) => void
  dark: boolean
}

export default function PadCodeEditor({ value, onChange, dark }: Props) {
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
      extensions={[
        cleanTheme,
        markdown({ base: markdownLanguage, codeLanguages: languages }),
        syntaxHighlighting(markdownHighlight),
        livePreview,
        livePreviewTheme,
        EditorView.lineWrapping,
      ]}
      placeholder="Start typing..."
    />
  )
}
