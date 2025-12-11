import { useRef, useState, useEffect } from "react"

export default function DraggableBox({ children, left, top, width, height, onMove }) {
  const boxRef = useRef(null)
  const [dragging, setDragging] = useState(false)
  const [start, setStart] = useState({ x: 0, y: 0 })
  const [pos, setPos] = useState({ left, top })

  useEffect(() => {
    setPos({ left, top })
  }, [left, top])

  const handlePointerDown = e => {
    e.preventDefault()
    setDragging(true)
    setStart({ x: e.clientX - pos.left, y: e.clientY - pos.top })
  }

  const handlePointerMove = e => {
    if (!dragging) return
    const newLeft = e.clientX - start.x
    const newTop = e.clientY - start.y
    setPos({ left: newLeft, top: newTop })
    onMove(newLeft, newTop)
  }

  const handlePointerUp = () => {
    setDragging(false)
  }

  useEffect(() => {
    window.addEventListener("pointermove", handlePointerMove)
    window.addEventListener("pointerup", handlePointerUp)
    return () => {
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerup", handlePointerUp)
    }
  })

  return (
    <div
      ref={boxRef}
      onPointerDown={handlePointerDown}
      style={{
        position: "absolute",
        left: pos.left,
        top: pos.top,
        width,
        height,
        cursor: "grab",
        border: "2px solid #2563eb",
        background: "rgba(255,255,255,0.6)",
        borderRadius: 4,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        userSelect: "none"
      }}
    >
      {children}
    </div>
  )
}
