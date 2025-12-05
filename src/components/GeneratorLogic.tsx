import { useState, useRef, useEffect, type ChangeEvent } from 'react'

export type Dir = 'across' | 'down'
export interface WordEntry { enabled: boolean, word: string, hint: string }
export interface PasswordChar { char: string, newWord: boolean, gridPosition: { x: number, y: number } | null, isGiven: boolean, number: number }
export interface PlacedWord { word: string, x: number, y: number, direction: Dir }
export interface BeamState { grid: Map<string, string>, placedWords: PlacedWord[], remainingWords: string[], score: number }
export interface GeneratedIteration { id: number, grid: string[][], placedWords: PlacedWord[], score: number, density: number, intersections: number, wordCount: number, totalWords: number, avgIntersections: number }

export const STORAGE_KEYS = { WORD_ENTRIES: 'crossword_word_entries', PASSWORD: 'crossword_password', HINT: 'crossword_hint' }
export const POLISH_VOWELS = new Set(['A', 'Ą', 'E', 'Ę', 'I', 'O', 'Ó', 'U', 'Y'])
export const POLISH_SPECIAL_CHARS = new Set(['Ą', 'Ć', 'Ę', 'Ł', 'Ń', 'Ó', 'Ś', 'Ź', 'Ż'])
export const CELL_SIZE = 32
export const SMALL_CELL_SIZE = 24
export const HINT_CHAR_WIDTH = 5
export const HINT_LINE_HEIGHT = 16
export const HELPER_LINE_HEIGHT = 18
export const WORD_HINT_MAX_WIDTH = 280
export const GAP = 64
export const GEN_ATTEMPTS = 200
export const TOP_ITERATIONS_COUNT = 20

export const getPos = (x: number, y: number, i: number, dir: Dir): [number, number] => dir === 'across' ? [x + i, y] : [x, y + i]

export const shuffle = <T,>(arr: T[]): T[] => {
  const r = [...arr]
  for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]] }
  return r
}

export const getBounds = (grid: Map<string, string>) => {
  if (!grid.size) return { minX: 0, maxX: 0, minY: 0, maxY: 0, width: 1, height: 1, area: 1 }
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const key of grid.keys()) { const [x, y] = key.split(',').map(Number); minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y) }
  const width = maxX - minX + 1, height = maxY - minY + 1
  return { minX, maxX, minY, maxY, width, height, area: width * height }
}

export const placeWord = (grid: Map<string, string>, word: string, x: number, y: number, dir: Dir) => {
  for (let i = 0; i < word.length; i++) { const [cx, cy] = getPos(x, y, i, dir); grid.set(`${cx},${cy}`, word[i]) }
}

export const canPlaceWord = (grid: Map<string, string>, word: string, x: number, y: number, dir: Dir) => {
  let intersections = 0
  const perp = dir === 'across' ? [[0, -1], [0, 1]] : [[-1, 0], [1, 0]]
  for (let i = 0; i < word.length; i++) {
    const [cx, cy] = getPos(x, y, i, dir), existing = grid.get(`${cx},${cy}`)
    if (existing !== undefined) { if (existing !== word[i]) return { valid: false, intersections: 0 }; intersections++ }
    else if (perp.some(([dx, dy]) => grid.has(`${cx + dx},${cy + dy}`))) return { valid: false, intersections: 0 }
  }
  const [bx, by] = dir === 'across' ? [x - 1, y] : [x, y - 1], [ax, ay] = dir === 'across' ? [x + word.length, y] : [x, y + word.length]
  return { valid: (intersections > 0 || !grid.size) && !grid.has(`${bx},${by}`) && !grid.has(`${ax},${ay}`), intersections }
}

export const countTotalIntersections = (grid: Map<string, string>, placedWords: PlacedWord[]) => {
  let total = 0
  for (const pw of placedWords) {
    const perp = pw.direction === 'across' ? [[0, -1], [0, 1]] : [[-1, 0], [1, 0]]
    for (let i = 0; i < pw.word.length; i++) {
      const [cx, cy] = getPos(pw.x, pw.y, i, pw.direction)
      if (perp.some(([dx, dy]) => grid.has(`${cx + dx},${cy + dy}`))) total++
    }
  }
  return total / 2
}

export const countIntersectionsPerWord = (grid: Map<string, string>, placedWords: PlacedWord[]): Map<string, number> => {
  const intersectionsMap = new Map<string, number>()
  for (const pw of placedWords) {
    const perp = pw.direction === 'across' ? [[0, -1], [0, 1]] : [[-1, 0], [1, 0]]
    let count = 0
    for (let i = 0; i < pw.word.length; i++) {
      const [cx, cy] = getPos(pw.x, pw.y, i, pw.direction)
      if (perp.some(([dx, dy]) => grid.has(`${cx + dx},${cy + dy}`))) count++
    }
    intersectionsMap.set(pw.word, count)
  }
  return intersectionsMap
}

export const countFilledCellsFromGrid = (grid: Map<string, string>): number => {
  const bounds = getBounds(grid)
  if (bounds.area <= 1) return 0
  const width = bounds.width, height = bounds.height
  const table: string[][] = Array(height).fill(0).map(() => Array(width).fill('-'))
  for (const [k, v] of grid) { const [x, y] = k.split(',').map(Number); table[y - bounds.minY][x - bounds.minX] = v }
  const connectedToEdge = new Set<string>(), queue: [number, number][] = []
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if ((y === 0 || y === height - 1 || x === 0 || x === width - 1) && table[y][x] === '-') { const key = `${x},${y}`; if (!connectedToEdge.has(key)) { connectedToEdge.add(key); queue.push([x, y]) } }
  while (queue.length) { const [x, y] = queue.shift()!; for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]] as [number, number][]) if (nx >= 0 && nx < width && ny >= 0 && ny < height && !connectedToEdge.has(`${nx},${ny}`) && table[ny][nx] === '-') { connectedToEdge.add(`${nx},${ny}`); queue.push([nx, ny]) } }
  let filledCount = 0
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (table[y][x] === '-' && !connectedToEdge.has(`${x},${y}`)) filledCount++
  return filledCount
}

