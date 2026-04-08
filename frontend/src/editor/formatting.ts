import type { EditorView } from '@codemirror/view'

export function toggleWrap(view: EditorView, prefix: string, suffix: string = prefix) {
  const { from, to } = view.state.selection.main
  const startLine = view.state.doc.lineAt(from)
  const endLine = view.state.doc.lineAt(to)
  const multiline = startLine.number !== endLine.number

  if (multiline) {
    // Apply per-line to keep markers adjacent to text
    const changes: Array<{ from: number; to: number; insert: string }> = []
    let removing = true

    for (let i = startLine.number; i <= endLine.number; i++) {
      const line = view.state.doc.line(i)
      const text = line.text.trim()
      if (!text) continue
      if (!(text.startsWith(prefix) && text.endsWith(suffix) && text.length >= prefix.length + suffix.length)) {
        removing = false
        break
      }
    }

    for (let i = startLine.number; i <= endLine.number; i++) {
      const line = view.state.doc.line(i)
      const text = line.text
      if (!text.trim()) continue
      if (removing) {
        // Find prefix/suffix positions accounting for leading whitespace
        const trimStart = text.length - text.trimStart().length
        const trimEnd = text.trimEnd().length
        changes.push({ from: line.from + trimStart, to: line.from + trimStart + prefix.length, insert: '' })
        changes.push({ from: line.from + trimEnd - suffix.length, to: line.from + trimEnd, insert: '' })
      } else {
        const trimStart = text.length - text.trimStart().length
        const trimEnd = text.trimEnd().length
        changes.push({ from: line.from + trimEnd, to: line.from + trimEnd, insert: suffix })
        changes.push({ from: line.from + trimStart, to: line.from + trimStart, insert: prefix })
      }
    }

    view.dispatch({ changes })
  } else {
    const selected = view.state.doc.sliceString(from, to)

    // Check if already wrapped (markers outside selection)
    const before = view.state.doc.sliceString(Math.max(0, from - prefix.length), from)
    const after = view.state.doc.sliceString(to, to + suffix.length)

    if (before === prefix && after === suffix) {
      view.dispatch({
        changes: [
          { from: from - prefix.length, to: from, insert: '' },
          { from: to, to: to + suffix.length, insert: '' },
        ],
        selection: { anchor: from - prefix.length, head: to - prefix.length },
      })
    } else if (selected.startsWith(prefix) && selected.endsWith(suffix) && selected.length >= prefix.length + suffix.length) {
      view.dispatch({
        changes: { from, to, insert: selected.slice(prefix.length, -suffix.length || undefined) },
        selection: { anchor: from, head: to - prefix.length - suffix.length },
      })
    } else {
      view.dispatch({
        changes: { from, to, insert: `${prefix}${selected}${suffix}` },
        selection: { anchor: from + prefix.length, head: to + prefix.length },
      })
    }
  }
  view.focus()
}

export function toggleLinePrefix(view: EditorView, prefix: string) {
  const { from, to } = view.state.selection.main
  const startLine = view.state.doc.lineAt(from)
  const endLine = view.state.doc.lineAt(to)

  const changes: Array<{ from: number; to: number; insert: string }> = []
  let removing = true

  // Check if all lines already have the prefix
  for (let i = startLine.number; i <= endLine.number; i++) {
    const line = view.state.doc.line(i)
    if (!line.text.startsWith(prefix)) {
      removing = false
      break
    }
  }

  for (let i = startLine.number; i <= endLine.number; i++) {
    const line = view.state.doc.line(i)
    if (removing) {
      changes.push({ from: line.from, to: line.from + prefix.length, insert: '' })
    } else {
      changes.push({ from: line.from, to: line.from, insert: prefix })
    }
  }

  view.dispatch({ changes })
  view.focus()
}

export function setHeading(view: EditorView, level: number) {
  const { from } = view.state.selection.main
  const line = view.state.doc.lineAt(from)
  const target = level > 0 ? '#'.repeat(level) + ' ' : ''

  // Remove existing heading prefix
  const match = line.text.match(/^#{1,6}\s/)
  const existingLen = match ? match[0].length : 0

  view.dispatch({
    changes: { from: line.from, to: line.from + existingLen, insert: target },
  })
  view.focus()
}

const ALIGN_PREFIXES = ['{center}', '{right}', '{justify}']

export function setAlignment(view: EditorView, align: 'left' | 'center' | 'right' | 'justify') {
  const { from, to } = view.state.selection.main
  const startLine = view.state.doc.lineAt(from)
  const endLine = view.state.doc.lineAt(to)
  const changes: Array<{ from: number; to: number; insert: string }> = []
  const prefix = align === 'left' ? '' : `{${align}}`

  for (let i = startLine.number; i <= endLine.number; i++) {
    const line = view.state.doc.line(i)
    // Skip heading prefix (e.g. "# ", "## ")
    const headingMatch = line.text.match(/^#{1,6}\s/)
    const afterHeading = headingMatch ? headingMatch[0].length : 0
    const rest = line.text.slice(afterHeading)
    // Remove any existing alignment prefix
    let existingLen = 0
    for (const p of ALIGN_PREFIXES) {
      if (rest.startsWith(p)) {
        existingLen = p.length
        break
      }
    }
    const insertPos = line.from + afterHeading
    changes.push({ from: insertPos, to: insertPos + existingLen, insert: prefix })
  }

  view.dispatch({ changes })
  view.focus()
}

export function toggleBold(view: EditorView) { toggleWrap(view, '**') }
export function toggleItalic(view: EditorView) { toggleWrap(view, '*') }
export function toggleUnderline(view: EditorView) { toggleWrap(view, '<u>', '</u>') }
export function toggleStrikethrough(view: EditorView) { toggleWrap(view, '~~') }
export function toggleCode(view: EditorView) { toggleWrap(view, '`') }
export function toggleBulletList(view: EditorView) { toggleLinePrefix(view, '- ') }
export function toggleNumberedList(view: EditorView) { toggleLinePrefix(view, '1. ') }
export function toggleBlockquote(view: EditorView) { toggleLinePrefix(view, '> ') }
