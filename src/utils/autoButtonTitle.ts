function normalizeTooltipText(text: string) {
  return text.replace(/\s+/g, ' ').trim()
}

function deriveButtonTitle(button: HTMLButtonElement) {
  if (button.title || button.dataset.noAutoTitle === 'true') {
    return null
  }

  const ariaLabel = normalizeTooltipText(button.getAttribute('aria-label') ?? '')
  if (ariaLabel) {
    return ariaLabel
  }

  const text = normalizeTooltipText(button.textContent ?? '')
  if (!text) {
    return null
  }

  if (/^[><×✕✖☀☾🔔📊🏢📋💬🤖📁⚙️📎🔄]+$/.test(text)) {
    return null
  }

  return text
}

function applyAutoButtonTitles(root: ParentNode) {
  root.querySelectorAll('button').forEach((node) => {
    if (!(node instanceof HTMLButtonElement)) {
      return
    }

    const title = deriveButtonTitle(node)
    if (title) {
      node.title = title
    }
  })
}

export function enableAutoButtonTitles(root: Document = document) {
  let rafId = 0

  const scheduleApply = () => {
    if (rafId !== 0) {
      return
    }

    rafId = window.requestAnimationFrame(() => {
      rafId = 0
      applyAutoButtonTitles(root)
    })
  }

  applyAutoButtonTitles(root)

  const observer = new MutationObserver(() => {
    scheduleApply()
  })

  observer.observe(root.body, {
    childList: true,
    subtree: true,
    characterData: true,
  })

  return () => {
    observer.disconnect()
    if (rafId !== 0) {
      window.cancelAnimationFrame(rafId)
    }
  }
}