export const countOutliers = (grid: Map<string, string>): number => {
  const bounds = getBounds(grid)
  if (bounds.area <= 1) return 0
  const width = bounds.width, height = bounds.height
  const table = Array(height).fill(0).map(() => Array(width).fill(false))
  const occupied = new Set<string>()

  for (const key of grid.keys()) {
    const [x, y] = key.split(',').map(Number)
    table[y - bounds.minY][x - bounds.minX] = true
    occupied.add(key)
  }

  const queue: [number, number][] = []
  const visited = new Set<string>()

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if ((y === 0 || y === height - 1 || x === 0 || x === width - 1) && !table[y][x]) {
        const k = `${x},${y}`
        if (!visited.has(k)) { visited.add(k); queue.push([x, y]) }
      }
    }
  }

  while (queue.length) {
    const [x, y] = queue.shift()!
    for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]]) {
      if (nx >= 0 && nx < width && ny >= 0 && ny < height && !table[ny][nx]) {
        const k = `${nx},${ny}`
        if (!visited.has(k)) { visited.add(k); queue.push([nx, ny]) }
      }
    }
  }

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      if (!table[y][x] && !visited.has(`${x},${y}`)) {
        occupied.add(`${x + bounds.minX},${y + bounds.minY}`)
      }
    }
  }

  const core = new Set<string>()
  for (let y = bounds.minY; y < bounds.maxY; y++) {
    for (let x = bounds.minX; x < bounds.maxX; x++) {
      const p1 = `${x},${y}`, p2 = `${x + 1},${y}`, p3 = `${x},${y + 1}`, p4 = `${x + 1},${y + 1}`
      if (occupied.has(p1) && occupied.has(p2) && occupied.has(p3) && occupied.has(p4)) {
        core.add(p1); core.add(p2); core.add(p3); core.add(p4)
      }
    }
  }

  let outliers = 0
  for (const cell of occupied) {
    if (!core.has(cell)) outliers++
  }
  return outliers
}

export const calculateCompactness = (grid: Map<string, string>): number => {
  if (grid.size < 2) return 1
  const bounds = getBounds(grid)
  const perimeter = 2 * (bounds.width + bounds.height)
  const idealPerimeter = 4 * Math.sqrt(grid.size)
  return Math.min(1, idealPerimeter / perimeter)
}

export const findPlacements = (grid: Map<string, string>, word: string, remaining: string[]) => {
  if (!grid.size) return [{ x: 0, y: 0, direction: 'across' as Dir, score: 0, intersections: 0 }, { x: 0, y: 0, direction: 'down' as Dir, score: 0, intersections: 0 }]
  const placements: { x: number, y: number, direction: Dir, score: number, intersections: number }[] = [], seen = new Set<string>(), wordChars = new Set(word), bounds = getBounds(grid)
  const remainingChars = new Set(remaining.flatMap(w => [...w]))
  for (const [key, char] of grid.entries()) {
    if (!wordChars.has(char)) continue
    const [gx, gy] = key.split(',').map(Number)
    for (let i = 0; i < word.length; i++) {
      if (word[i] !== char) continue
      for (const [dir, sx, sy] of [['across', gx - i, gy], ['down', gx, gy - i]] as [Dir, number, number][]) {
        const k = `${sx},${sy},${dir[0]}`
        if (seen.has(k)) continue
        seen.add(k)
        const { valid, intersections } = canPlaceWord(grid, word, sx, sy, dir)
        if (!valid) continue
        const len = word.length
        const [nMinX, nMaxX, nMinY, nMaxY] = dir === 'across'
          ? [Math.min(bounds.minX, sx), Math.max(bounds.maxX, sx + len - 1), Math.min(bounds.minY, sy), Math.max(bounds.maxY, sy)]
          : [Math.min(bounds.minX, sx), Math.max(bounds.maxX, sx), Math.min(bounds.minY, sy), Math.max(bounds.maxY, sy + len - 1)]
        const nW = nMaxX - nMinX + 1, nH = nMaxY - nMinY + 1, nArea = nW * nH
        const density = (grid.size + len - intersections) / nArea
        const aspect = Math.min(nW, nH) / Math.max(nW, nH)
        const expansion = nArea / bounds.area
        const futureLinks = [...word].filter(c => remainingChars.has(c)).length
        const score = intersections * intersections * 300 + density * 40 + aspect * 40 + futureLinks * 10 - (expansion > 1.1 ? (expansion - 1) * 150 : 0)
        placements.push({ x: sx, y: sy, direction: dir, score, intersections })
      }
    }
  }
  return placements.sort((a, b) => b.score - a.score).slice(0, 30)
}

export const scoreState = (state: BeamState) => {
  const b = getBounds(state.grid)
  const density = (state.grid.size / b.area) * 100
  const intersections = countTotalIntersections(state.grid, state.placedWords)
  const filledCellsCount = countFilledCellsFromGrid(state.grid)
  const intersectionsPerWord = countIntersectionsPerWord(state.grid, state.placedWords)
  let totalWordIntersections = 0
  for (const [, count] of intersectionsPerWord) { totalWordIntersections += count }
  const avgIntersections = state.placedWords.length > 0 ? totalWordIntersections / state.placedWords.length : 0
  const compactness = calculateCompactness(state.grid)

  const strategies = [
    avgIntersections * compactness * 100,
    avgIntersections,
    density,
    filledCellsCount + compactness * 10,
    intersections + density * 10 + compactness + filledCellsCount
  ]

  return strategies[Math.floor(Math.random() * strategies.length)]
}

