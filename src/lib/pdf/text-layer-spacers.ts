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
  // Remove any existing spacers
  textLayer.querySelectorAll('[data-virtual-selection="true"]').forEach((node) => node.remove())

  // DISABLED: spacers cause selection issues in Tauri/WebKit because
  // pointer-events:none does not prevent elementFromPoint from returning them,
  // so they block hits on real text spans underneath.
}
