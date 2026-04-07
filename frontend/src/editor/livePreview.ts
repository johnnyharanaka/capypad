import {
  Decoration,
  type DecorationSet,
  EditorView,
  ViewPlugin,
  type ViewUpdate,
  WidgetType,
} from '@codemirror/view'
import { type EditorState, type Range } from '@codemirror/state'
import { syntaxTree } from '@codemirror/language'

const hideMark = Decoration.replace({})

const headingLine: Record<number, Decoration> = {
  1: Decoration.line({ class: 'cm-live-h1' }),
  2: Decoration.line({ class: 'cm-live-h2' }),
  3: Decoration.line({ class: 'cm-live-h3' }),
  4: Decoration.line({ class: 'cm-live-h4' }),
  5: Decoration.line({ class: 'cm-live-h5' }),
  6: Decoration.line({ class: 'cm-live-h6' }),
}

const boldMark = Decoration.mark({ class: 'cm-live-bold' })
const italicMark = Decoration.mark({ class: 'cm-live-italic' })
const codeMark = Decoration.mark({ class: 'cm-live-code' })
const linkMark = Decoration.mark({ class: 'cm-live-link' })
const quoteLine = Decoration.line({ class: 'cm-live-blockquote' })

class HrWidget extends WidgetType {
  toDOM() {
    const el = document.createElement('hr')
    el.className = 'cm-live-hr-line'
    return el
  }
}

function getCursorLines(state: EditorState): Set<number> {
  const lines = new Set<number>()
  for (const range of state.selection.ranges) {
    const startLine = state.doc.lineAt(range.from).number
    const endLine = state.doc.lineAt(range.to).number
    for (let i = startLine; i <= endLine; i++) {
      lines.add(i)
    }
  }
  return lines
}

function buildDecorations(view: EditorView): DecorationSet {
  const cursorLines = getCursorLines(view.state)
  const decorations: Range<Decoration>[] = []
  const tree = syntaxTree(view.state)

  tree.iterate({
    enter(node) {
      const lineStart = view.state.doc.lineAt(node.from)
      const lineEnd = view.state.doc.lineAt(node.to)
      const isOnCursor = (() => {
        for (let i = lineStart.number; i <= lineEnd.number; i++) {
          if (cursorLines.has(i)) return true
        }
        return false
      })()

      if (isOnCursor) return

      // Headings
      const headingMatch = node.name.match(/^ATXHeading(\d)$/)
      if (headingMatch) {
        const level = parseInt(headingMatch[1])
        decorations.push(headingLine[level].range(lineStart.from))
        return
      }

      // Hide heading marks (# symbols + space)
      if (node.name === 'HeaderMark') {
        // Hide the mark and trailing space
        const after = node.to
        const nextChar = view.state.doc.sliceString(after, after + 1)
        const end = nextChar === ' ' ? after + 1 : after
        decorations.push(hideMark.range(node.from, end))
        return
      }

      // Bold
      if (node.name === 'StrongEmphasis') {
        // Find and hide the ** markers
        const text = view.state.doc.sliceString(node.from, node.to)
        const markerLen = text.startsWith('**') ? 2 : 1
        decorations.push(hideMark.range(node.from, node.from + markerLen))
        decorations.push(hideMark.range(node.to - markerLen, node.to))
        decorations.push(boldMark.range(node.from + markerLen, node.to - markerLen))
        return false
      }

      // Italic
      if (node.name === 'Emphasis') {
        decorations.push(hideMark.range(node.from, node.from + 1))
        decorations.push(hideMark.range(node.to - 1, node.to))
        decorations.push(italicMark.range(node.from + 1, node.to - 1))
        return false
      }

      // Inline code
      if (node.name === 'InlineCode') {
        const text = view.state.doc.sliceString(node.from, node.to)
        const ticks = text.startsWith('``') ? 2 : 1
        decorations.push(hideMark.range(node.from, node.from + ticks))
        decorations.push(hideMark.range(node.to - ticks, node.to))
        decorations.push(codeMark.range(node.from + ticks, node.to - ticks))
        return false
      }

      // Links [text](url) — just style the text part
      if (node.name === 'Link') {
        // Hide [ before text
        decorations.push(hideMark.range(node.from, node.from + 1))
        // Find ](url) part and hide it
        const urlPart = view.state.doc.sliceString(node.from, node.to)
        const closeBracket = urlPart.indexOf('](')
        if (closeBracket !== -1) {
          const absPos = node.from + closeBracket
          decorations.push(hideMark.range(absPos, node.to))
          decorations.push(linkMark.range(node.from + 1, absPos))
        }
        return false
      }

      // Blockquotes
      if (node.name === 'Blockquote') {
        for (let i = lineStart.number; i <= lineEnd.number; i++) {
          const line = view.state.doc.line(i)
          decorations.push(quoteLine.range(line.from))
        }
        return
      }

      // Quote marks (> )
      if (node.name === 'QuoteMark') {
        const after = node.to
        const nextChar = view.state.doc.sliceString(after, after + 1)
        const end = nextChar === ' ' ? after + 1 : after
        decorations.push(hideMark.range(node.from, end))
        return
      }

      // Thematic breaks (---, ***, ___)
      if (node.name === 'HorizontalRule') {
        decorations.push(hideMark.range(node.from, node.to))
        decorations.push(
          Decoration.widget({ widget: new HrWidget(), block: true }).range(node.from)
        )
        return false
      }
    },
  })

  // Sort by position (required by CodeMirror)
  decorations.sort((a, b) => a.from - b.from || a.value.startSide - b.value.startSide)
  return Decoration.set(decorations)
}

export const livePreview = ViewPlugin.fromClass(
  class {
    decorations: DecorationSet

    constructor(view: EditorView) {
      this.decorations = buildDecorations(view)
    }

    update(update: ViewUpdate) {
      if (update.docChanged || update.selectionSet || update.viewportChanged) {
        this.decorations = buildDecorations(update.view)
      }
    }
  },
  { decorations: (v) => v.decorations }
)

export const livePreviewTheme = EditorView.baseTheme({
  '.cm-live-h1': { fontSize: '2em', fontWeight: '700', lineHeight: '1.3' },
  '.cm-live-h2': { fontSize: '1.5em', fontWeight: '600', lineHeight: '1.3' },
  '.cm-live-h3': { fontSize: '1.25em', fontWeight: '600', lineHeight: '1.4' },
  '.cm-live-h4': { fontSize: '1.1em', fontWeight: '600', lineHeight: '1.4' },
  '.cm-live-h5': { fontSize: '1em', fontWeight: '600', lineHeight: '1.4' },
  '.cm-live-h6': { fontSize: '0.9em', fontWeight: '600', lineHeight: '1.4' },
  '.cm-live-bold': { fontWeight: '700' },
  '.cm-live-italic': { fontStyle: 'italic' },
  '.cm-live-code': {
    fontFamily: 'ui-monospace, Consolas, monospace',
    backgroundColor: 'rgba(120, 113, 108, 0.15)',
    borderRadius: '3px',
    padding: '1px 4px',
    fontSize: '0.9em',
  },
  '.cm-live-link': {
    color: '#2563eb',
    textDecoration: 'underline',
    cursor: 'pointer',
  },
  '.cm-live-blockquote': {
    borderLeft: '3px solid rgba(120, 113, 108, 0.4)',
    paddingLeft: '12px',
    color: 'rgba(120, 113, 108, 0.8)',
  },
  '.cm-live-hr-line': {
    border: 'none',
    borderTop: '2px solid rgba(120, 113, 108, 0.3)',
    margin: '8px 0',
  },
})