export const beamSearch = async (words: string[], beamWidth: number, initDir: Dir): Promise<BeamState> => {
  const seed = words[0], initGrid = new Map<string, string>()
  placeWord(initGrid, seed, 0, 0, initDir)
  let beam: BeamState[] = [{ grid: initGrid, placedWords: [{ word: seed, x: 0, y: 0, direction: initDir }], remainingWords: shuffle([...words].slice(1)), score: 0 }]
  let noProgress = 0
  while (beam.length && beam[0].remainingWords.length && noProgress < 5) {
    await new Promise(r => setTimeout(r, 0))
    const candidates: BeamState[] = []
    const prevBest = beam[0].placedWords.length
    for (const state of beam) {
      const gridChars = new Set(state.grid.values())
      const wordScores = state.remainingWords.map(w => ({ w, s: [...w].filter(c => gridChars.has(c)).length * 10 + w.length }))
      wordScores.sort((a, b) => b.s - a.s)
      for (const { w } of wordScores.slice(0, 12)) {
        const placements = findPlacements(state.grid, w, state.remainingWords.filter(x => x !== w))
        for (const p of placements.slice(0, 8)) {
          const newGrid = new Map(state.grid)
          placeWord(newGrid, w, p.x, p.y, p.direction)
          const newRemaining = state.remainingWords.filter(x => x !== w)
          const newPlaced = [...state.placedWords, { word: w, x: p.x, y: p.y, direction: p.direction }]
          const newState = { grid: newGrid, placedWords: newPlaced, remainingWords: newRemaining, score: 0 }
          newState.score = scoreState(newState)
          candidates.push(newState)
        }
      }
    }
    if (!candidates.length) { noProgress++; continue }
    candidates.sort((a, b) => b.score - a.score)
    const unique = new Map<string, BeamState>()
    for (const s of candidates) {
      const key = s.placedWords.map(p => `${p.word}:${p.x},${p.y}`).sort().join('|')
      if (!unique.has(key) || unique.get(key)!.score < s.score) unique.set(key, s)
    }
    beam = [...unique.values()].sort((a, b) => b.score - a.score).slice(0, beamWidth)
    if (beam[0].placedWords.length === prevBest) noProgress++
    else noProgress = 0
  }
  return beam.reduce((best, c) => c.score > best.score ? c : best, beam[0])
}

export const retryFailed = async (state: BeamState): Promise<BeamState> => {
  let cur = state
  for (let r = 0; r < 5 && cur.remainingWords.length; r++) {
    let improved = false
    const gridChars = new Set(cur.grid.values())
    const sorted = [...cur.remainingWords].map(w => ({ w, s: [...w].filter(c => gridChars.has(c)).length })).sort((a, b) => b.s - a.s)
    for (const { w } of sorted) {
      const ps = findPlacements(cur.grid, w, cur.remainingWords.filter(x => x !== w))
      if (ps.length) {
        const best = ps[0], newGrid = new Map(cur.grid)
        placeWord(newGrid, w, best.x, best.y, best.direction)
        cur = { grid: newGrid, placedWords: [...cur.placedWords, { word: w, x: best.x, y: best.y, direction: best.direction }], remainingWords: cur.remainingWords.filter(x => x !== w), score: 0 }
        cur.score = scoreState(cur)
        improved = true
      }
    }
    if (!improved) break
  }
  return cur
}

export const getFilledCells = (grid: string[][] | null): Set<string> => {
  if (!grid?.length || !grid[0]?.length) return new Set()
  const height = grid.length, width = grid[0].length, connectedToEdge = new Set<string>(), queue: [number, number][] = []
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if ((y === 0 || y === height - 1 || x === 0 || x === width - 1) && grid[y][x] === '-') { const key = `${x},${y}`; if (!connectedToEdge.has(key)) { connectedToEdge.add(key); queue.push([x, y]) } }
  while (queue.length) { const [x, y] = queue.shift()!; for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]] as [number, number][]) if (nx >= 0 && nx < width && ny >= 0 && ny < height && !connectedToEdge.has(`${nx},${ny}`) && grid[ny][nx] === '-') { connectedToEdge.add(`${nx},${ny}`); queue.push([nx, ny]) } }
  const filledCells = new Set<string>()
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (grid[y][x] === '-' && !connectedToEdge.has(`${x},${y}`)) filledCells.add(`${x},${y}`)
  return filledCells
}

export const wrapText = (text: string, maxWidth: number, charWidth: number): string[] => {
  const words = text.split(' '), lines: string[] = []
  let currentLine = ''
  for (const word of words) { const testLine = currentLine ? `${currentLine} ${word}` : word; if (testLine.length * charWidth > maxWidth && currentLine) { lines.push(currentLine); currentLine = word } else currentLine = testLine }
  if (currentLine) lines.push(currentLine)
  return lines
}

export const normalizeGrid = (grid: string[][]): string => {
  const height = grid.length, width = grid[0]?.length || 0
  const normalized: string[][] = []
  for (let y = 0; y < height; y++) {
    const row: string[] = []
    for (let x = 0; x < width; x++) row.push(grid[y][x])
    normalized.push(row)
  }
  return normalized.map(row => row.join('')).join('|')
}

export const rotateGrid90 = (grid: string[][]): string[][] => {
  const height = grid.length, width = grid[0]?.length || 0, rotated: string[][] = []
  for (let x = 0; x < width; x++) { const newRow: string[] = []; for (let y = height - 1; y >= 0; y--) newRow.push(grid[y][x]); rotated.push(newRow) }
  return rotated
}

export const flipHorizontal = (grid: string[][]): string[][] => grid.map(row => [...row].reverse())

export const flipVertical = (grid: string[][]): string[][] => [...grid].reverse().map(row => [...row])

