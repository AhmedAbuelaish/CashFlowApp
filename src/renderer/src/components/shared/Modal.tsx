// ============================================================
// CashFlow Planner — Modal
// Closes on Escape or clicking the backdrop — but NOT when the
// user drags text selection out of the modal (mousedown started
// inside, mouseup lands outside).
// ============================================================

import { useEffect, useRef } from 'react'

interface ModalProps {
  title: string
  onClose: () => void
  children: React.ReactNode
  footer?: React.ReactNode
  wide?: boolean
  width?: number
}

export default function Modal({ title, onClose, children, footer, wide, width }: ModalProps) {
  const mouseDownOnBackdrop = useRef(false)

  // Close on Escape
  useEffect(() => {
    const handler = (e: KeyboardEvent) => { if (e.key === 'Escape') onClose() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [onClose])

  return (
    <div
      className="modal-overlay"
      // Record whether the press started on the backdrop itself
      onMouseDown={e => { mouseDownOnBackdrop.current = e.target === e.currentTarget }}
      // Only close if BOTH mousedown and mouseup were on the backdrop
      onMouseUp={e => {
        if (mouseDownOnBackdrop.current && e.target === e.currentTarget) onClose()
        mouseDownOnBackdrop.current = false
      }}
    >
      <div
        className={`modal ${wide ? 'modal-wide' : ''}`}
        style={width ? { maxWidth: width, width: '95%' } : undefined}
        // Prevent bubbled mousedown/mouseup from the modal content reaching the backdrop handler
        onMouseDown={e => e.stopPropagation()}
        onMouseUp={e => e.stopPropagation()}
      >
        <div className="modal-header">
          <h2 className="modal-title">{title}</h2>
          <button className="modal-close" onClick={onClose}>✕</button>
        </div>
        <div className="modal-body">{children}</div>
        {footer && <div className="modal-footer">{footer}</div>}
      </div>
    </div>
  )
}
