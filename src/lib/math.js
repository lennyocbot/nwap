const RAW_MATH = /\\(?:frac|sqrt|int|sum|lim|sin|cos|tan|log|ln|theta|alpha|beta|gamma|pi|omega|Delta|delta|times|cdot|approx|leq|geq|neq|infty)\b/

export function hasRawMath(text = '') {
  return RAW_MATH.test(text)
}

export function normalizeMathMarkdown(text = '', mode = 'auto') {
  if (!text || typeof text !== 'string') return ''
  return splitCodeBlocks(text).map((part, index) => {
    if (index % 2 === 1) return part
    return normalizeMathText(part, mode)
  }).join('')
}

function splitCodeBlocks(text) {
  return text.split(/(```[\s\S]*?```|`[^`\n]*`)/g)
}

function normalizeMathText(text, mode) {
  let out = text
    .replace(/\\\[((?:.|\n)*?)\\\]/g, (_, expr) => `$$${expr.trim()}$$`)
    .replace(/\\\(((?:.|\n)*?)\\\)/g, (_, expr) => `$${expr.trim()}$`)
    .replace(/([A-Za-z])['\u2032]\(([^)]+)\)/g, (_, fn, arg) => `$${fn}'(${arg})$`)
    .replace(/([A-Za-z])['\u2032]\b/g, (_, fn) => `$${fn}'$`)

  out = out.replace(/(^|\n)([^$\n]*(?:\\(?:int|frac|sqrt|sum|lim)[^$\n]*)\$([^$\n]+)\$([^$\n]*)(?=\n|$))/g, (_, _line, prefix, before, inner, after) => {
    const expr = `${before}${inner}${after}`.trim()
    return `${prefix}$$${expr}$$`
  })

  out = out.replace(/(^|[\s(])((?:\\(?:frac|sqrt)\{[^}\n]+\}\{?[^}\n]*\}?|\\(?:int|sum|lim|sin|cos|tan|log|ln|theta|alpha|beta|gamma|pi|omega|Delta|delta|times|cdot|approx|leq|geq|neq|infty)(?:\s*[_^]?\{?[\w+\-=]+\}?)*)(?:\s*[+\-=]\s*(?:\\?\w+|\d+|\{[^}\n]+\}))*)/g, (match, prefix, expr) => {
    if (match.includes('$')) return match
    return `${prefix}$${expr.trim()}$`
  })

  if (mode === 'aggressive') {
    out = out.replace(/(^|[\s(])((?:\\[a-zA-Z]+(?:\{[^}\n]+\}|\s*[_^]?\{?[\w+\-=]+\}?)*)(?:\s*[+\-=]\s*(?:\\?[a-zA-Z0-9]+|\{[^}\n]+\}))*)/g, (match, prefix, expr) => {
      if (match.includes('$')) return match
      return `${prefix}$${expr.trim()}$`
    })
  }

  return out
}
