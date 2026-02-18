'use client'

import { useState, useRef, useEffect, useCallback } from 'react'
import { motion, AnimatePresence } from 'framer-motion'

// Blue Sky Theme Colors
const colors = {
  blue: '#0000ff',
  cerulean: '#3c8aff',
  gray0: '#ffffff',
  gray10: '#eef0f3',
  gray15: '#dee1e7',
  gray30: '#b1b7c3',
  gray50: '#717886',
  gray60: '#5b616e',
  gray80: '#32353d',
  gray100: '#0a0b0d',
  green: '#20C073',
  red: '#fc401f',
}

const BET_SIZES = [1, 5, 10, 25]
const GRID_ROWS = 12
const GRID_COLS = 8

// Calculate multiplier based on distance from current price Y
const getMultiplier = (distance: number): number => {
  if (distance <= 0.5) return 2
  if (distance <= 1.5) return 5
  if (distance <= 2.5) return 10
  if (distance <= 3.5) return 20
  if (distance <= 4.5) return 35
  if (distance <= 5.5) return 50
  if (distance <= 6.5) return 75
  if (distance <= 7.5) return 100
  if (distance <= 8.5) return 150
  return 200
}

const formatMultiplier = (mult: number): string => `${mult.toFixed(2)}x`

// Exponential ease-out function - explosive first, slow down dramatically
// Using 10th power for very extreme curve: almost all motion in first 20% of time
const easeOutExpo = (t: number): number => {
  const decay = 1 - t
  const decay2 = decay * decay
  const decay4 = decay2 * decay2
  const decay8 = decay4 * decay4
  return 1 - decay8 * decay2 // 10th power for explosive start
}

interface Block {
  id: string
  gridX: number
  gridY: number
  multiplier: number
  betSize: number
  status: 'pending' | 'won' | 'lost'
}

interface Toast {
  id: string
  message: string
  type: 'win' | 'loss'
}

interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  size: number
  waveFreq: number
  waveAmp: number
  phase: number
  trail: { x: number; y: number }[]
}

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const [balance, setBalance] = useState(1000)
  const [selectedBet, setSelectedBet] = useState(5)
  const [blocks, setBlocks] = useState<Block[]>([])
  const [toasts, setToasts] = useState<Toast[]>([])
  
  const viewOffsetXRef = useRef(0)
  const currentPriceYRef = useRef(GRID_ROWS / 2)
  const containerSizeRef = useRef({ width: 0, height: 0 })
  const animationRef = useRef<number>(0)
  const lastTimeRef = useRef(0)
  const particlesRef = useRef<Particle[]>([])
  const priceVelocityRef = useRef(0)
  const priceTrailRef = useRef<{ y: number; age: number }[]>([])
  const gridDimsRef = useRef({ cellWidth: 0, cellHeight: 0, gridWidth: 0, gridHeight: 0 })
  const globalYOffsetRef = useRef(0)
  const hoverCellRef = useRef<{ col: number; row: number; absoluteGridX: number; absoluteGridY: number } | null>(null)
  const isDraggingRef = useRef(false)
  const lastPlacedCellRef = useRef<{ gridX: number; gridY: number } | null>(null)

  const GRID_PADDING = { top: 20, right: 20, bottom: 20, left: 20 }
  const PRICE_LINE_POSITION = 0.4
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio : 1

  const addToast = useCallback((message: string, type: 'win' | 'loss') => {
    const id = `${Date.now()}-${Math.random()}`
    setToasts(prev => [...prev, { id, message, type }].slice(-3))
    setTimeout(() => {
      setToasts(prev => prev.filter(t => t.id !== id))
    }, 1500)
  }, [])

  const spawnParticles = useCallback((x: number, y: number) => {
    const newParticles: Particle[] = []
    // More particles for fuller explosion
    for (let i = 0; i < 24; i++) {
      const angle = (Math.PI * 2 * i) / 24 + (Math.random() - 0.5) * 0.3
      // Much faster initial speed for explosive effect
      const initialSpeed = 12 + Math.random() * 8
      const offsetX = (Math.random() - 0.5) * 6
      const offsetY = (Math.random() - 0.5) * 6
      newParticles.push({
        x: x + offsetX,
        y: y + offsetY,
        vx: Math.cos(angle) * initialSpeed,
        vy: Math.sin(angle) * initialSpeed,
        life: 1,
        maxLife: 1,
        size: 2.5 + Math.random() * 2,
        // More wave for curvy paths
        waveFreq: 0.3 + Math.random() * 0.4,
        waveAmp: 0.6 + Math.random() * 0.6,
        phase: Math.random() * Math.PI * 2,
        trail: [{ x: x + offsetX, y: y + offsetY }]
      })
    }
    particlesRef.current.push(...newParticles)
  }, [])

  useEffect(() => {
    const updateCanvasSize = () => {
      const canvas = canvasRef.current
      const container = containerRef.current
      if (!canvas || !container) return
      const rect = container.getBoundingClientRect()
      if (rect.width > 0 && rect.height > 0) {
        canvas.width = rect.width * dpr
        canvas.height = rect.height * dpr
        canvas.style.width = `${rect.width}px`
        canvas.style.height = `${rect.height}px`
        containerSizeRef.current = { width: rect.width, height: rect.height }
        const gridWidth = rect.width - GRID_PADDING.left - GRID_PADDING.right
        const gridHeight = rect.height - GRID_PADDING.top - GRID_PADDING.bottom
        const cellWidth = (gridWidth / GRID_COLS) * 0.9
        const cellHeight = cellWidth
        gridDimsRef.current = { cellWidth, cellHeight, gridWidth, gridHeight }
      }
    }
    updateCanvasSize()
    const timer = setTimeout(updateCanvasSize, 100)
    window.addEventListener('resize', updateCanvasSize)
    return () => { clearTimeout(timer); window.removeEventListener('resize', updateCanvasSize) }
  }, [dpr])

  const placeBlock = useCallback((absoluteGridX: number, absoluteGridY: number) => {
    const priceLineGridX = Math.floor(viewOffsetXRef.current / gridDimsRef.current.cellWidth) + GRID_COLS * PRICE_LINE_POSITION
    if (absoluteGridX < priceLineGridX) return false
    setBlocks(prev => {
      if (prev.some(b => b.gridX === absoluteGridX && b.gridY === absoluteGridY && b.status === 'pending')) return prev
      return prev
    })
    setBalance(prev => {
      if (prev < selectedBet) { addToast('Insufficient balance!', 'loss'); return prev }
      return prev - selectedBet
    })
    const distance = Math.abs((absoluteGridY + 0.5) - currentPriceYRef.current)
    const multiplier = getMultiplier(distance)
    const newBlock: Block = {
      id: `${Date.now()}-${Math.random()}`,
      gridX: absoluteGridX,
      gridY: absoluteGridY,
      multiplier,
      betSize: selectedBet,
      status: 'pending'
    }
    setBlocks(prev => [...prev, newBlock])
    return true
  }, [selectedBet, addToast])

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const width = containerSizeRef.current.width
    const height = containerSizeRef.current.height
    if (width <= 0 || height <= 0) return
    const { cellWidth, cellHeight, gridWidth, gridHeight } = gridDimsRef.current
    if (!cellWidth || !cellHeight) return
    const viewOffsetX = viewOffsetXRef.current
    const currentPriceY = currentPriceYRef.current
    const hoverCell = hoverCellRef.current
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.fillStyle = colors.gray0
    ctx.fillRect(0, 0, width, height)
    const scrollOffsetX = viewOffsetX % cellWidth
    const baseGridX = Math.floor(viewOffsetX / cellWidth)
    const yOffset = globalYOffsetRef.current
    const centerY = gridHeight / 2
    const scrollOffsetY = ((yOffset % cellHeight) + cellHeight) % cellHeight
    const baseGridY = Math.floor(yOffset / cellHeight)
    const visibleRows = Math.ceil(gridHeight / cellHeight) + 2

    for (let rowOffset = -2; rowOffset <= visibleRows; rowOffset++) {
      const absoluteGridY = baseGridY + rowOffset
      const rowCenterY = absoluteGridY + 0.5
      const distance = Math.abs(rowCenterY - currentPriceY)
      const multiplier = getMultiplier(distance)
      const y = GRID_PADDING.top + rowOffset * cellHeight - scrollOffsetY
      if (y + cellHeight < GRID_PADDING.top - 5 || y > GRID_PADDING.top + gridHeight + 5) continue
      for (let colOffset = -1; colOffset <= GRID_COLS; colOffset++) {
        const x = GRID_PADDING.left + colOffset * cellWidth - scrollOffsetX
        if (x + cellWidth < GRID_PADDING.left - 5 || x > GRID_PADDING.left + gridWidth + 5) continue
        const absoluteGridX = baseGridX + colOffset
        const blockInCell = blocks.find(b => b.gridX === absoluteGridX && b.gridY === absoluteGridY)
        // Fix hover detection: use absolute grid coordinates for consistent matching
        const isHovered = hoverCell && hoverCell.absoluteGridX === absoluteGridX && hoverCell.absoluteGridY === absoluteGridY && !blockInCell
        if (!blockInCell) {
          ctx.fillStyle = isHovered ? colors.blue : colors.gray10
          ctx.globalAlpha = isHovered ? 0.2 : 0.3
          ctx.fillRect(x + 2, y + 2, cellWidth - 4, cellHeight - 4)
          ctx.globalAlpha = 1
          if (isHovered) {
            ctx.strokeStyle = colors.blue
            ctx.lineWidth = 1
            ctx.globalAlpha = 0.6
            ctx.strokeRect(x + 2.5, y + 2.5, cellWidth - 5, cellHeight - 5)
            ctx.globalAlpha = 1
          }
          ctx.fillStyle = isHovered ? colors.gray60 : colors.gray30
          ctx.font = `${isHovered ? 'bold ' : ''}10px system-ui`
          ctx.textAlign = 'right'
          ctx.textBaseline = 'bottom'
          ctx.fillText(formatMultiplier(multiplier), x + cellWidth - 8, y + cellHeight - 6)
        } else {
          if (blockInCell.status === 'won') {
            ctx.fillStyle = colors.green
            ctx.fillRect(x + 2, y + 2, cellWidth - 4, cellHeight - 4)
            ctx.strokeStyle = colors.gray0
            ctx.lineWidth = 1
            ctx.globalAlpha = 0.2
            ctx.strokeRect(x + 2.5, y + 2.5, cellWidth - 5, cellHeight - 5)
            ctx.globalAlpha = 1
            ctx.fillStyle = colors.gray0
            ctx.font = 'bold 14px system-ui'
            ctx.textAlign = 'center'
            ctx.textBaseline = 'middle'
            ctx.fillText(`+$${(blockInCell.betSize * blockInCell.multiplier).toFixed(2)}`, x + cellWidth / 2, y + cellHeight / 2)
          } else if (blockInCell.status === 'lost') {
            ctx.fillStyle = colors.gray30
            ctx.globalAlpha = 0.3
            ctx.fillRect(x + 2, y + 2, cellWidth - 4, cellHeight - 4)
            ctx.globalAlpha = 1
          } else {
            ctx.fillStyle = colors.blue
            ctx.fillRect(x + 2, y + 2, cellWidth - 4, cellHeight - 4)
            ctx.strokeStyle = colors.gray0
            ctx.lineWidth = 1
            ctx.globalAlpha = 0.2
            ctx.strokeRect(x + 2.5, y + 2.5, cellWidth - 5, cellHeight - 5)
            ctx.globalAlpha = 1
            ctx.fillStyle = colors.gray0
            ctx.font = 'bold 14px system-ui'
            ctx.textAlign = 'center'
            ctx.textBaseline = 'middle'
            ctx.fillText(`$${blockInCell.betSize}`, x + cellWidth / 2, y + cellHeight / 2 - 8)
            ctx.globalAlpha = 0.8
            ctx.font = '10px system-ui'
            ctx.fillText(formatMultiplier(blockInCell.multiplier), x + cellWidth / 2, y + cellHeight / 2 + 8)
            ctx.globalAlpha = 1
          }
        }
      }
    }

    ctx.strokeStyle = colors.gray15
    ctx.lineWidth = 1
    for (let i = -1; i <= visibleRows + 1; i++) {
      const y = GRID_PADDING.top + i * cellHeight - scrollOffsetY
      if (y < GRID_PADDING.top - 5 || y > GRID_PADDING.top + gridHeight + 5) continue
      ctx.beginPath()
      ctx.moveTo(GRID_PADDING.left, y)
      ctx.lineTo(GRID_PADDING.left + gridWidth, y)
      ctx.stroke()
    }
    for (let colOffset = 0; colOffset <= GRID_COLS + 1; colOffset++) {
      const x = GRID_PADDING.left + colOffset * cellWidth - scrollOffsetX
      if (x < GRID_PADDING.left - 5 || x > GRID_PADDING.left + gridWidth + 5) continue
      ctx.beginPath()
      ctx.moveTo(x, GRID_PADDING.top)
      ctx.lineTo(x, GRID_PADDING.top + gridHeight)
      ctx.stroke()
    }

    particlesRef.current = particlesRef.current.filter(p => {
      const lifeRatio = p.life / p.maxLife
      const speedMultiplier = easeOutExpo(lifeRatio)
      const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy)
      if (speed > 0.1) {
        const perpX = -p.vy / speed
        const perpY = p.vx / speed
        const waveForce = Math.sin(p.phase) * p.waveAmp
        p.vx += perpX * waveForce
        p.vy += perpY * waveForce
        p.phase += p.waveFreq
      }
      p.x += p.vx * speedMultiplier
      p.y += p.vy * speedMultiplier
      p.vy += 0.04
      p.life -= 0.03
      p.trail.push({ x: p.x, y: p.y })
      if (p.trail.length > 18) p.trail = p.trail.slice(-18)
      if (p.life > 0 && p.trail.length >= 2) {
        ctx.save()
        ctx.lineCap = 'round'
        ctx.lineJoin = 'round'
        ctx.beginPath()
        ctx.moveTo(p.trail[0].x, p.trail[0].y)
        for (let i = 1; i < p.trail.length - 1; i++) {
          const curr = p.trail[i]
          const next = p.trail[i + 1]
          const cpx = curr.x + (next.x - p.trail[i - 1].x) * 0.5
          const cpy = curr.y + (next.y - p.trail[i - 1].y) * 0.5
          ctx.quadraticCurveTo(curr.x, curr.y, cpx, cpy)
        }
        const last = p.trail[p.trail.length - 1]
        ctx.lineTo(last.x, last.y)
        ctx.strokeStyle = colors.blue
        ctx.lineWidth = p.size * lifeRatio
        ctx.globalAlpha = lifeRatio * 0.85
        ctx.stroke()
        ctx.restore()
        return true
      }
      return false
    })

    const headX = GRID_PADDING.left + gridWidth * PRICE_LINE_POSITION
    const headY = GRID_PADDING.top + centerY
    const trail = priceTrailRef.current
    const maxTrailLength = gridWidth * PRICE_LINE_POSITION
    if (trail.length > 1) {
      ctx.save()
      ctx.lineCap = 'round'
      ctx.lineJoin = 'round'
      ctx.strokeStyle = colors.blue
      ctx.lineWidth = 2.5
      for (let i = 1; i < trail.length; i++) {
        const prev = trail[i - 1]
        const curr = trail[i]
        const prevX = headX - prev.age
        const currX = headX - curr.age
        const prevY = GRID_PADDING.top + centerY + (prev.y - currentPriceY) * cellHeight
        const currY = GRID_PADDING.top + centerY + (curr.y - currentPriceY) * cellHeight
        if (currX < GRID_PADDING.left) continue
        if (prevX > headX) continue
        const fadeRatio = Math.min(1, curr.age / maxTrailLength)
        const alpha = 1 - fadeRatio * fadeRatio
        if (alpha <= 0) continue
        ctx.beginPath()
        ctx.moveTo(Math.max(GRID_PADDING.left, prevX), prevY)
        ctx.lineTo(Math.max(GRID_PADDING.left, currX), currY)
        ctx.globalAlpha = alpha
        ctx.stroke()
      }
      ctx.restore()
    }

    ctx.strokeStyle = colors.blue
    ctx.lineWidth = 2
    ctx.globalAlpha = 0.2
    ctx.beginPath()
    ctx.moveTo(headX, GRID_PADDING.top)
    ctx.lineTo(headX, GRID_PADDING.top + gridHeight)
    ctx.stroke()
    ctx.globalAlpha = 1
    ctx.shadowColor = colors.blue
    ctx.shadowBlur = 15
    ctx.fillStyle = colors.blue
    ctx.beginPath()
    ctx.arc(headX, headY, 6, 0, Math.PI * 2)
    ctx.fill()
    ctx.shadowBlur = 0
    ctx.strokeStyle = colors.blue
    ctx.lineWidth = 2
    ctx.globalAlpha = 0.4
    ctx.beginPath()
    ctx.arc(headX, headY, 10, 0, Math.PI * 2)
    ctx.stroke()
    ctx.globalAlpha = 1
  }, [blocks, dpr])

  useEffect(() => {
    const animate = (timestamp: number) => {
      if (!lastTimeRef.current) lastTimeRef.current = timestamp
      const delta = Math.min(timestamp - lastTimeRef.current, 50)
      lastTimeRef.current = timestamp
      const { cellWidth, gridWidth } = gridDimsRef.current
      viewOffsetXRef.current += 0.04 * delta
      const time = timestamp * 0.001
      const movement = Math.sin(time * 1.2) * 0.008 + Math.sin(time * 2.5) * 0.004 + Math.sin(time * 0.7) * 0.006
      if (Math.random() > 0.98) priceVelocityRef.current += (Math.random() - 0.5) * 0.01
      priceVelocityRef.current *= 0.95
      priceVelocityRef.current = Math.max(-0.02, Math.min(0.02, priceVelocityRef.current))
      currentPriceYRef.current += movement + priceVelocityRef.current
      const cellHeight = gridDimsRef.current.cellHeight
      const priceYOffset = (currentPriceYRef.current - GRID_ROWS / 2) * cellHeight
      globalYOffsetRef.current = priceYOffset
      priceTrailRef.current.forEach(p => p.age += 0.04 * delta)
      priceTrailRef.current.unshift({ y: currentPriceYRef.current, age: 0 })
      const maxTrailAge = gridWidth * PRICE_LINE_POSITION + 50
      priceTrailRef.current = priceTrailRef.current.filter(p => p.age < maxTrailAge)
      const baseGridX = Math.floor(viewOffsetXRef.current / cellWidth)
      const priceLineGridX = baseGridX + GRID_COLS * PRICE_LINE_POSITION
      const currentY = currentPriceYRef.current
      setBlocks(prevBlocks => prevBlocks.map(block => {
        if (block.status !== 'pending') return block
        if (priceLineGridX >= block.gridX && priceLineGridX <= block.gridX + 1) {
          const distance = Math.abs(currentY - (block.gridY + 0.5))
          const winChance = Math.max(0.05, 1 - distance * 0.25)
          const isWin = Math.random() < winChance && distance <= 1
          if (isWin) {
            const winAmount = block.betSize * block.multiplier
            setBalance(b => b + winAmount)
            addToast(`+$${winAmount.toFixed(2)}`, 'win')
            spawnParticles(GRID_PADDING.left + gridWidth * PRICE_LINE_POSITION, GRID_PADDING.top + gridDimsRef.current.gridHeight / 2)
            return { ...block, status: 'won' as const }
          } else {
            addToast(`-$${block.betSize.toFixed(2)}`, 'loss')
            return { ...block, status: 'lost' as const }
          }
        }
        return block
      }))
      draw()
      animationRef.current = requestAnimationFrame(animate)
    }
    animationRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(animationRef.current)
  }, [draw, addToast, spawnParticles])

  const handleMouseDown = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const clickX = e.clientX - rect.left
    const clickY = e.clientY - rect.top
    const { cellWidth, cellHeight, gridHeight } = gridDimsRef.current
    if (!cellWidth || !cellHeight) return
    const yOffset = globalYOffsetRef.current
    const scrollOffsetY = ((yOffset % cellHeight) + cellHeight) % cellHeight
    const baseGridY = Math.floor(yOffset / cellHeight)
    const scrollOffsetX = viewOffsetXRef.current % cellWidth
    const baseGridX = Math.floor(viewOffsetXRef.current / cellWidth)
    const colOffset = Math.floor((clickX - GRID_PADDING.left + scrollOffsetX) / cellWidth)
    // Fix hitbox: the grid scrolls with globalYOffset, so we need to account for that
    // Cells are drawn at: GRID_PADDING.top + rowOffset * cellHeight - scrollOffsetY
    // To find which cell the mouse is over, we solve for rowOffset:
    // mouseY = GRID_PADDING.top + rowOffset * cellHeight - scrollOffsetY
    // rowOffset = (mouseY - GRID_PADDING.top + scrollOffsetY) / cellHeight
    const rowOffset = Math.floor((clickY - GRID_PADDING.top + scrollOffsetY) / cellHeight)
    // Check if click is within grid bounds
    const isInGrid = clickY >= GRID_PADDING.top && clickY <= GRID_PADDING.top + gridHeight
    if (colOffset < 0 || colOffset >= GRID_COLS || !isInGrid) return
    // Calculate absolute grid coordinates - these should match how we draw cells
    const absoluteGridX = baseGridX + colOffset
    const absoluteGridY = baseGridY + rowOffset
    const priceLineGridX = baseGridX + GRID_COLS * PRICE_LINE_POSITION
    if (absoluteGridX < priceLineGridX) { addToast('Place bets ahead of the line!', 'loss'); return }
    if (balance < selectedBet) { addToast('Insufficient balance!', 'loss'); return }
    isDraggingRef.current = true
    const success = placeBlock(absoluteGridX, absoluteGridY)
    if (success) {
      lastPlacedCellRef.current = { gridX: absoluteGridX, gridY: absoluteGridY }
      const clickScreenX = GRID_PADDING.left + colOffset * cellWidth - scrollOffsetX + cellWidth / 2
      const clickScreenY = GRID_PADDING.top + rowOffset * cellHeight - scrollOffsetY + cellHeight / 2
      spawnParticles(clickScreenX, clickScreenY)
    }
  }, [balance, selectedBet, addToast, placeBlock, spawnParticles])

  const handleMouseMove = useCallback((e: React.MouseEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return
    const rect = canvas.getBoundingClientRect()
    const mouseX = e.clientX - rect.left
    const mouseY = e.clientY - rect.top
    const { cellWidth, cellHeight, gridHeight } = gridDimsRef.current
    if (!cellWidth || !cellHeight) return
    const yOffset = globalYOffsetRef.current
    const scrollOffsetY = ((yOffset % cellHeight) + cellHeight) % cellHeight
    const baseGridY = Math.floor(yOffset / cellHeight)
    const scrollOffsetX = viewOffsetXRef.current % cellWidth
    const colOffset = Math.floor((mouseX - GRID_PADDING.left + scrollOffsetX) / cellWidth)
    // Fix hitbox: subtract scrollOffsetY since cells are drawn with -scrollOffsetY
    const rowOffset = Math.floor((mouseY - GRID_PADDING.top + scrollOffsetY) / cellHeight)
    // Check if mouse is within grid bounds
    const isInGrid = mouseY >= GRID_PADDING.top && mouseY <= GRID_PADDING.top + gridHeight
    if (colOffset >= 0 && colOffset < GRID_COLS && isInGrid) {
      // Store absolute grid coordinates for consistent hover detection
      const absoluteGridX = Math.floor(viewOffsetXRef.current / cellWidth) + colOffset
      const absoluteGridY = Math.floor(yOffset / cellHeight) + rowOffset
      hoverCellRef.current = { col: colOffset, row: rowOffset, absoluteGridX, absoluteGridY }
    } else {
      hoverCellRef.current = null
    }
    if (isDraggingRef.current && balance >= selectedBet) {
      const baseGridX = Math.floor(viewOffsetXRef.current / cellWidth)
      const absoluteGridX = baseGridX + colOffset
      const absoluteGridY = baseGridY + rowOffset
      const priceLineGridX = baseGridX + GRID_COLS * PRICE_LINE_POSITION
      if (colOffset >= 0 && colOffset < GRID_COLS && absoluteGridX >= priceLineGridX && isInGrid) {
        if (!lastPlacedCellRef.current || lastPlacedCellRef.current.gridX !== absoluteGridX || lastPlacedCellRef.current.gridY !== absoluteGridY) {
          const success = placeBlock(absoluteGridX, absoluteGridY)
          if (success) {
            lastPlacedCellRef.current = { gridX: absoluteGridX, gridY: absoluteGridY }
            const clickScreenX = GRID_PADDING.left + colOffset * cellWidth - scrollOffsetX + cellWidth / 2
            const clickScreenY = GRID_PADDING.top + rowOffset * cellHeight - scrollOffsetY + cellHeight / 2
            spawnParticles(clickScreenX, clickScreenY)
          }
        }
      }
    }
  }, [balance, selectedBet, placeBlock, spawnParticles])

  const handleMouseUp = useCallback(() => {
    isDraggingRef.current = false
    lastPlacedCellRef.current = null
  }, [])

  const handleMouseLeave = useCallback(() => {
    hoverCellRef.current = null
    isDraggingRef.current = false
    lastPlacedCellRef.current = null
  }, [])

  useEffect(() => {
    const cleanup = setInterval(() => {
      const { cellWidth } = gridDimsRef.current
      if (!cellWidth) return
      const priceLineGridX = viewOffsetXRef.current / cellWidth + GRID_COLS * PRICE_LINE_POSITION
      setBlocks(prev => prev.filter(b => b.gridX > priceLineGridX - 10 || b.status !== 'pending'))
    }, 2000)
    return () => clearInterval(cleanup)
  }, [])

  return (
    <div className="min-h-screen flex flex-col" style={{ backgroundColor: colors.gray0 }}>
      <header className="flex items-center justify-between px-4 py-3 border-b shrink-0" style={{ borderColor: colors.gray15 }}>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 rounded-lg flex items-center justify-center" style={{ backgroundColor: colors.blue }}>
            <span className="text-white font-bold text-sm">TT</span>
          </div>
          <span className="font-bold text-lg" style={{ color: colors.gray100 }}>TapTrade</span>
        </div>
        <div className="flex items-center gap-4">
          <div className="text-right">
            <div className="text-xs" style={{ color: colors.gray50 }}>Balance</div>
            <div className="font-bold text-lg" style={{ color: colors.gray100 }}>${balance.toFixed(2)}</div>
          </div>
        </div>
      </header>
      <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 pointer-events-none">
        <AnimatePresence mode="popLayout">
          {toasts.map(toast => (
            <motion.div key={toast.id} layout initial={{ opacity: 0, y: -10, scale: 0.95 }} animate={{ opacity: 1, y: 0, scale: 1 }} exit={{ opacity: 0, y: -10, scale: 0.95 }} transition={{ duration: 0.15 }} className="px-4 py-2 rounded-lg font-bold text-white shadow-lg" style={{ backgroundColor: toast.type === 'win' ? colors.green : colors.red }}>
              {toast.message}
            </motion.div>
          ))}
        </AnimatePresence>
      </div>
      <div ref={containerRef} className="flex-1 relative" style={{ minHeight: '400px' }}>
        <canvas ref={canvasRef} className="absolute inset-0 w-full h-full cursor-pointer" onMouseDown={handleMouseDown} onMouseMove={handleMouseMove} onMouseUp={handleMouseUp} onMouseLeave={handleMouseLeave} style={{ touchAction: 'none' }} />
        {blocks.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center p-6 rounded-xl shadow-lg" style={{ backgroundColor: 'rgba(255,255,255,0.95)' }}>
              <div className="font-bold text-lg mb-1" style={{ color: colors.gray100 }}>Tap or drag to place bets</div>
              <div className="text-sm" style={{ color: colors.gray50 }}>Further from price = Higher multiplier</div>
            </div>
          </div>
        )}
      </div>
      <div className="border-t px-4 py-4 shrink-0" style={{ borderColor: colors.gray15, backgroundColor: colors.gray0 }}>
        <div className="flex items-center justify-center gap-4 max-w-lg mx-auto">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium" style={{ color: colors.gray60 }}>Bet:</span>
            <div className="flex gap-1">
              {BET_SIZES.map(size => (
                <button key={size} onClick={() => setSelectedBet(size)} className="px-3 py-2 rounded-lg font-bold text-sm transition-all" style={{ backgroundColor: selectedBet === size ? colors.blue : colors.gray10, color: selectedBet === size ? colors.gray0 : colors.gray60 }}>
                  ${size}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>
      <footer className="text-center py-2 text-xs shrink-0" style={{ color: colors.gray30 }}>
        Simulated trading for demonstration purposes
      </footer>
    </div>
  )
}
