import { useEffect } from 'react'
import { Icon } from './Icons.jsx'

export default function Modal({ open, onClose, title, children, footer, wide = false }) {
  useEffect(() => {
    const h = (e) => e.key === 'Escape' && onClose?.()
    if (open) window.addEventListener('keydown', h)
    return () => window.removeEventListener('keydown', h)
  }, [open, onClose])
  if (!open) return null
  return (
    <div className="fixed inset-0 z-50 flex items-end md:items-center justify-center p-0 md:p-6 animate-fade-in">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <div className={`relative liquid-glass-strong w-full ${wide ? 'md:max-w-3xl' : 'md:max-w-xl'} max-h-[100dvh] md:max-h-[92vh] flex flex-col animate-slide-up rounded-b-none md:rounded-3xl`}>
        <div className="flex items-center px-4 md:px-5 py-3 md:py-4 border-b border-ink-100 dark:border-ink-800">
          <h3 className="font-display font-semibold text-lg">{title}</h3>
          <div className="flex-1" />
          <button className="btn-ghost" onClick={onClose} aria-label="Close"><Icon.x className="w-5 h-5" /></button>
        </div>
        <div className="p-4 md:p-5 overflow-y-auto">{children}</div>
        {footer && <div className="px-4 md:px-5 py-3 md:py-4 border-t border-ink-100 dark:border-ink-800 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end" style={{ paddingBottom: 'calc(env(safe-area-inset-bottom) + 0.75rem)' }}>{footer}</div>}
      </div>
    </div>
  )
}
