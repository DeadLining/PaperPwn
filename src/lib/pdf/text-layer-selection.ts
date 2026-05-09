interface SelectionBinding {
  dispose: () => void
}

function closestTextSpanFromPoint(x: number, y: number) {
  const element = document.elementFromPoint(x, y) as HTMLElement | null
  return element?.closest?.(".textLayer span") as HTMLElement | null
}

function isPointerOnTextSpan(x: number, y: number) {
  const span = closestTextSpanFromPoint(x, y)
  if (!span) return false
  // Ignore virtual spacer spans
  if ((span as HTMLElement).dataset.virtualSelection === "true") return false
  return true
}

function getCaretRange(x: number, y: number): Range | null {
  // caretRangeFromPoint is Chrome/Safari; caretPositionFromPoint is Firefox
  if (document.caretRangeFromPoint) {
    return document.caretRangeFromPoint(x, y)
  }
  // @ts-ignore Firefox
  const pos = document.caretPositionFromPoint?.(x, y)
  if (pos) {
    const range = document.createRange()
    range.setStart(pos.offsetNode, pos.offset)
    range.collapse(true)
    return range
  }
  return null
}

/** Get a Range that selects from anchor to focus, clamped to textLayer spans only. */
function buildSelectionRange(
  anchorRange: Range,
  focusRange: Range,
  textLayer: HTMLDivElement
): Range | null {
  // Both ranges are collapsed caret positions.
  // We need to create a range from anchor to focus.
  const anchorNode = anchorRange.startContainer
  const anchorOffset = anchorRange.startOffset
  const focusNode = focusRange.startContainer
  const focusOffset = focusRange.startOffset

  // Check both are inside textLayer
  if (!textLayer.contains(anchorNode) || !textLayer.contains(focusNode)) return null

  // Compare positions
  const cmp = anchorNode.compareDocumentPosition(focusNode)
  let startNode: Node, startOffset: number, endNode: Node, endOffset: number

  if (cmp & Node.DOCUMENT_POSITION_FOLLOWING || (cmp === 0 && anchorOffset <= focusOffset)) {
    // anchor is before (or same as) focus
    startNode = anchorNode
    startOffset = anchorOffset
    endNode = focusNode
    endOffset = focusOffset
  } else {
    // focus is before anchor — reverse selection
    startNode = focusNode
    startOffset = focusOffset
    endNode = anchorNode
    endOffset = anchorOffset
  }

  const range = document.createRange()
  try {
    range.setStart(startNode, startOffset)
    range.setEnd(endNode, endOffset)
  } catch {
    return null
  }
  return range
}

export function bindTextLayerSelection(textLayer: HTMLDivElement): SelectionBinding {
  let selecting = false
  let anchorRange: Range | null = null

  const handleMouseDown = (evt: MouseEvent) => {
    const onText = isPointerOnTextSpan(evt.clientX, evt.clientY)
    if (!onText) return

    // Let browser handle double-click (word select) and triple-click (line select)
    if (evt.detail >= 2) return

    // Single click drag: prevent native drag-to-select entirely
    evt.preventDefault()

    const caret = getCaretRange(evt.clientX, evt.clientY)
    if (!caret || !textLayer.contains(caret.startContainer)) return

    selecting = true
    anchorRange = caret.cloneRange()

    // Place a collapsed caret at the anchor
    const sel = window.getSelection()
    if (sel) {
      sel.removeAllRanges()
      sel.addRange(anchorRange.cloneRange())
    }
  }

  const handleMouseMove = (evt: MouseEvent) => {
    if (!selecting || evt.buttons !== 1) return

    const onText = isPointerOnTextSpan(evt.clientX, evt.clientY)
    if (!onText) {
      // Pointer is in blank area — keep the last valid selection, don't extend
      return
    }

    const caret = getCaretRange(evt.clientX, evt.clientY)
    if (!caret || !textLayer.contains(caret.startContainer)) return

    const range = buildSelectionRange(anchorRange!, caret, textLayer)
    if (!range) return

    const sel = window.getSelection()
    if (sel) {
      sel.removeAllRanges()
      sel.addRange(range)
    }
  }

  const handleMouseUp = () => {
    selecting = false
    anchorRange = null
  }

  textLayer.addEventListener("mousedown", handleMouseDown, { capture: true })
  document.addEventListener("mousemove", handleMouseMove, { capture: true })
  document.addEventListener("mouseup", handleMouseUp)

  return {
    dispose: () => {
      textLayer.removeEventListener("mousedown", handleMouseDown, { capture: true })
      document.removeEventListener("mousemove", handleMouseMove, { capture: true })
      document.removeEventListener("mouseup", handleMouseUp)
    },
  }
}
