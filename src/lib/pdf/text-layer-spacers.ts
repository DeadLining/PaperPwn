const LINE_TOP_TOLERANCE = 3
const MIN_SPACER_WIDTH = 8

interface TextLine {
  top: number
  bottom: number
  right: number
  left: number
  spans: HTMLElement[]
}

function sameLine(line: TextLine, rect: DOMRect) {
  const mid = (rect.top + rect.bottom) / 2
  return mid >= line.top - LINE_TOP_TOLERANCE && mid <= line.bottom + LINE_TOP_TOLERANCE
}

export function sanitizePdfSelectionText(text: string) {
  return text
    .replace(/\u00a0/g, " ")
    .replace(/[ \t]+\n/g, "\n")
    .replace(/[ \t]{2,}/g, " ")
    .trim()
}

export function addTextLayerLineSpacers(textLayer: HTMLDivElement) {
  textLayer.querySelectorAll('[data-virtual-selection="true"]').forEach((node) => node.remove())

  const layerRect = textLayer.getBoundingClientRect()
  const spans = Array.from(textLayer.querySelectorAll("span")) as HTMLElement[]
  const realSpans = spans.filter((span) => {
    if (span.dataset.virtualSelection === "true") return false
    if (!span.textContent?.trim()) return false
    const rect = span.getBoundingClientRect()
    return rect.width > 0 && rect.height > 0
  })

  const lines: TextLine[] = []
  for (const span of realSpans) {
    const rect = span.getBoundingClientRect()
    let line = lines.find((candidate) => sameLine(candidate, rect))
    if (!line) {
      line = { top: rect.top, bottom: rect.bottom, left: rect.left, right: rect.right, spans: [] }
      lines.push(line)
    }
    line.top = Math.min(line.top, rect.top)
    line.bottom = Math.max(line.bottom, rect.bottom)
    line.left = Math.min(line.left, rect.left)
    line.right = Math.max(line.right, rect.right)
    line.spans.push(span)
  }

  const sortedLines = [...lines].sort((a, b) => a.top - b.top)

  for (let index = 0; index < sortedLines.length; index++) {
    const line = sortedLines[index]
    const nextLine = sortedLines[index + 1]
    const width = layerRect.right - line.right
    if (width < MIN_SPACER_WIDTH) continue

    const lastSpan = line.spans.reduce((rightmost, span) => {
      return span.getBoundingClientRect().right > rightmost.getBoundingClientRect().right ? span : rightmost
    }, line.spans[0])
    if (!lastSpan) continue

    const lineHeight = Math.max(1, line.bottom - line.top)
    const spacerBottom = nextLine
      ? Math.max(line.bottom, nextLine.top - 1)
      : Math.min(layerRect.bottom, line.bottom + lineHeight * 0.8)
    const spacerHeight = Math.max(lineHeight, spacerBottom - line.top)

    const spacer = document.createElement("span")
    spacer.dataset.virtualSelection = "true"
    spacer.setAttribute("aria-hidden", "true")
    spacer.textContent = ""
    spacer.style.position = "absolute"
    spacer.style.left = `${line.right - layerRect.left}px`
    spacer.style.top = `${line.top - layerRect.top}px`
    spacer.style.width = `${width}px`
    spacer.style.height = `${spacerHeight}px`
    spacer.style.lineHeight = `${lineHeight}px`
    spacer.style.transform = "none"
    spacer.style.color = "transparent"
    spacer.style.whiteSpace = "pre"
    spacer.style.cursor = "text"
    spacer.style.userSelect = "none"
    spacer.style.webkitUserSelect = "none"
    spacer.style.pointerEvents = "none"
    spacer.style.opacity = "1"
    // Keep DOM order aligned with visual order. If all spacers are appended at
    // the end, fast drags to a spacer can select everything before it.
    lastSpan.after(spacer)
  }
}
