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
  // Ignore virtual spacer spans — but try to find nearby real text span
  if ((span as HTMLElement).dataset.virtualSelection === "true") {
    // Look for the nearest real text span on the same visual line
    const textLayer = span.closest(".textLayer") as HTMLDivElement | null
    if (textLayer) {
      const spanRect = span.getBoundingClientRect()
      const realSpans = textLayer.querySelectorAll<HTMLElement>("span:not([data-virtual-selection])")
      let bestDistance = Infinity
      for (const rs of realSpans) {
        const r = rs.getBoundingClientRect()
        const sameLine = Math.abs(r.top - spanRect.top) < 6 || (y >= r.top - 2 && y <= r.bottom + 2)
        if (!sameLine) continue
        const distance = x < r.left ? r.left - x : x > r.right ? x - r.right : 0
        if (distance < bestDistance) {
          bestDistance = distance
        }
      }
      if (bestDistance <= 80) return true
    }
    return false
  }
  return true
}

function getCaretRange(x: number, y: number, textLayer?: HTMLDivElement): Range | null {
  // caretRangeFromPoint is Chrome/Safari; caretPositionFromPoint is Firefox
  let caret: Range | null = null
  if (document.caretRangeFromPoint) {
    caret = document.caretRangeFromPoint(x, y)
  }
  // @ts-ignore Firefox
  const pos = document.caretPositionFromPoint?.(x, y)
  if (!caret && pos) {
    const range = document.createRange()
    range.setStart(pos.offsetNode, pos.offset)
    range.collapse(true)
    caret = range
  }
  if (!caret) return null

  // If caret landed inside a virtual spacer span, find the nearest real text span
  const parentEl = caret.startContainer.parentElement
  if (parentEl?.dataset?.virtualSelection === "true" && textLayer) {
    const spacerRect = parentEl.getBoundingClientRect()
    const realSpans = textLayer.querySelectorAll<HTMLElement>("span:not([data-virtual-selection])")
    let bestSpan: HTMLElement | null = null
    let bestDistance = Infinity
    for (const rs of realSpans) {
      const r = rs.getBoundingClientRect()
      const sameLine = Math.abs(r.top - spacerRect.top) < 6 || (y >= r.top - 2 && y <= r.bottom + 2)
      if (!sameLine) continue
      const distance = x < r.left ? r.left - x : x > r.right ? x - r.right : 0
      if (distance < bestDistance) {
        bestDistance = distance
        bestSpan = rs
      }
    }
    if (bestSpan && bestDistance <= 80) {
      const r = bestSpan.getBoundingClientRect()
      const textNode = bestSpan.firstChild
      if (textNode && textNode.nodeType === Node.TEXT_NODE) {
        const rawRatio = (x - r.left) / Math.max(1, r.right - r.left)
        const ratio = Math.max(0, Math.min(1, rawRatio))
        const offset = Math.round(ratio * (textNode.textContent?.length || 0))
        const range = document.createRange()
        try { range.setStart(textNode, Math.min(offset, textNode.textContent?.length || 0)); range.collapse(true) } catch { return null }
        return range
      }
    }
    return null // No real span found
  }
  return caret
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
  let lastValidRange: Range | null = null
  let restoring = false

  const handleMouseDown = (evt: MouseEvent) => {
    const onText = isPointerOnTextSpan(evt.clientX, evt.clientY)
    if (!onText) return

    // Double-click: manually select word at position
    if (evt.detail === 2) {
      evt.preventDefault()
      const caret = getCaretRange(evt.clientX, evt.clientY, textLayer)
      if (!caret || !textLayer.contains(caret.startContainer)) return
      const textNode = caret.startContainer
      const offset = caret.startOffset
      const text = textNode.textContent || ""
      let start = offset
      let end = offset
      while (start > 0 && /\w/.test(text[start - 1])) start--
      while (end < text.length && /\w/.test(text[end])) end++
      if (start === end) { start = Math.max(0, offset - 1); end = Math.min(text.length, offset + 1) }
      const range = document.createRange()
      try { range.setStart(textNode, start); range.setEnd(textNode, end) } catch { return }
      const sel = window.getSelection()
      if (sel) { sel.removeAllRanges(); sel.addRange(range) }
      return
    }

    // Triple-click: select entire line/paragraph — let browser handle
    if (evt.detail >= 3) return

    // Single click drag: prevent native drag-to-select entirely
    evt.preventDefault()

    const caret = getCaretRange(evt.clientX, evt.clientY, textLayer)
    if (!caret || !textLayer.contains(caret.startContainer)) return

    selecting = true
    anchorRange = caret.cloneRange()
    lastValidRange = caret.cloneRange()

    // Place a collapsed caret at the anchor
    const sel = window.getSelection()
    if (sel) {
      restoring = true
      sel.removeAllRanges()
      sel.addRange(anchorRange.cloneRange())
      restoring = false
    }
  }

  const handleMouseMove = (evt: MouseEvent) => {
    if (!selecting || evt.buttons !== 1) return
    evt.preventDefault()
    evt.stopPropagation()

    const onText = isPointerOnTextSpan(evt.clientX, evt.clientY)
    if (!onText) {
      // Pointer is in blank area — keep the last valid selection, don't extend
      return
    }

    const caret = getCaretRange(evt.clientX, evt.clientY, textLayer)
    if (!caret || !textLayer.contains(caret.startContainer)) return

    const range = buildSelectionRange(anchorRange!, caret, textLayer)
    if (!range) return

    const sel = window.getSelection()
    if (sel) {
      restoring = true
      sel.removeAllRanges()
      sel.addRange(range)
      restoring = false
      lastValidRange = range.cloneRange()
    }
  }

  const handleMouseUp = () => {
    selecting = false
    anchorRange = null
    lastValidRange = null
  }

  const handleSelectStart = (evt: Event) => {
    if (selecting) {
      evt.preventDefault()
      evt.stopPropagation()
    }
  }

  const handleSelectionChange = () => {
    if (!selecting || restoring || !lastValidRange) return
    const sel = window.getSelection()
    const text = sel?.toString() || ""
    if (text.length > Math.max(300, lastValidRange.toString().length + 200)) {
      restoring = true
      sel?.removeAllRanges()
      sel?.addRange(lastValidRange.cloneRange())
      restoring = false
    }
  }

  textLayer.addEventListener("mousedown", handleMouseDown, { capture: true })
  document.addEventListener("mousemove", handleMouseMove, { capture: true })
  document.addEventListener("mouseup", handleMouseUp)
  document.addEventListener("selectstart", handleSelectStart, { capture: true })
  document.addEventListener("selectionchange", handleSelectionChange)

  return {
    dispose: () => {
      textLayer.removeEventListener("mousedown", handleMouseDown, { capture: true })
      document.removeEventListener("mousemove", handleMouseMove, { capture: true })
      document.removeEventListener("mouseup", handleMouseUp)
      document.removeEventListener("selectstart", handleSelectStart, { capture: true })
      document.removeEventListener("selectionchange", handleSelectionChange)
    },
  }
}
