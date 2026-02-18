'use client'

import { useState, useRef, useEffect, useCallback, useMemo } from 'react'

// Blue Sky Theme Colors
const colors = {
  blue: '#0052ff',
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
const GRID_COLS = 5
// Cap cell size so desktop sees same-size cells as mobile (more columns visible instead of bigger cells)
const MAX_CELL_SIZE = 90

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

// Exponential ease-out: explosive start, dramatic slowdown
const easeOutExpo = (t: number): number => {
  const d = 1 - t
  return 1 - d * d * d * d * d * d * d * d * d * d
}

interface Block {
  id: string
  gridX: number
  gridY: number
  multiplier: number
  betSize: number
  status: 'pending' | 'won' | 'lost'
  lostAt?: number
  createdAt?: number
}

interface Toast {
  id: string
  message: string
  type: 'win' | 'loss'
}

// === NEW PARTICLE SYSTEM ===
interface Particle {
  x: number
  y: number
  vx: number
  vy: number
  life: number
  maxLife: number
  size: number
  type: 'comet' | 'spark' | 'ember'
  // Comet-specific: trail + wave
  trail: { x: number; y: number }[]
  waveFreq: number
  waveAmp: number
  phase: number
  // Color: hue shift (0 = deep blue, 0.5 = cerulean, 1 = white)
  hue: number
  gravity: number
}

// Impact flash/shockwave rendered separately
interface ImpactEffect {
  x: number
  y: number
  startTime: number
}

const STARTING_BALANCE = 1000

export default function TapTrade() {
  const canvasRef = useRef<HTMLCanvasElement>(null)
  const containerRef = useRef<HTMLDivElement>(null)
  const shareCardRef = useRef<HTMLCanvasElement>(null)
  const previewCanvasRef = useRef<HTMLCanvasElement>(null)
  const [balance, setBalance] = useState(STARTING_BALANCE)
  const [selectedBet, setSelectedBet] = useState(5)
  const [blocks, setBlocks] = useState<Block[]>([])
  const [toasts, setToasts] = useState<Toast[]>([])
  const [totalWins, setTotalWins] = useState(0)
  const [totalLosses, setTotalLosses] = useState(0)
  const [totalWagered, setTotalWagered] = useState(0)
  const [totalWonAmount, setTotalWonAmount] = useState(0)
  const [showShareCard, setShowShareCard] = useState(false)
  const [shareTheme, setShareTheme] = useState<'light' | 'dark'>('light')
  
  const viewOffsetXRef = useRef(0)
  const currentPriceYRef = useRef(GRID_ROWS / 2)
  const containerSizeRef = useRef({ width: 0, height: 0 })
  const animationRef = useRef<number>(0)
  const lastTimeRef = useRef(0)
  const particlesRef = useRef<Particle[]>([])
  const impactEffectsRef = useRef<ImpactEffect[]>([])
  const priceVelocityRef = useRef(0)
  const priceTrailRef = useRef<{ y: number; age: number }[]>([])
  const gridDimsRef = useRef({ cellWidth: 0, cellHeight: 0, gridWidth: 0, gridHeight: 0, gridLeft: 20, visibleCols: 8 })
  const globalYOffsetRef = useRef(0)
  const hoverCellRef = useRef<{ col: number; row: number; absoluteGridX: number; absoluteGridY: number } | null>(null)
  const isDraggingRef = useRef(false)
  const lastPlacedCellRef = useRef<{ gridX: number; gridY: number } | null>(null)
  const blocksRef = useRef<Block[]>([])

  const GRID_PADDING = { top: 20, right: 20, bottom: 20, left: 20 }
  const PRICE_LINE_POSITION = 0.4
  const dpr = typeof window !== 'undefined' ? window.devicePixelRatio : 1

  useEffect(() => { blocksRef.current = blocks }, [blocks])

  const addToast = useCallback((message: string, type: 'win' | 'loss') => {
    const id = `${Date.now()}-${Math.random()}`
    setToasts(prev => [...prev, { id, message, type }].slice(-3))
    setTimeout(() => setToasts(prev => prev.filter(t => t.id !== id)), 1500)
  }, [])

  // === EXPLOSION (optimised: no shadowBlur, reduced counts) ===
  const spawnExplosion = useCallback((x: number, y: number) => {
    impactEffectsRef.current.push({ x, y, startTime: performance.now() })
    const particles: Particle[] = []

    // COMETS — 6 main streaks (reduced for mobile)
    const comets = 6
    for (let i = 0; i < comets; i++) {
      const angle = (Math.PI * 2 * i) / comets + (Math.random() - 0.5) * 0.4
      const speed = 3 + Math.random() * 3
      const life = 0.4 + Math.random() * 0.3
      particles.push({
        x: x + (Math.random() - 0.5) * 4,
        y: y + (Math.random() - 0.5) * 4,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life, maxLife: life,
        size: 2.5 + Math.random() * 2,
        type: 'comet',
        trail: [{ x, y }],
        waveFreq: 0.2 + Math.random() * 0.2,
        waveAmp: 0.2 + Math.random() * 0.2,
        phase: Math.random() * Math.PI * 2,
        hue: 1.0,
        gravity: 0.03 + Math.random() * 0.02,
      })
    }

    // SPARKS — 12 tiny dots
    for (let i = 0; i < 12; i++) {
      const angle = Math.random() * Math.PI * 2
      const speed = 4 + Math.random() * 6
      const life = 0.15 + Math.random() * 0.2
      particles.push({
        x: x + (Math.random() - 0.5) * 6,
        y: y + (Math.random() - 0.5) * 6,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed,
        life, maxLife: life,
        size: 1.5 + Math.random() * 1.5,
        type: 'spark',
        trail: [],
        waveFreq: 0, waveAmp: 0, phase: 0,
        hue: 1.0,
        gravity: 0.02,
      })
    }

    // EMBERS — 5 gentle arcs
    for (let i = 0; i < 5; i++) {
      const angle = Math.random() * Math.PI * 2
      const speed = 1.5 + Math.random() * 2.5
      const life = 0.5 + Math.random() * 0.4
      particles.push({
        x: x + (Math.random() - 0.5) * 8,
        y: y + (Math.random() - 0.5) * 8,
        vx: Math.cos(angle) * speed,
        vy: Math.sin(angle) * speed - 0.8,
        life, maxLife: life,
        size: 2 + Math.random() * 1.5,
        type: 'ember',
        trail: [{ x, y }],
        waveFreq: 0.1 + Math.random() * 0.1,
        waveAmp: 0.1 + Math.random() * 0.1,
        phase: Math.random() * Math.PI * 2,
        hue: 1.0,
        gravity: 0.04 + Math.random() * 0.03,
      })
    }

    particlesRef.current.push(...particles)
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
        // Cap cell size to MAX_CELL_SIZE — on desktop, show more columns instead of bigger cells
        const idealCellWidth = (gridWidth / GRID_COLS) * 0.9
        const cellWidth = Math.min(idealCellWidth, MAX_CELL_SIZE)
        const cellHeight = cellWidth
        const visibleCols = Math.ceil(gridWidth / cellWidth) + 2
        gridDimsRef.current = { cellWidth, cellHeight, gridWidth, gridHeight, gridLeft: GRID_PADDING.left, visibleCols }
      }
    }
    updateCanvasSize()
    const timer = setTimeout(updateCanvasSize, 100)
    window.addEventListener('resize', updateCanvasSize)
    return () => { clearTimeout(timer); window.removeEventListener('resize', updateCanvasSize) }
  }, [dpr, GRID_PADDING.left, GRID_PADDING.right, GRID_PADDING.top, GRID_PADDING.bottom])

  const placeBlock = useCallback((absoluteGridX: number, absoluteGridY: number) => {
    const priceLineGridX = (viewOffsetXRef.current + gridDimsRef.current.gridWidth * PRICE_LINE_POSITION) / gridDimsRef.current.cellWidth
    if (absoluteGridX < priceLineGridX) return false
    if (blocksRef.current.some(b => b.gridX === absoluteGridX && b.gridY === absoluteGridY && b.status === 'pending')) return false
    
    const currentBalance = balance
    if (currentBalance < selectedBet) { addToast('Insufficient balance!', 'loss'); return false }
    
    setBalance(prev => prev < selectedBet ? prev : prev - selectedBet)
    setTotalWagered(prev => prev + selectedBet)
    
    const distance = Math.abs((absoluteGridY + 0.5) - currentPriceYRef.current)
    const multiplier = getMultiplier(distance)
    setBlocks(prev => [...prev, {
      id: `${Date.now()}-${Math.random()}`,
      gridX: absoluteGridX,
      gridY: absoluteGridY,
      multiplier,
      betSize: selectedBet,
      status: 'pending',
      createdAt: performance.now()
    }])
    return true
  }, [selectedBet, addToast, balance])

  // === Helper: get white particle color ===
  const getParticleColor = (_hue: number, alpha: number): string => {
    return `rgba(255, 255, 255, ${alpha})`
  }

  const draw = useCallback(() => {
    const canvas = canvasRef.current
    if (!canvas) return
    const ctx = canvas.getContext('2d')
    if (!ctx) return
    const width = containerSizeRef.current.width
    const height = containerSizeRef.current.height
    if (width <= 0 || height <= 0) return
    const { cellWidth, cellHeight, gridWidth, gridHeight, gridLeft, visibleCols } = gridDimsRef.current
    if (!cellWidth || !cellHeight) return
    const viewOffsetX = viewOffsetXRef.current
    const currentPriceY = currentPriceYRef.current
    const hoverCell = hoverCellRef.current
    const currentBlocks = blocksRef.current

    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    ctx.fillStyle = colors.gray0
    ctx.fillRect(0, 0, width, height)

    const scrollOffsetX = viewOffsetX % cellWidth
    const baseGridX = Math.floor(viewOffsetX / cellWidth)
    const yOffset = globalYOffsetRef.current
    const scrollOffsetY = ((yOffset % cellHeight) + cellHeight) % cellHeight
    const baseGridY = Math.floor(yOffset / cellHeight)
    const visibleRows = Math.ceil(gridHeight / cellHeight) + 2

    // Draw grid cells
    for (let rowOffset = -2; rowOffset <= visibleRows; rowOffset++) {
      const absoluteGridY = baseGridY + rowOffset
      const rowCenterY = absoluteGridY + 0.5
      const distance = Math.abs(rowCenterY - currentPriceY)
      const multiplier = getMultiplier(distance)
      const y = GRID_PADDING.top + rowOffset * cellHeight - scrollOffsetY
      if (y + cellHeight < GRID_PADDING.top - 5 || y > GRID_PADDING.top + gridHeight + 5) continue
      for (let colOffset = -1; colOffset <= visibleCols; colOffset++) {
        const x = gridLeft + colOffset * cellWidth - scrollOffsetX
        if (x + cellWidth < gridLeft - 5 || x > gridLeft + gridWidth + 5) continue
        const absoluteGridX = baseGridX + colOffset
        const blockInCell = currentBlocks.find(b => b.gridX === absoluteGridX && b.gridY === absoluteGridY)
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
            // Morph from blue to grey over 600ms
            const LOSS_MORPH_DURATION = 600
            const elapsed = blockInCell.lostAt ? performance.now() - blockInCell.lostAt : LOSS_MORPH_DURATION
            const t = Math.min(1, elapsed / LOSS_MORPH_DURATION)
            // Ease-out cubic
            const ease = 1 - (1 - t) * (1 - t) * (1 - t)
            // Lerp color: blue (#0052ff) -> gray30 (#b1b7c3)
            const r = Math.round(0 + (177 - 0) * ease)
            const g = Math.round(82 + (183 - 82) * ease)
            const b = Math.round(255 + (195 - 255) * ease)
            ctx.fillStyle = `rgb(${r}, ${g}, ${b})`
            // Lerp opacity: 1.0 -> 0.3
            ctx.globalAlpha = 1.0 - 0.7 * ease
            ctx.fillRect(x + 2, y + 2, cellWidth - 4, cellHeight - 4)
            // Fade out the text during morph
            if (ease < 0.8) {
              ctx.fillStyle = colors.gray0
              ctx.globalAlpha = (1 - ease / 0.8) * 0.9
              ctx.font = 'bold 14px system-ui'
              ctx.textAlign = 'center'
              ctx.textBaseline = 'middle'
              ctx.fillText(`$${blockInCell.betSize}`, x + cellWidth / 2, y + cellHeight / 2)
            }
            ctx.globalAlpha = 1
          } else {
            // New block morphing: Circle -> Square
            const MORPH_DURATION = 900
            const age = performance.now() - (blockInCell.createdAt || 0)
            let radius = 0
            
            if (age < MORPH_DURATION) {
              const t = age / MORPH_DURATION
              const maxRadius = Math.min(cellWidth, cellHeight) / 2 - 2
              // Ease out expo: 1 -> 0
              // radius starts at max, quickly becomes 0
              radius = maxRadius * (1 - easeOutExpo(t))
            }
            
            ctx.fillStyle = colors.blue
            ctx.beginPath()
            if (radius > 0.5) {
              ctx.roundRect(x + 2, y + 2, cellWidth - 4, cellHeight - 4, radius)
            } else {
              ctx.rect(x + 2, y + 2, cellWidth - 4, cellHeight - 4)
            }
            ctx.fill()
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

    // Draw grid lines
    ctx.strokeStyle = colors.gray15
    ctx.lineWidth = 1
    for (let i = -1; i <= visibleRows + 1; i++) {
      const y = GRID_PADDING.top + i * cellHeight - scrollOffsetY
      if (y < GRID_PADDING.top - 5 || y > GRID_PADDING.top + gridHeight + 5) continue
      ctx.beginPath()
      ctx.moveTo(gridLeft, y)
      ctx.lineTo(gridLeft + gridWidth, y)
      ctx.stroke()
    }
    for (let colOffset = 0; colOffset <= visibleCols + 1; colOffset++) {
      const x = gridLeft + colOffset * cellWidth - scrollOffsetX
      if (x < gridLeft - 5 || x > gridLeft + gridWidth + 5) continue
      ctx.beginPath()
      ctx.moveTo(x, GRID_PADDING.top)
      ctx.lineTo(x, GRID_PADDING.top + gridHeight)
      ctx.stroke()
    }

    // IMPACT EFFECTS: flash + shockwave ring (tight radius)
    const now = performance.now()
    impactEffectsRef.current = impactEffectsRef.current.filter(impact => {
      const elapsed = now - impact.startTime
      if (elapsed > 250) return false

      ctx.save()

      // White flash bloom (0–80ms)
      if (elapsed < 80) {
        const t = elapsed / 80
        const radius = t * 40 // increased bloom radius
        const alpha = (1 - t) * 0.9 // increased bloom opacity
        const gradient = ctx.createRadialGradient(impact.x, impact.y, 0, impact.x, impact.y, radius)
        gradient.addColorStop(0, `rgba(255, 255, 255, ${alpha})`)
        gradient.addColorStop(0.3, `rgba(230, 240, 255, ${alpha * 0.7})`)
        gradient.addColorStop(0.7, `rgba(255, 255, 255, ${alpha * 0.2})`)
        gradient.addColorStop(1, `rgba(255, 255, 255, 0)`)
        ctx.fillStyle = gradient
        ctx.beginPath()
        ctx.arc(impact.x, impact.y, radius, 0, Math.PI * 2)
        ctx.fill()
      }

      // Shockwave ring (10–220ms)
      if (elapsed > 10 && elapsed < 220) {
        const t = (elapsed - 10) / 210
        const ringRadius = 4 + t * 45 // larger ring
        const ringAlpha = (1 - t * t) * 0.8
        ctx.strokeStyle = `rgba(255, 255, 255, ${ringAlpha})`
        ctx.lineWidth = (1 - t) * 4 + 1 // thicker line
        ctx.beginPath()
        ctx.arc(impact.x, impact.y, ringRadius, 0, Math.PI * 2)
        ctx.stroke()
      }

      // Second ring (50–240ms)
      if (elapsed > 50 && elapsed < 240) {
        const t = (elapsed - 50) / 190
        const ringRadius = 2 + t * 30
        const ringAlpha = (1 - t * t) * 0.5
        ctx.strokeStyle = `rgba(220, 235, 255, ${ringAlpha})`
        ctx.lineWidth = (1 - t) * 3
        ctx.beginPath()
        ctx.arc(impact.x, impact.y, ringRadius, 0, Math.PI * 2)
        ctx.stroke()
      }

      ctx.restore()
      return true
    })

    // ============================================================
    // PARTICLES: comets, sparks, embers (NO shadowBlur — use layered circles for glow)
    // ============================================================
    particlesRef.current = particlesRef.current.filter(p => {
      const lifeRatio = p.life / p.maxLife

      // Early exit for nearly-dead particles
      if (lifeRatio < 0.03) { p.life = 0; return false }

      // Physics update
      if (p.type === 'comet' || p.type === 'ember') {
        const speedMultiplier = easeOutExpo(lifeRatio)
        const speed = Math.sqrt(p.vx * p.vx + p.vy * p.vy)
        if (speed > 0.1 && p.waveAmp > 0) {
          const perpX = -p.vy / speed
          const perpY = p.vx / speed
          p.vx += perpX * Math.sin(p.phase) * p.waveAmp
          p.vy += perpY * Math.sin(p.phase) * p.waveAmp
          p.phase += p.waveFreq
        }
        p.x += p.vx * speedMultiplier
        p.y += p.vy * speedMultiplier
      } else {
        // Sparks: linear motion, no easing
        p.x += p.vx
        p.y += p.vy
        p.vx *= 0.92 // friction
        p.vy *= 0.92
      }

      p.vy += p.gravity
      p.life -= 0.02

      if (p.life <= 0) return false

      if (p.type === 'comet') {
        // Track trail (capped at 12)
        p.trail.push({ x: p.x, y: p.y })
        if (p.trail.length > 12) p.trail = p.trail.slice(-12)

        // Draw trail as a single batched path per width-band (3 bands instead of per-segment)
        if (p.trail.length >= 2) {
          ctx.lineCap = 'round'
          ctx.lineJoin = 'round'
          const len = p.trail.length
          // Draw in 2 bands: thin tail, thick head
          const mid = Math.floor(len / 2)
          // Tail band
          if (mid > 1) {
            ctx.beginPath()
            ctx.moveTo(p.trail[0].x, p.trail[0].y)
            for (let i = 1; i < mid; i++) {
              ctx.lineTo(p.trail[i].x, p.trail[i].y)
            }
            ctx.strokeStyle = `rgba(255,255,255,${lifeRatio * 0.25})`
            ctx.lineWidth = p.size * lifeRatio * 0.6
            ctx.stroke()
          }
          // Head band
          ctx.beginPath()
          ctx.moveTo(p.trail[mid].x, p.trail[mid].y)
          for (let i = mid + 1; i < len; i++) {
            ctx.lineTo(p.trail[i].x, p.trail[i].y)
          }
          ctx.strokeStyle = `rgba(255,255,255,${lifeRatio * 0.6})`
          ctx.lineWidth = p.size * lifeRatio * 1.4
          ctx.stroke()
        }

        // HEAD: layered circles instead of shadowBlur
        const headAlpha = lifeRatio * 0.95
        const headSize = p.size * Math.min(1.2, lifeRatio * 2)
        // Outer glow layer (cheap fake bloom)
        ctx.globalAlpha = headAlpha * 0.15
        ctx.fillStyle = 'white'
        ctx.beginPath()
        ctx.arc(p.x, p.y, headSize * 4, 0, Math.PI * 2)
        ctx.fill()
        // Mid glow layer
        ctx.globalAlpha = headAlpha * 0.35
        ctx.beginPath()
        ctx.arc(p.x, p.y, headSize * 2, 0, Math.PI * 2)
        ctx.fill()
        // Core
        ctx.globalAlpha = headAlpha
        ctx.beginPath()
        ctx.arc(p.x, p.y, headSize, 0, Math.PI * 2)
        ctx.fill()
        // White-hot center
        ctx.globalAlpha = headAlpha * 0.8
        ctx.beginPath()
        ctx.arc(p.x, p.y, headSize * 0.4, 0, Math.PI * 2)
        ctx.fill()
        ctx.globalAlpha = 1

      } else if (p.type === 'spark') {
        const sparkAlpha = lifeRatio
        const sparkSize = p.size * lifeRatio
        // Glow layer (single extra circle instead of shadowBlur)
        ctx.globalAlpha = sparkAlpha * 0.2
        ctx.fillStyle = 'white'
        ctx.beginPath()
        ctx.arc(p.x, p.y, sparkSize * 3, 0, Math.PI * 2)
        ctx.fill()
        // Core
        ctx.globalAlpha = sparkAlpha
        ctx.beginPath()
        ctx.arc(p.x, p.y, sparkSize, 0, Math.PI * 2)
        ctx.fill()
        ctx.globalAlpha = 1

      } else if (p.type === 'ember') {
        // Trail (capped at 6)
        p.trail.push({ x: p.x, y: p.y })
        if (p.trail.length > 6) p.trail = p.trail.slice(-6)

        // Single batched trail path
        if (p.trail.length >= 2) {
          ctx.lineCap = 'round'
          ctx.beginPath()
          ctx.moveTo(p.trail[0].x, p.trail[0].y)
          for (let i = 1; i < p.trail.length; i++) {
            ctx.lineTo(p.trail[i].x, p.trail[i].y)
          }
          ctx.strokeStyle = `rgba(255,255,255,${lifeRatio * 0.35})`
          ctx.lineWidth = p.size * lifeRatio
          ctx.stroke()
        }

        // Head: layered circles
        const s = p.size * lifeRatio * 1.2
        ctx.fillStyle = 'white'
        ctx.globalAlpha = lifeRatio * 0.15
        ctx.beginPath()
        ctx.arc(p.x, p.y, s * 3, 0, Math.PI * 2)
        ctx.fill()
        ctx.globalAlpha = lifeRatio * 0.7
        ctx.beginPath()
        ctx.arc(p.x, p.y, s, 0, Math.PI * 2)
        ctx.fill()
        ctx.globalAlpha = 1
      }

      return true
    })

    // ============================================================
    // PRICE HEAD — FIXED POSITION, CONSISTENT WITH priceLineGridX
    // ============================================================
    // headX is at 40% across the grid area (smooth, non-snapping).
    // priceLineGridX = (viewOffsetX + gridWidth * PRICE_LINE_POSITION) / cellWidth
    // which maps to screen: gridLeft + priceLineGridX*cellWidth - viewOffsetX = gridLeft + gridWidth*PRICE_LINE_POSITION = headX ✓
    const headX = gridLeft + gridWidth * PRICE_LINE_POSITION
    // headY: price is always at the vertical center of the grid area.
    const headY = GRID_PADDING.top + gridHeight / 2

    // Price trail
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
        // Trail Y: relative to current price position at center
        const prevTrailY = headY + (prev.y - currentPriceY) * cellHeight
        const currTrailY = headY + (curr.y - currentPriceY) * cellHeight
        if (currX < gridLeft) continue
        if (prevX > headX) continue
        const fadeRatio = Math.min(1, curr.age / maxTrailLength)
        const alpha = 1 - fadeRatio * fadeRatio
        if (alpha <= 0) continue
        ctx.beginPath()
        ctx.moveTo(Math.max(gridLeft, prevX), prevTrailY)
        ctx.lineTo(Math.max(gridLeft, currX), currTrailY)
        ctx.globalAlpha = alpha
        ctx.stroke()
      }
      ctx.restore()
    }

    // Price vertical line
    ctx.strokeStyle = colors.blue
    ctx.lineWidth = 2
    ctx.globalAlpha = 0.2
    ctx.beginPath()
    ctx.moveTo(headX, GRID_PADDING.top)
    ctx.lineTo(headX, GRID_PADDING.top + gridHeight)
    ctx.stroke()
    ctx.globalAlpha = 1

    // Price head dot with glow
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
  }, [dpr, GRID_PADDING.top, GRID_PADDING.left, GRID_PADDING.bottom, GRID_PADDING.right])

  // Animation loop
  useEffect(() => {
    const animate = (timestamp: number) => {
      if (!lastTimeRef.current) lastTimeRef.current = timestamp
      const delta = Math.min(timestamp - lastTimeRef.current, 50)
      lastTimeRef.current = timestamp
      const { cellWidth, cellHeight, gridWidth, gridHeight, gridLeft, visibleCols } = gridDimsRef.current
      viewOffsetXRef.current += 0.04 * delta
      const time = timestamp * 0.001
      const movement = Math.sin(time * 2.4) * 0.006 + Math.sin(time * 5.0) * 0.004 + Math.sin(time * 1.4) * 0.005
      if (Math.random() > 0.92) priceVelocityRef.current += (Math.random() - 0.5) * 0.02
      priceVelocityRef.current *= 0.85
      priceVelocityRef.current = Math.max(-0.03, Math.min(0.03, priceVelocityRef.current))
      currentPriceYRef.current += movement + priceVelocityRef.current

      // Center price at pixel midpoint of grid area regardless of screen size
      globalYOffsetRef.current = currentPriceYRef.current * cellHeight - gridHeight / 2

      priceTrailRef.current.forEach(p => p.age += 0.04 * delta)
      priceTrailRef.current.unshift({ y: currentPriceYRef.current, age: 0 })
      const maxTrailAge = gridWidth * PRICE_LINE_POSITION + 50
      priceTrailRef.current = priceTrailRef.current.filter(p => p.age < maxTrailAge)
      const baseGridX = Math.floor(viewOffsetXRef.current / cellWidth)
      const priceLineGridX = (viewOffsetXRef.current + gridWidth * PRICE_LINE_POSITION) / cellWidth
      const currentY = currentPriceYRef.current

      // Resolve blocks ONE AT A TIME, left-to-right:
      // - Win: checked while price line traverses through the block column (gridX to gridX+1)
      // - Loss: only after the price line fully passes the block's right edge (gridX+1)
      const cleanupThreshold = priceLineGridX - 10
      setBlocks(prevBlocks => {
        const result: Block[] = []
        let resolvedOne = false // only resolve one block per frame

        // Sort pending blocks by gridX so leftmost is processed first
        const sorted = [...prevBlocks].sort((a, b) => {
          if (a.status !== 'pending' && b.status !== 'pending') return 0
          if (a.status !== 'pending') return -1
          if (b.status !== 'pending') return 1
          return a.gridX - b.gridX
        })

        for (const block of sorted) {
          if (block.status !== 'pending') {
            result.push(block)
            continue
          }
          // Clean up blocks far behind
          if (block.gridX < cleanupThreshold) continue

          if (resolvedOne) {
            // Already resolved one this frame — keep remaining pending
            result.push(block)
            continue
          }

          const blockLeft = block.gridX
          const blockRight = block.gridX + 1

          // Win check: price line is currently within the block's column
          if (priceLineGridX >= blockLeft && priceLineGridX < blockRight) {
            const distance = Math.abs(currentY - (block.gridY + 0.5))
            if (distance <= 0.5) {
              // WIN
              const winAmount = block.betSize * block.multiplier
              setBalance(b => b + winAmount)
              setTotalWins(w => w + 1)
              setTotalWonAmount(w => w + winAmount)
              addToast(`+$${winAmount.toFixed(2)}`, 'win')
              const headX = gridLeft + gridWidth * PRICE_LINE_POSITION
              const headY = GRID_PADDING.top + gridHeight / 2
              spawnExplosion(headX, headY)
              result.push({ ...block, status: 'won' })
              resolvedOne = true
              continue
            }
            // Price line is in the column but Y not close enough — still pending, might win later
            result.push(block)
            continue
          }

          // Loss check: price line has fully passed the block's right edge
          if (priceLineGridX >= blockRight) {
            setTotalLosses(l => l + 1)
            addToast(`-$${block.betSize.toFixed(2)}`, 'loss')
            result.push({ ...block, status: 'lost', lostAt: performance.now() })
            resolvedOne = true
            continue
          }

          // Block not yet reached by price line
          result.push(block)
        }
        return result
      })

      draw()
      animationRef.current = requestAnimationFrame(animate)
    }
    animationRef.current = requestAnimationFrame(animate)
    return () => cancelAnimationFrame(animationRef.current)
  }, [draw, addToast, spawnExplosion, GRID_PADDING.left, GRID_PADDING.top])

  // Pointer coordinate extraction (mouse + touch)
  const getPointerCoords = useCallback((e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    const canvas = canvasRef.current
    if (!canvas) return null
    const rect = canvas.getBoundingClientRect()
    let clientX: number, clientY: number
    if ('touches' in e) {
      if (e.touches.length === 0 && e.changedTouches.length > 0) {
        clientX = e.changedTouches[0].clientX
        clientY = e.changedTouches[0].clientY
      } else if (e.touches.length > 0) {
        clientX = e.touches[0].clientX
        clientY = e.touches[0].clientY
      } else {
        return null
      }
    } else {
      clientX = e.clientX
      clientY = e.clientY
    }
    return { x: clientX - rect.left, y: clientY - rect.top }
  }, [])

  // Simplified: convert pointer coords directly to absolute grid position
  const pointerToGrid = useCallback((px: number, py: number) => {
    const { cellWidth, cellHeight, gridWidth, gridHeight, gridLeft } = gridDimsRef.current
    if (!cellWidth || !cellHeight) return null
    const absoluteGridX = Math.floor((px - gridLeft + viewOffsetXRef.current) / cellWidth)
    const absoluteGridY = Math.floor((py - GRID_PADDING.top + globalYOffsetRef.current) / cellHeight)
    const isInGrid = py >= GRID_PADDING.top && py <= GRID_PADDING.top + gridHeight
      && px >= gridLeft && px <= gridLeft + gridWidth
    return { absoluteGridX, absoluteGridY, isInGrid }
  }, [GRID_PADDING.top])

  // Convert absolute grid cell back to screen center coords
  const gridToScreen = useCallback((gx: number, gy: number) => {
    const { cellWidth, cellHeight, gridLeft } = gridDimsRef.current
    return {
      sx: gridLeft + gx * cellWidth - viewOffsetXRef.current + cellWidth / 2,
      sy: GRID_PADDING.top + gy * cellHeight - globalYOffsetRef.current + cellHeight / 2,
    }
  }, [GRID_PADDING.top])

  const handlePointerDown = useCallback((e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if ('touches' in e) e.preventDefault()
    const coords = getPointerCoords(e)
    if (!coords) return
    const cell = pointerToGrid(coords.x, coords.y)
    if (!cell || !cell.isInGrid) return
    const { absoluteGridX, absoluteGridY } = cell
    const priceLineGridX = (viewOffsetXRef.current + gridDimsRef.current.gridWidth * PRICE_LINE_POSITION) / gridDimsRef.current.cellWidth
    if (absoluteGridX < priceLineGridX) { addToast('Place bets ahead of the line!', 'loss'); return }
    if (balance < selectedBet) { addToast('Insufficient balance!', 'loss'); return }
    isDraggingRef.current = true
    const success = placeBlock(absoluteGridX, absoluteGridY)
    if (success) {
      lastPlacedCellRef.current = { gridX: absoluteGridX, gridY: absoluteGridY }
      const { sx, sy } = gridToScreen(absoluteGridX, absoluteGridY)
      spawnExplosion(sx, sy)
    }
  }, [balance, selectedBet, addToast, placeBlock, spawnExplosion, getPointerCoords, pointerToGrid, gridToScreen])

  const handlePointerMove = useCallback((e: React.MouseEvent<HTMLCanvasElement> | React.TouchEvent<HTMLCanvasElement>) => {
    if ('touches' in e) e.preventDefault()
    const coords = getPointerCoords(e)
    if (!coords) return
    const cell = pointerToGrid(coords.x, coords.y)
    if (!cell || !cell.isInGrid) { hoverCellRef.current = null; return }
    const { absoluteGridX, absoluteGridY } = cell
    hoverCellRef.current = { col: 0, row: 0, absoluteGridX, absoluteGridY }
    if (isDraggingRef.current && balance >= selectedBet) {
      const priceLineGridX = (viewOffsetXRef.current + gridDimsRef.current.gridWidth * PRICE_LINE_POSITION) / gridDimsRef.current.cellWidth
      if (absoluteGridX >= priceLineGridX) {
        if (!lastPlacedCellRef.current || lastPlacedCellRef.current.gridX !== absoluteGridX || lastPlacedCellRef.current.gridY !== absoluteGridY) {
          const success = placeBlock(absoluteGridX, absoluteGridY)
          if (success) {
            lastPlacedCellRef.current = { gridX: absoluteGridX, gridY: absoluteGridY }
            const { sx, sy } = gridToScreen(absoluteGridX, absoluteGridY)
            spawnExplosion(sx, sy)
          }
        }
      }
    }
  }, [balance, selectedBet, placeBlock, spawnExplosion, getPointerCoords, pointerToGrid, gridToScreen])

  const handlePointerUp = useCallback(() => {
    isDraggingRef.current = false
    lastPlacedCellRef.current = null
  }, [])

  const handlePointerLeave = useCallback(() => {
    hoverCellRef.current = null
    isDraggingRef.current = false
    lastPlacedCellRef.current = null
  }, [])

  // Block cleanup now handled in animation loop (real-time, no setInterval)

  const pnl = balance - STARTING_BALANCE
  const pnlPercent = STARTING_BALANCE > 0 ? (pnl / STARTING_BALANCE) * 100 : 0
  const totalBets = totalWins + totalLosses
  const winRate = totalBets > 0 ? (totalWins / totalBets) * 100 : 0

  const glassBlockRef = useRef<HTMLImageElement | null>(null)

  // Preload glass block image
  useEffect(() => {
    const img = new Image()
    img.src = '/glassblock.png'
    img.onload = () => {
      glassBlockRef.current = img
    }
  }, [])

    // Generate share card on hidden canvas
    const generateShareCard = useCallback(() => {
    const canvas = shareCardRef.current
    if (!canvas) return null

    // Helper for Hex to RGBA
    const hexToRgba = (hex: string, alpha: number) => {
        const r = parseInt(hex.slice(1, 3), 16)
        const g = parseInt(hex.slice(3, 5), 16)
        const b = parseInt(hex.slice(5, 7), 16)
        return `rgba(${r}, ${g}, ${b}, ${alpha})`
    }

    const W = 600, H = 400
    const dpr = 2
    canvas.width = W * dpr
    canvas.height = H * dpr
    canvas.style.width = `${W}px`
    canvas.style.height = `${H}px`
    const ctx = canvas.getContext('2d')
    if (!ctx) return null
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)

    // THEME CONFIG
    const isLight = shareTheme === 'light'
    
    // STRICT PALETTE FROM AGENTS.MD
    const PALETTE = {
      blue: '#0000ff',
      cerulean: '#3c8aff',
      white: '#ffffff', // Gray 0
      gray10: '#eef0f3',
      gray100: '#0a0b0d',
    }

    // FLAT THEME MAPPING
    // Light: White BG, Blue FG
    // Dark: Blue BG, White FG
    const th = {
        bg: isLight ? PALETTE.white : PALETTE.blue,
        fg: isLight ? PALETTE.blue : PALETTE.white,
        accent: isLight ? PALETTE.blue : PALETTE.white,
        sub: isLight ? PALETTE.blue : PALETTE.white, // In flat #0000ff mode, subtext is same or opacity
        // For pill background
        pillBg: isLight ? PALETTE.blue : PALETTE.white,
        pillFg: isLight ? PALETTE.white : PALETTE.blue,
    }

    // 1. SOLID BACKGROUND
    ctx.fillStyle = th.bg
    ctx.fillRect(0, 0, W, H)

    // NO ORBS (Flat Design)

    // Glass Block Image (Watermark style for Flat Design)
    if (glassBlockRef.current) {
        ctx.save()
        // In Flat Blue/White, we need high contrast or subtle tint
        // If Dark (Blue BG), White texture low opacity
        // If Light (White BG), Blue texture low opacity
        ctx.globalAlpha = 0.1 
        // We can't easily recolor an image in canvas without a temp canvas or blend modes
        // But we can use transparency.
        // If the image is transparent PNG, it draws its own color.
        // Assuming glassblock is whitish/bluish.
        // For strict 2-color, we might use 'source-in' with a fill rect if we strictly wanted the shape, 
        // but 'overlay' or plain draw with alpha is usually "flat" enough for a texture.
        // Let's stick to the subtle watermark effect.
        
        ctx.globalCompositeOperation = isLight ? 'multiply' : 'screen' // Better blending for "flat" feel?
        // Actually simple alpha is safer for "No other color" rule if image is grayscale/blue
        ctx.globalCompositeOperation = 'source-over'
        
        // Tilt & Position (Bottom Right Large)
        const angle = -15 * Math.PI / 180
        const cx = W
        const cy = H
        
        ctx.translate(cx, cy)
        ctx.rotate(angle)
        
        const aspect = glassBlockRef.current.width / glassBlockRef.current.height
        const drawH = H * 1.5
        const drawW = drawH * aspect
        
        ctx.drawImage(glassBlockRef.current, -drawW * 0.8, -drawH * 0.8, drawW, drawH)
        ctx.restore()
    }

    // 2. LAYOUT CONTAINER (No "Card" visual, just layout bounds)
    const margin = 24
    const cardW = W - margin * 2
    const cardH = H - margin * 2
    const cardX = margin
    const cardY = margin

    // NO GLASS CARD DRAWING (No border, no shadow, no fill)

    // 3. CONTENT
    // Header
    const contentLeft = cardX + 32
    const contentRight = cardX + cardW - 48 
    const headerY = cardY + 42

    // Logo
    const logoSize = 36
    ctx.fillStyle = th.fg // Foreground color for Logo Box? 
    // Wait, logo usually has its own brand color. 
    // Light Mode: Blue Text. Logo should be Blue? 
    // Dark Mode: White Text. Logo White?
    // "not your current approach, switch to flat design"
    // "light mode the white bg blue fg" -> Logo box Blue, T White? Or Logo box White border Blue?
    // Let's go Solid Foreground for Logo Box, Background color for "T"
    
    ctx.beginPath()
    ctx.rect(contentLeft, headerY - 24, logoSize, logoSize)
    ctx.fillStyle = th.fg
    ctx.fill()
    
    // "T"
    ctx.fillStyle = th.bg // Inverted
    ctx.font = '900 22px "Geist Mono", monospace'
    ctx.textAlign = 'center'
    ctx.textBaseline = 'middle'
    ctx.fillText('T', contentLeft + logoSize/2, headerY - 24 + logoSize/2 + 2)

    // App Name
    ctx.textAlign = 'left'
    ctx.fillStyle = th.fg
    ctx.font = '700 18px "Geist Mono", monospace'
    ctx.fillText('Tap Trading', contentLeft + logoSize + 14, headerY - 4)
    
    // Date
    ctx.textAlign = 'right'
    ctx.fillStyle = th.fg
    ctx.font = '500 12px "Geist Mono", monospace'
    const dateStr = new Date().toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' })
    ctx.fillText(dateStr, contentRight, headerY)

    // Footer
    const footerY = cardY + cardH - 28
    ctx.textAlign = 'center'
    ctx.fillStyle = th.fg
    ctx.globalAlpha = 0.7 // Slight opacity for footer to distinguish
    ctx.font = '400 11px "Geist Mono", monospace'
    ctx.fillText('TESSERACT.TRADE', W / 2, footerY)
    ctx.globalAlpha = 1.0

    // Main Stats
    const statsTop = headerY + 45
    const rowGap = 50
    const colLabels = [
        { label: 'TOTAL VOLUME', value: `$${totalWagered.toFixed(0)}` },
        { label: 'WIN RATE', value: `${winRate.toFixed(1)}%` },
        { label: 'WINS', value: totalWins.toString() },
    ]

    colLabels.forEach((item, idx) => {
        const y = statsTop + idx * rowGap
        
        ctx.textAlign = 'left'
        ctx.fillStyle = th.fg
        ctx.font = '600 11px "Geist Mono", monospace'
        ctx.fillText(item.label, contentLeft, y)
        
        ctx.fillStyle = th.fg
        ctx.font = '700 24px "Geist Mono", monospace'
        ctx.fillText(item.value, contentLeft, y + 26)
    })

    // PnL
    const pnlCenterY = statsTop + rowGap
    const pnlX = contentRight

    ctx.textAlign = 'right'
    ctx.fillStyle = th.fg
    ctx.font = '600 16px "Geist Mono", monospace'
    ctx.fillText('PNL', pnlX, pnlCenterY - 45) // Slightly higher

    const pnlSign = pnl >= 0 ? '+' : ''
    const pnlStr = `${pnlSign}$${Math.abs(pnl).toFixed(2)}`
    
    // PnL Value - Flat Color (Foreground)
    ctx.shadowBlur = 0 
    ctx.fillStyle = th.fg
    ctx.font = '800 64px "Geist Mono", monospace'
    ctx.fillText(pnlStr, pnlX, pnlCenterY + 35) // Slightly lower for spacing

    // Pill
    const pctSign = pnlPercent >= 0 ? '▲' : '▼'
    const pctStr = `${pctSign} ${Math.abs(pnlPercent).toFixed(1)}%`
    
    ctx.font = 'bold 16px "Geist Mono", monospace'
    // Increased internal horizontal padding
    const pillWidth = ctx.measureText(pctStr).width + 50 
    const pillHeight = 40 // Slightly taller
    const pillX = pnlX - pillWidth
    // Increased vertical gap from Amount
    const pillY = pnlCenterY + 60 
    
    // Flat Pill: Solid Background (Contrast)
    ctx.fillStyle = th.pillBg
    ctx.beginPath()
    ctx.rect(pillX, pillY, pillWidth, pillHeight)
    ctx.fill()
    
    // Pill Text -> PillFg
    ctx.textAlign = 'left'
    ctx.fillStyle = th.pillFg
    ctx.textBaseline = 'middle'
    // Center text with new padding
    ctx.fillText(pctStr, pillX + 25, pillY + pillHeight/2 + 1)

    return canvas
  }, [pnl, pnlPercent, winRate, totalWins, totalWagered, shareTheme])

  const getShareCardBlob = useCallback(async (): Promise<Blob | null> => {
    const canvas = generateShareCard()
    if (!canvas) return null
    return new Promise(resolve => canvas.toBlob(blob => resolve(blob), 'image/png'))
  }, [generateShareCard])

  // Update share card and preview when stats/theme change
  useEffect(() => {
    if (showShareCard) {
      const canvas = generateShareCard()
      // Copy to preview
      if (canvas && previewCanvasRef.current) {
        const dest = previewCanvasRef.current
        dest.width = canvas.width
        dest.height = canvas.height
        dest.style.width = '100%'
        dest.style.height = 'auto'
        const ctx = dest.getContext('2d')
        if (ctx) {
            ctx.clearRect(0, 0, dest.width, dest.height)
            ctx.drawImage(canvas, 0, 0)
        }
      }
    }
  }, [generateShareCard, showShareCard])

  const handleSaveImage = useCallback(async () => {
    const blob = await getShareCardBlob()
    if (!blob) return
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `tesseract-pnl-${Date.now()}.png`
    a.click()
    URL.revokeObjectURL(url)
  }, [getShareCardBlob])

  const handleCopyImage = useCallback(async () => {
    const blob = await getShareCardBlob()
    if (!blob) return
    try {
      await navigator.clipboard.write([new ClipboardItem({ 'image/png': blob })])
      addToast('Copied to clipboard!', 'win')
    } catch {
      addToast('Copy failed', 'loss')
    }
  }, [getShareCardBlob, addToast])

  const handleShare = useCallback(async () => {
    const blob = await getShareCardBlob()
    if (!blob) return
    const file = new File([blob], 'tesseract-pnl.png', { type: 'image/png' })
    if (navigator.share) {
      try {
        await navigator.share({
          title: 'My Tesseract PnL',
          text: `PnL: ${pnl >= 0 ? '+' : ''}$${pnl.toFixed(2)} (${pnlPercent >= 0 ? '+' : ''}${pnlPercent.toFixed(1)}%)`,
          files: [file],
        })
      } catch { /* user cancelled */ }
    } else {
      handleSaveImage()
    }
  }, [getShareCardBlob, pnl, pnlPercent, handleSaveImage])

  // Render share card preview when modal opens
  useEffect(() => {
    if (showShareCard) generateShareCard()
  }, [showShareCard, generateShareCard])

  return (
    <div className="h-screen flex flex-col bg-white">
      <header className="flex items-center justify-between px-4 py-3 border-b shrink-0" style={{ borderColor: colors.gray15 }}>
        <div className="flex items-center gap-2">
          <div className="w-8 h-8 flex items-center justify-center" style={{ backgroundColor: colors.blue }}>
            <span className="text-white font-bold text-sm">T</span>
          </div>
          <span className="font-bold text-lg" style={{ color: colors.gray100 }}>Tesseract</span>
        </div>
        <div className="flex items-center gap-4">
          <button
            onClick={() => setShowShareCard(true)}
            className="flex items-center gap-2 px-3 py-1.5 transition-all active:scale-95 cursor-pointer"
            style={{
              backgroundColor: pnl >= 0 ? 'rgba(32, 192, 115, 0.08)' : 'rgba(252, 64, 31, 0.08)',
              border: `1px solid ${pnl >= 0 ? 'rgba(32, 192, 115, 0.2)' : 'rgba(252, 64, 31, 0.2)'}`,
            }}
            title="Click to share PnL card"
          >
            <div className="text-right">
              <div className="text-[10px] font-medium" style={{ color: colors.gray50 }}>PnL</div>
              <div className="font-bold text-base leading-tight" style={{ color: pnl >= 0 ? colors.green : colors.red }}>
                {pnl >= 0 ? '+' : ''}{pnlPercent.toFixed(1)}%
              </div>
            </div>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={colors.gray30} strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{ opacity: 0.6 }}>
              <path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8" />
              <polyline points="16 6 12 2 8 6" />
              <line x1="12" y1="2" x2="12" y2="15" />
            </svg>
          </button>
          <div className="text-right">
            <div className="text-xs" style={{ color: colors.gray50 }}>Balance</div>
            <div className="font-bold text-lg" style={{ color: colors.gray100 }}>${balance.toFixed(2)}</div>
          </div>
        </div>
      </header>

      <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 flex flex-col gap-2 pointer-events-none">
        {toasts.map(toast => (
          <div
            key={toast.id}
            className="px-4 py-2 rounded-lg font-bold text-white shadow-lg animate-toast-pop"
            style={{ backgroundColor: toast.type === 'win' ? colors.green : colors.red }}
          >
            {toast.message}
          </div>
        ))}
      </div>

      <div ref={containerRef} className="flex-1 relative" style={{ minHeight: '300px' }}>
        <canvas
          ref={canvasRef}
          className="absolute inset-0 w-full h-full cursor-pointer"
          onMouseDown={handlePointerDown}
          onMouseMove={handlePointerMove}
          onMouseUp={handlePointerUp}
          onMouseLeave={handlePointerLeave}
          onTouchStart={handlePointerDown}
          onTouchMove={handlePointerMove}
          onTouchEnd={handlePointerUp}
          onTouchCancel={handlePointerLeave}
          style={{ touchAction: 'none' }}
        />
        {blocks.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <div className="text-center p-6 rounded-xl shadow-lg bg-white/95">
              <div className="font-bold text-lg mb-1" style={{ color: colors.gray100 }}>Tap or drag to place bets</div>
              <div className="text-sm" style={{ color: colors.gray50 }}>Further from price = Higher multiplier</div>
            </div>
          </div>
        )}
      </div>

      <div className="border-t px-4 py-4 shrink-0" style={{ borderColor: colors.gray15 }}>
        <div className="flex items-center justify-center gap-4 max-w-lg mx-auto">
          <div className="flex items-center gap-2">
            <span className="text-sm font-medium" style={{ color: colors.gray60 }}>Bet:</span>
            <div className="flex gap-1">
              {BET_SIZES.map(size => (
                <button
                  key={size}
                  onClick={() => setSelectedBet(size)}
                  className="px-3 py-2 rounded-lg font-bold text-sm transition-all active:scale-95"
                  style={{
                    backgroundColor: selectedBet === size ? colors.blue : colors.gray10,
                    color: selectedBet === size ? colors.gray0 : colors.gray60
                  }}
                >
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

      {/* Hidden canvas for share card generation */}
      <canvas ref={shareCardRef} className="hidden" />

      {/* Share Card Modal */}
      {showShareCard && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center p-4"
          style={{ backgroundColor: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)' }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowShareCard(false) }}
        >
          <div
            className="w-full max-w-[420px] shadow-2xl"
            style={{ backgroundColor: colors.gray0, border: `1px solid ${colors.gray15}` }}
          >
            {/* Card Preview */}
            <div className="flex justify-center p-4 pb-2 flex-col gap-2">
              <canvas
                ref={previewCanvasRef}
                style={{ maxWidth: '100%', border: `1px solid ${colors.gray15}` }}
              />
              <button
                onClick={() => setShareTheme(prev => prev === 'light' ? 'dark' : 'light')}
                className="w-full py-2 text-xs font-bold border rounded transition-all flex items-center justify-center gap-2"
                style={{ 
                    borderColor: colors.gray15, 
                    color: colors.gray50,
                    backgroundColor: colors.gray10
                }}
              >
                <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="12" cy="12" r="5"/><path d="M12 1v2M12 21v2M4.22 4.22l1.42 1.42M18.36 18.36l1.42 1.42M1 12h2M21 12h2M4.22 19.78l1.42-1.42M18.36 5.64l1.42-1.42"/></svg>
                {shareTheme === 'light' ? 'Switch to Dark Mode' : 'Switch to Light Mode'}
              </button>
            </div>

            {/* Action Buttons */}
            <div className="flex gap-2 p-4 pt-2">
              <button
                onClick={handleSaveImage}
                className="flex-1 py-3 font-bold text-sm transition-all active:scale-95 flex items-center justify-center gap-2"
                style={{ backgroundColor: colors.gray10, color: colors.gray80, border: `1px solid ${colors.gray15}` }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />
                  <polyline points="7 10 12 15 17 10" />
                  <line x1="12" y1="15" x2="12" y2="3" />
                </svg>
                Save
              </button>
              <button
                onClick={handleCopyImage}
                className="flex-1 py-3 font-bold text-sm transition-all active:scale-95 flex items-center justify-center gap-2"
                style={{ backgroundColor: colors.gray10, color: colors.gray80, border: `1px solid ${colors.gray15}` }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="9" y="9" width="13" height="13" rx="2" />
                  <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
                </svg>
                Copy
              </button>
              <button
                onClick={handleShare}
                className="flex-1 py-3 font-bold text-sm transition-all active:scale-95 flex items-center justify-center gap-2"
                style={{ backgroundColor: colors.blue, color: colors.gray0 }}
              >
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <circle cx="18" cy="5" r="3" />
                  <circle cx="6" cy="12" r="3" />
                  <circle cx="18" cy="19" r="3" />
                  <line x1="8.59" y1="13.51" x2="15.42" y2="17.49" />
                  <line x1="15.41" y1="6.51" x2="8.59" y2="10.49" />
                </svg>
                Share
              </button>
            </div>

            {/* Close */}
            <button
              onClick={() => setShowShareCard(false)}
              className="w-full py-3 text-sm font-medium transition-all"
              style={{ color: colors.gray50, borderTop: `1px solid ${colors.gray15}` }}
            >
              Close
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