export const getAllTransformationHashes = (grid: string[][]): Set<string> => {
  const hashes = new Set<string>()
  let current = grid
  for (let i = 0; i < 4; i++) {
    hashes.add(normalizeGrid(current))
    hashes.add(normalizeGrid(flipHorizontal(current)))
    hashes.add(normalizeGrid(flipVertical(current)))
    current = rotateGrid90(current)
  }
  return hashes
}

export const useGeneratorLogic = () => {
  const [wordEntries, setWordEntries] = useState<WordEntry[]>(() => { try { const saved = localStorage.getItem(STORAGE_KEYS.WORD_ENTRIES); if (saved) { const parsed = JSON.parse(saved); if (Array.isArray(parsed)) return parsed } } catch { /* empty */ } return [] })
  const [newWordInput, setNewWordInput] = useState('')
  const [newHintInput, setNewHintInput] = useState('')
  const [passwordInput, setPasswordInput] = useState(() => { try { return localStorage.getItem(STORAGE_KEYS.PASSWORD) || '' } catch { return '' } })
  const [password, setPassword] = useState<PasswordChar[]>([])
  const [gridNumbers, setGridNumbers] = useState<Map<string, number>>(new Map())
  const [hintInput, setHintInput] = useState(() => { try { return localStorage.getItem(STORAGE_KEYS.HINT) || '' } catch { return '' } })
  const [grid, setGrid] = useState<string[][] | null>(null)
  const [placedWords, setPlacedWords] = useState<PlacedWord[]>([])
  const [allPlacedWords, setAllPlacedWords] = useState<PlacedWord[]>([])
  const [hiddenWords, setHiddenWords] = useState<Set<string>>(new Set())
  const [disconnectedHiddenWords, setDisconnectedHiddenWords] = useState<Set<string>>(new Set())
  const [stats, setStats] = useState('')
  const [isGenerating, setIsGenerating] = useState(false)
  const svgRef = useRef<SVGSVGElement>(null)
  const iterationsRef = useRef<HTMLDivElement | null>(null)
  const [hideWords, setHideWords] = useState(true)
  const [revealedLetters, setRevealedLetters] = useState<Set<string>>(new Set())
  const [indicateVowels, setIndicateVowels] = useState(false)
  const [indicatePolishChars, setIndicatePolishChars] = useState(false)
  const generationProgress = useRef(0)
  const [generatedIterations, setGeneratedIterations] = useState<GeneratedIteration[]>([])
  const [selectedIterationIndex, setSelectedIterationIndex] = useState(0)
  const [iterationsExpanded, setIterationsExpanded] = useState(false)

  useEffect(() => { try { localStorage.setItem(STORAGE_KEYS.WORD_ENTRIES, JSON.stringify(wordEntries)) } catch { /* empty */ } }, [wordEntries])
  useEffect(() => { try { localStorage.setItem(STORAGE_KEYS.PASSWORD, passwordInput) } catch { /* empty */ } }, [passwordInput])
  useEffect(() => { try { localStorage.setItem(STORAGE_KEYS.HINT, hintInput) } catch { /* empty */ } }, [hintInput])

  const uniqueLetters = [...new Set(placedWords.flatMap(pw => pw.word.split('')))].sort()
  const enabledCount = wordEntries.filter(e => e.enabled).length
  const sorted = allPlacedWords.slice().sort((a, b) => a.word.localeCompare(b.word))
  const filledCells = getFilledCells(grid)
  const sortedIterations = [...generatedIterations].sort((a, b) => b.score - a.score)
  const topIterations = sortedIterations.slice(0, TOP_ITERATIONS_COUNT)

  const preparePassword = (input: string) => input.split('').map((ch, i) => ({ char: ch.trim() || '', newWord: !input.charAt(i - 1).trim() })).filter(c => c.char)

  const assignPassPositions = (table: string[][], chars: { char: string, newWord: boolean }[]) => {
    const used = new Set<string>(), nums = new Map<string, number>()
    const pwd = chars.map((ch, idx) => {
      const uc = ch.char.toUpperCase()
      for (let y = 0; y < table.length; y++) for (let x = 0; x < table[y].length; x++) { const k = `${x},${y}`; if (table[y][x] === uc && !used.has(k)) { used.add(k); nums.set(k, idx + 1); return { char: ch.char, newWord: ch.newWord, gridPosition: { x, y }, isGiven: false, number: idx + 1 } } }
      return { char: ch.char, newWord: ch.newWord, gridPosition: null, isGiven: true, number: idx + 1 }
    })
    return { password: pwd, numbers: nums }
  }

  const rebuildGrid = (words: PlacedWord[]) => { const g = new Map<string, string>(); words.forEach(pw => placeWord(g, pw.word, pw.x, pw.y, pw.direction)); return g }

  const updateDisplay = (words: PlacedWord[], allWords?: PlacedWord[]) => {
    if (!words.length) { setGrid(null); setPassword([]); setGridNumbers(new Map()); setPlacedWords([]); setStats('All words removed.'); return }
    const g = rebuildGrid(words), b = getBounds(g)
    const table: string[][] = Array(b.height).fill(0).map(() => Array(b.width).fill('-'))
    for (const [k, v] of g) { const [x, y] = k.split(',').map(Number); table[y - b.minY][x - b.minX] = v }
    const norm = words.map(pw => ({ ...pw, x: pw.x - b.minX, y: pw.y - b.minY }))
    setGrid(table); setPlacedWords(norm)
    if (allWords) {
      const normAll = allWords.map(pw => ({ ...pw, x: pw.x - b.minX, y: pw.y - b.minY }))
      setAllPlacedWords(normAll)
    }
    const { password: p, numbers: n } = assignPassPositions(table, preparePassword(passwordInput))
    setPassword(p); setGridNumbers(n)
    const density = (g.size / b.area) * 100
    const intersections = countTotalIntersections(g, words)
    const avgInt = words.length > 0 ? (intersections * 2 / words.length).toFixed(2) : '0'
    setStats(`Words: ${words.length} | Density: ${density.toFixed(1)}% | Avg intersections: ${avgInt} | Intersections: ${intersections}`)
  }

  const findConnected = (words: PlacedWord[]) => {
    if (!words.length) return []
    const posMap = new Map<string, Set<string>>()
    for (const pw of words) { const s = new Set<string>(); for (let i = 0; i < pw.word.length; i++) s.add(getPos(pw.x, pw.y, i, pw.direction).join(',')); posMap.set(pw.word, s) }
    const adj = new Map<string, Set<string>>(words.map(w => [w.word, new Set()]))
    for (let i = 0; i < words.length; i++) for (let j = i + 1; j < words.length; j++) for (const p of posMap.get(words[i].word)!) if (posMap.get(words[j].word)!.has(p)) { adj.get(words[i].word)!.add(words[j].word); adj.get(words[j].word)!.add(words[i].word); break }
    const visited = new Set([words[0].word]), queue = [words[0].word]
    while (queue.length) for (const n of adj.get(queue.shift()!) || []) if (!visited.has(n)) { visited.add(n); queue.push(n) }
    return words.filter(w => visited.has(w.word))
  }

  const toggleWordVisibility = (word: string) => {
    if (disconnectedHiddenWords.has(word)) return
    const newHidden = new Set(hiddenWords)
    if (newHidden.has(word)) {
      newHidden.delete(word)
    } else {
      newHidden.add(word)
    }
    const visibleWords = allPlacedWords.filter(pw => !newHidden.has(pw.word))
    const connected = findConnected(visibleWords)
    const disconnectedWords = visibleWords.filter(pw => !connected.some(c => c.word === pw.word))
    const newDisconnectedHidden = new Set<string>()
    for (const pw of disconnectedWords) {
      newHidden.add(pw.word)
      newDisconnectedHidden.add(pw.word)
    }
    setHiddenWords(newHidden)
    setDisconnectedHiddenWords(newDisconnectedHidden)
    updateDisplay(connected, allPlacedWords)
  }

  const toggleEnabled = (i: number) => setWordEntries(p => p.map((e, j) => j === i ? { ...e, enabled: !e.enabled } : e))
  const updateWord = (i: number, word: string) => setWordEntries(p => p.map((e, j) => j === i ? { ...e, word } : e))
  const updateHint = (i: number, hint: string) => setWordEntries(p => p.map((e, j) => j === i ? { ...e, hint } : e))
  const removeEntry = (i: number) => setWordEntries(p => p.filter((_, j) => j !== i))
  const addWord = () => { if (newWordInput.trim()) { setWordEntries(p => [...p, { enabled: true, word: newWordInput.trim(), hint: newHintInput.trim() || 'brak' }]); setNewWordInput(''); setNewHintInput('') } }
  const getHint = (word: string) => wordEntries.find(e => e.word.toUpperCase() === word.toUpperCase())?.hint || 'brak'
  const selectAllEntries = () => setWordEntries(p => p.map(e => ({ ...e, enabled: p.some(e => !e.enabled) })))
  const removeAllEntries = () => setWordEntries([])

  const rotateGrid = () => {
    if (!placedWords.length) return
    const rotatedVisible = placedWords.map(pw => ({ ...pw, direction: (pw.direction === 'across' ? 'down' : 'across') as Dir, x: pw.y, y: pw.x }))
    const rotatedAll = allPlacedWords.map(pw => ({ ...pw, direction: (pw.direction === 'across' ? 'down' : 'across') as Dir, x: pw.y, y: pw.x }))
    updateDisplay(rotatedVisible, rotatedAll)
  }

  const handleHideWordsChange = (checked: boolean) => { setHideWords(checked); if (!checked) { setRevealedLetters(new Set()); setIndicateVowels(false); setIndicatePolishChars(false) } }
  const handleRevealedLettersChange = (e: ChangeEvent<HTMLSelectElement>) => { const selected = new Set(Array.from(e.target.selectedOptions, o => o.value)); setRevealedLetters(selected); if (selected.size > 0) { setIndicateVowels(false); setIndicatePolishChars(false) } }
  const handleIndicateVowelsChange = (checked: boolean) => { if (checked) { setRevealedLetters(new Set()); setIndicatePolishChars(false) } setIndicateVowels(checked) }
  const handleIndicatePolishCharsChange = (checked: boolean) => { if (checked) { setRevealedLetters(new Set()); setIndicateVowels(false) } setIndicatePolishChars(checked) }

  const currentTopIndex = generatedIterations[selectedIterationIndex] ? topIterations.findIndex(iter => iter.id === generatedIterations[selectedIterationIndex].id) : 0

  const prevIteration = () => {
    const newTopIndex = currentTopIndex === 0 ? topIterations.length - 1 : currentTopIndex - 1
    const targetIteration = topIterations[newTopIndex]
    const originalIndex = generatedIterations.findIndex(iter => iter.id === targetIteration.id)
    selectIteration(originalIndex)
  }

  const nextIteration = () => {
    const newTopIndex = currentTopIndex + 1 === topIterations.length ? 0 : currentTopIndex + 1
    const targetIteration = topIterations[newTopIndex]
    const originalIndex = generatedIterations.findIndex(iter => iter.id === targetIteration.id)
    selectIteration(originalIndex)
  }

  const scrollToIterations = () => { setIterationsExpanded(true); iterationsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' }) }
  const isIterationBest = (index: number) => index === generatedIterations.reduce((bestIdx, iter, idx, arr) => iter.score > arr[bestIdx].score ? idx : bestIdx, 0)

  const selectIteration = (index: number) => {
    const iteration = generatedIterations[index]; if (!iteration) return
    setSelectedIterationIndex(index); setGrid(iteration.grid); setPlacedWords(iteration.placedWords); setAllPlacedWords(iteration.placedWords); setHiddenWords(new Set()); setDisconnectedHiddenWords(new Set())
    const { password: p, numbers: n } = assignPassPositions(iteration.grid, preparePassword(passwordInput))
    setPassword(p); setGridNumbers(n)
    setStats(`Iteracja ${iteration.id} ${isIterationBest(index) ? '(najlepsza)' : ''} | Avg intersections: ${iteration.avgIntersections.toFixed(2)} | Words used: ${iteration.wordCount}`)
  }

  const handleGenerate = async () => {
    const words = wordEntries.filter(e => e.enabled && e.word.trim().length > 1).map(e => e.word.trim().toUpperCase())
    if (!words.length) return alert('Please enter at least one word')
    const prepPwd = preparePassword(passwordInput)
    setIsGenerating(true); setGrid(null); setPassword([]); setGridNumbers(new Map()); setPlacedWords([]); setAllPlacedWords([]); setHiddenWords(new Set()); setDisconnectedHiddenWords(new Set()); setStats('Rozpoczynam generowanie krzyżówki...'); setRevealedLetters(new Set()); setIndicateVowels(false); setIndicatePolishChars(false); setHideWords(true); setGeneratedIterations([]); setSelectedIterationIndex(0); setIterationsExpanded(false)
    let best: BeamState | null = null, bestScore = -Infinity
    const allIterations: GeneratedIteration[] = [], seenGridHashes = new Set<string>()
    for (let i = 0; i < GEN_ATTEMPTS; i++) {
      generationProgress.current = i + 1
      setStats(`Generowanie iteracji ${i + 1}/${GEN_ATTEMPTS}...`); await new Promise(r => setTimeout(r, 10))
      try {
        const randomWidth = 50 + Math.floor(Math.random() * words.length * 10)
        const searchResult = await beamSearch(shuffle(words), randomWidth, Math.random() > 0.5 ? 'across' : 'down')
        const result = await retryFailed(searchResult)
        const b = getBounds(result.grid)
        const density = (result.grid.size / b.area) * 100
        const intersectionsPerWord = countIntersectionsPerWord(result.grid, result.placedWords)
        let totalWordIntersections = 0
        for (const [, count] of intersectionsPerWord) { totalWordIntersections += count }
        const avgIntersections = result.placedWords.length > 0 ? totalWordIntersections / result.placedWords.length : 0
        const intersections = countTotalIntersections(result.grid, result.placedWords)
        const filledCellsCount = countFilledCellsFromGrid(result.grid)
        const compactness = calculateCompactness(result.grid)
        const outliers = countOutliers(result.grid), outliersPenalty = (outliers * outliers)/2 + outliers * 2

        const score = (avgIntersections * compactness * 100) + (b.area/4 + filledCellsCount) * density/4 - outliersPenalty

        const table: string[][] = Array(b.height).fill(0).map(() => Array(b.width).fill('-'))
        for (const [k, v] of result.grid) { const [x, y] = k.split(',').map(Number); table[y - b.minY][x - b.minX] = v }
        const normalizedWords = result.placedWords.map(pw => ({ ...pw, x: pw.x - b.minX, y: pw.y - b.minY }))
        const transformationHashes = getAllTransformationHashes(table)
        let isDuplicate = false; for (const hash of transformationHashes) if (seenGridHashes.has(hash)) { isDuplicate = true; break }
        if (!isDuplicate) {
          for (const hash of transformationHashes) seenGridHashes.add(hash)
          allIterations.push({ id: i + 1, grid: table, placedWords: normalizedWords, score, density, intersections, wordCount: result.placedWords.length, totalWords: words.length, avgIntersections })
          setGeneratedIterations([...allIterations])
        }
        if (score > bestScore) { bestScore = score; best = result; setSelectedIterationIndex(allIterations.length - 1) }
      } catch (err) { console.error('Generation error:', err) }
      await new Promise(r => setTimeout(r, 50))
    }
    setIsGenerating(false)
    generationProgress.current = 0
    if (best?.grid.size && allIterations.length > 0) {
      const bestIterationIndex = allIterations.reduce((bestIdx, iter, idx, arr) => iter.score > arr[bestIdx].score ? idx : bestIdx, 0), bestIteration = allIterations[bestIterationIndex]
      if (bestIteration) {
        setGrid(bestIteration.grid); setPlacedWords(bestIteration.placedWords); setAllPlacedWords(bestIteration.placedWords); setHiddenWords(new Set()); setDisconnectedHiddenWords(new Set()); setSelectedIterationIndex(bestIterationIndex)
        const { password: p, numbers: n } = assignPassPositions(bestIteration.grid, prepPwd); setPassword(p); setGridNumbers(n)
        setStats(`✅ Zakończono: Avg intersections: ${bestIteration.avgIntersections.toFixed(2)} | Words: ${bestIteration.wordCount}/${bestIteration.totalWords}`)
      }
    } else setStats('❌ Nie udało się wygenerować krzyżówki. Spróbuj ponownie.')
  }

  const downloadSVG = () => {
    if (!svgRef.current) return
    const svgString = '<?xml version="1.0" encoding="UTF-8"?>' + new XMLSerializer().serializeToString(svgRef.current)
    const url = URL.createObjectURL(new Blob([svgString], { type: 'image/svg+xml;charset=utf-8' }))
    const link = document.createElement('a'); link.href = url; link.download = 'niesamowita_krzyzowka.svg'; document.body.appendChild(link); link.click(); document.body.removeChild(link); URL.revokeObjectURL(url)
  }

  const shouldShowLetter = (cell: string) => !hideWords || revealedLetters.has(cell)

  const getHelperTextString = (): string => {
    if (!hideWords) return ''
    if (revealedLetters.size > 0) return `Dla ułatwienia ujawniono wszystkie litery: ${[...revealedLetters].sort().join(', ')}`
    if (indicateVowels) return 'Dla ułatwienia wszystkie samogłoski oznaczono kropką'
    if (indicatePolishChars) return 'Dla ułatwienia wszystkie polskie_znaki oznaczono trójkątem'
    return ''
  }

  const renderCrosswordSVG = () => {
    if (!grid || !placedWords.length) return null
    const gridWidth = grid[0].length * CELL_SIZE, gridHeight = grid.length * CELL_SIZE
    const visibleSorted = placedWords.slice().sort((a, b) => a.word.localeCompare(b.word))
    const hintsContent: { lines: string[], yOffset: number }[] = []
    let currentY = 0
    for (const pw of visibleSorted) { const hintText = !hideWords ? `${pw.word.toLowerCase()} – ${getHint(pw.word)}` : getHint(pw.word); const wrapped = wrapText(hintText, WORD_HINT_MAX_WIDTH, HINT_CHAR_WIDTH); hintsContent.push({ lines: wrapped, yOffset: currentY }); currentY += wrapped.length * HINT_LINE_HEIGHT + 4 }
    const hintsHeight = currentY, helperText = getHelperTextString(), helperLines = helperText ? wrapText(helperText, WORD_HINT_MAX_WIDTH, HINT_CHAR_WIDTH) : [], solutionLines = wrapText(`Rozwiązaniem jest ${hintInput}`, WORD_HINT_MAX_WIDTH, HINT_CHAR_WIDTH)
    const passwordWidth = password.length * SMALL_CELL_SIZE, passwordSectionHeight = helperLines.length * HINT_LINE_HEIGHT + solutionLines.length * HINT_LINE_HEIGHT + 20 + SMALL_CELL_SIZE + 20
    const hintsX = gridWidth + GAP, passwordY = Math.max(gridHeight, hintsHeight) + 40
    const totalWidth = Math.max(gridWidth, hintsX + WORD_HINT_MAX_WIDTH, passwordWidth) + 40, totalHeight = passwordY + passwordSectionHeight + 20
    let newWord = 0
    return (
      <svg ref={svgRef} viewBox={`-12 -20 ${totalWidth + 6} ${totalHeight}`} xmlns="http://www.w3.org/2000/svg" style={{ fontFamily: 'sans-serif', width: '100%', maxWidth: totalWidth + 'px', maxHeight: totalHeight + 'px' }}>
        <g style={{ filter: 'drop-shadow(1px 0 0 black) drop-shadow(0 1px 0 black) drop-shadow(-1px 0 0 black) drop-shadow(0 -1px 0 black)' }}>
          {grid.map((row, y) => row.map((cell, x) => {
            const isFilled = filledCells.has(`${x},${y}`), isVowel = POLISH_VOWELS.has(cell), isPolishChar = POLISH_SPECIAL_CHARS.has(cell), hasNumber = gridNumbers.has(`${x},${y}`), number = gridNumbers.get(`${x},${y}`), cellX = x * CELL_SIZE, cellY = y * CELL_SIZE
            if (isFilled) return <g key={`${x},${y}`}><rect x={cellX} y={cellY} width={CELL_SIZE} height={CELL_SIZE} fill="white" stroke="black" strokeWidth="1" /><rect x={cellX + 3} y={cellY + 3} width={CELL_SIZE - 6} height={CELL_SIZE - 6} fill="black" /></g>
            if (cell === '-') return null
            return <g key={`${x},${y}`}><rect x={cellX} y={cellY} width={CELL_SIZE} height={CELL_SIZE} fill="white" stroke="black" strokeWidth="1" />{hasNumber && <text x={cellX + 3} y={cellY + 10} fontSize="9" fill="#666" fontWeight="500">{number}</text>}{shouldShowLetter(cell) && <text x={cellX + CELL_SIZE / 2} y={cellY + CELL_SIZE / 2 + 7} fontSize="20" fontWeight="600" textAnchor="middle" fill="black">{cell}</text>}{hideWords && indicateVowels && isVowel && <circle cx={cellX + 5} cy={cellY + CELL_SIZE - 5} r="2" fill="black" />}{hideWords && indicatePolishChars && isPolishChar && <polygon points={`${cellX + 3},${cellY + CELL_SIZE - 3} ${cellX + 6},${cellY + CELL_SIZE - 8} ${cellX + 9},${cellY + CELL_SIZE - 3}`} fill="black" />}</g>
          }))}
        </g>
        <g transform={`translate(${hintsX}, 6)`}>
          <rect x="-8" y="-8" width={WORD_HINT_MAX_WIDTH + 32} height={hintsHeight + 12} fill="white" stroke="#666" strokeWidth="1" rx="4" />
          {hintsContent.map((hint, idx) => <g key={idx} transform={`translate(0, ${hint.yOffset})`}><text x={0} y={12} fontSize="11" fill="black">•</text>{hint.lines.map((line, lineIdx) => <text key={lineIdx} x={10} y={12 + lineIdx * HINT_LINE_HEIGHT} fontSize="11" fill="black">{line}</text>)}</g>)}
        </g>
        {password.length > 0 && (
          <g transform={`translate(0, ${passwordY})`}>
            {helperLines.map((line, idx) => <text key={`helper-${idx}`} x={0} y={12 + idx * HELPER_LINE_HEIGHT} fontSize="12" fill="black">{line.split(' ').map((w, wi) => ['samogłoski', 'polskie_znaki'].includes(w) || w.replace(',', '').replace('_', ' ').length === 1 ? <tspan key={wi}><tspan fontWeight="700">{w.replace(',', '').replace('_', ' ')}</tspan>{w.includes(',') ? ', ' : ' '}</tspan> : <tspan key={wi}>{w} </tspan>)}</text>)}
            {solutionLines.map((line, idx) => <text key={`solution-${idx}`} x={0} y={14 + helperLines.length * HELPER_LINE_HEIGHT + idx * HELPER_LINE_HEIGHT} fontSize="12" fill="black" fontWeight="500">{line}</text>)}
            <g transform={`translate(0, ${helperLines.length * HELPER_LINE_HEIGHT + solutionLines.length * HELPER_LINE_HEIGHT + 10})`}>
              {password.map((char, i) => { const charX = i * SMALL_CELL_SIZE; if (char.newWord && i !== 0) newWord++; return <g key={i}><rect x={charX + newWord} y={0} width={SMALL_CELL_SIZE} height={SMALL_CELL_SIZE} fill="white" stroke="black" strokeWidth="1" /><text x={(charX + newWord / 2) + SMALL_CELL_SIZE / 2} y={SMALL_CELL_SIZE / 2 + 5} fontSize="14" fontWeight="600" textAnchor="middle" fill={char.isGiven ? 'black' : 'transparent'}>{char.char.toUpperCase()}</text><text x={(charX + newWord / 2) + SMALL_CELL_SIZE / 2} y={SMALL_CELL_SIZE + 10} fontSize="9" fontWeight="500" textAnchor="middle" fill="black" opacity={char.isGiven ? .5 : 1}>{char.number}</text></g> })}
            </g>
          </g>
        )}
      </svg>
    )
  }

  const renderIterationCard = (iter: GeneratedIteration, originalIndex: number, sortedIndex: number, isButton: boolean) => {
    const isBest = isIterationBest(originalIndex), isSelected = originalIndex === selectedIterationIndex
    const outliers = countOutliers(rebuildGrid(iter.placedWords))
    const className = `relative p-4 rounded-xl border-2 transition-all duration-200 text-left ${isSelected || (!isButton && isBest) ? 'bg-indigo-500/20 border-indigo-500 shadow-lg shadow-indigo-500/20' : 'bg-slate-700/30 border-slate-600/30' + (isButton ? ' hover:bg-slate-700/50 hover:border-slate-500/50' : '')}`
    const content = <>
      {isBest && <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg"><svg className="w-3.5 h-3.5 text-white" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg></div>}
      <div className="flex items-center justify-between mb-2"><span className={`text-sm font-bold ${isSelected || (!isButton && isBest) ? 'text-indigo-300' : 'text-slate-300'}`}>#{sortedIndex + 1}</span><span className="text-xs text-slate-500">iter {iter.id}</span></div>
      <div className="space-y-1">
        <div className="flex justify-between text-xs"><span className="text-slate-500">Gęstość:</span><span className={`font-mono ${iter.density >= 50 ? 'text-emerald-400' : iter.density > 30 ? 'text-amber-400' : 'text-red-400'}`}>{iter.density.toFixed(1)}%</span></div>
        <div className="flex justify-between text-xs"><span className="text-slate-500">Przecięcia<sup>(avg)</sup>:</span><span className={`font-mono tracking-tighter ${iter.avgIntersections > 2.25 ? 'text-emerald-400' : iter.avgIntersections > 2.15 ? 'text-amber-400' : 'text-red-400'}`}>{iter.intersections} <sup className="font-bold tracking-wide">{iter.avgIntersections.toFixed(1)}</sup></span></div>
        <div className="flex justify-between text-xs"><span className="text-slate-500">Odstające:</span><span className={`font-mono ${outliers <= 7 ? 'text-emerald-400' : outliers <= 16 ? 'text-amber-400' : 'text-red-400'}`}>{outliers}</span></div>
        <div className="flex justify-between text-xs"><span className="text-slate-500">Wynik:</span><span className="font-mono text-slate-400">{iter.score.toFixed(2)}</span></div>
      </div>
    </>
    return isButton ? <button key={iter.id} onClick={() => selectIteration(originalIndex)} className={className}>{content}</button> : <div key={iter.id} className={className}>{content}</div>
  }

  return {
    wordEntries,
    setWordEntries,
    newWordInput,
    setNewWordInput,
    newHintInput,
    setNewHintInput,
    passwordInput,
    setPasswordInput,
    password,
    gridNumbers,
    hintInput,
    setHintInput,
    grid,
    placedWords,
    allPlacedWords,
    hiddenWords,
    disconnectedHiddenWords,
    stats,
    isGenerating,
    svgRef,
    iterationsRef,
    hideWords,
    revealedLetters,
    indicateVowels,
    indicatePolishChars,
    generationProgress,
    generatedIterations,
    selectedIterationIndex,
    iterationsExpanded,
    uniqueLetters,
    enabledCount,
    sorted,
    filledCells,
    sortedIterations,
    topIterations,
    preparePassword,
    assignPassPositions,
    rebuildGrid,
    updateDisplay,
    findConnected,
    toggleWordVisibility,
    toggleEnabled,
    updateWord,
    updateHint,
    removeEntry,
    addWord,
    getHint,
    selectAllEntries,
    removeAllEntries,
    rotateGrid,
    handleHideWordsChange,
    handleRevealedLettersChange,
    handleIndicateVowelsChange,
    handleIndicatePolishCharsChange,
    currentTopIndex,
    prevIteration,
    nextIteration,
    scrollToIterations,
    isIterationBest,
    selectIteration,
    handleGenerate,
    downloadSVG,
    shouldShowLetter,
    getHelperTextString,
    renderCrosswordSVG,
    renderIterationCard,
    setHiddenWords,
    setDisconnectedHiddenWords,
    setGrid,
    setPlacedWords,
    setAllPlacedWords,
    setGeneratedIterations,
    setSelectedIterationIndex,
    setIterationsExpanded,
    setIsGenerating,
    setStats,
    setRevealedLetters,
    setIndicateVowels,
    setIndicatePolishChars,
    setHideWords
  }
}