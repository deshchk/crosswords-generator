import {useState, useRef, useEffect, type ChangeEvent} from 'react'

type Dir = 'across' | 'down'
interface WordEntry { enabled: boolean, word: string, hint: string }
interface PasswordChar { char: string, newWord: boolean, gridPosition: { x: number, y: number } | null, isGiven: boolean, number: number }
interface PlacedWord { word: string, x: number, y: number, direction: Dir }
interface BeamState { grid: Map<string, string>, placedWords: PlacedWord[], remainingWords: string[], score: number }
interface GeneratedIteration { id: number, grid: string[][], placedWords: PlacedWord[], score: number, density: number, intersections: number, wordCount: number, totalWords: number, avgIntersections: number }

const STORAGE_KEYS = { WORD_ENTRIES: 'crossword_word_entries', PASSWORD: 'crossword_password', HINT: 'crossword_hint' }
const POLISH_VOWELS = new Set(['A', 'Ą', 'E', 'Ę', 'I', 'O', 'Ó', 'U', 'Y'])
const POLISH_SPECIAL_CHARS = new Set(['Ą', 'Ć', 'Ę', 'Ł', 'Ń', 'Ó', 'Ś', 'Ź', 'Ż'])
const CELL_SIZE = 32, SMALL_CELL_SIZE = 24, HINT_CHAR_WIDTH = 5, HINT_LINE_HEIGHT = 16, HELPER_LINE_HEIGHT = 18, WORD_HINT_MAX_WIDTH = 280, GAP = 64
const GEN_ATTEMPTS = 100
const TOP_ITERATIONS_COUNT = 10

const getPos = (x: number, y: number, i: number, dir: Dir): [number, number] => dir === 'across' ? [x + i, y] : [x, y + i]

const shuffle = <T,>(arr: T[]): T[] => {
  const r = [...arr]
  for (let i = r.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [r[i], r[j]] = [r[j], r[i]] }
  return r
}

const getBounds = (grid: Map<string, string>) => {
  if (!grid.size) return { minX: 0, maxX: 0, minY: 0, maxY: 0, width: 1, height: 1, area: 1 }
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity
  for (const key of grid.keys()) { const [x, y] = key.split(',').map(Number); minX = Math.min(minX, x); maxX = Math.max(maxX, x); minY = Math.min(minY, y); maxY = Math.max(maxY, y) }
  const width = maxX - minX + 1, height = maxY - minY + 1
  return { minX, maxX, minY, maxY, width, height, area: width * height }
}

const placeWord = (grid: Map<string, string>, word: string, x: number, y: number, dir: Dir) => {
  for (let i = 0; i < word.length; i++) { const [cx, cy] = getPos(x, y, i, dir); grid.set(`${cx},${cy}`, word[i]) }
}

const canPlaceWord = (grid: Map<string, string>, word: string, x: number, y: number, dir: Dir) => {
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

const countTotalIntersections = (grid: Map<string, string>, placedWords: PlacedWord[]) => {
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

const countIntersectionsPerWord = (grid: Map<string, string>, placedWords: PlacedWord[]): Map<string, number> => {
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

const countFilledCellsFromGrid = (grid: Map<string, string>): number => {
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

const calculateCompactness = (grid: Map<string, string>): number => {
  if (grid.size < 2) return 1
  const bounds = getBounds(grid)
  const perimeter = 2 * (bounds.width + bounds.height)
  const idealPerimeter = 4 * Math.sqrt(grid.size)
  return Math.min(1, idealPerimeter / perimeter)
}

const findPlacements = (grid: Map<string, string>, word: string, remaining: string[]) => {
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

const scoreState = (state: BeamState) => {
  const intersectionsPerWord = countIntersectionsPerWord(state.grid, state.placedWords)
  let totalWordIntersections = 0
  for (const [, count] of intersectionsPerWord) { totalWordIntersections += count }
  const avgIntersections = state.placedWords.length > 0 ? totalWordIntersections / state.placedWords.length : 0
  const compactness = calculateCompactness(state.grid)
  return (avgIntersections * compactness * 100)
}

const beamSearch = async (words: string[], beamWidth: number, initDir: Dir): Promise<BeamState> => {
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

const retryFailed = async (state: BeamState): Promise<BeamState> => {
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

const getFilledCells = (grid: string[][] | null): Set<string> => {
  if (!grid?.length || !grid[0]?.length) return new Set()
  const height = grid.length, width = grid[0].length, connectedToEdge = new Set<string>(), queue: [number, number][] = []
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if ((y === 0 || y === height - 1 || x === 0 || x === width - 1) && grid[y][x] === '-') { const key = `${x},${y}`; if (!connectedToEdge.has(key)) { connectedToEdge.add(key); queue.push([x, y]) } }
  while (queue.length) { const [x, y] = queue.shift()!; for (const [nx, ny] of [[x - 1, y], [x + 1, y], [x, y - 1], [x, y + 1]] as [number, number][]) if (nx >= 0 && nx < width && ny >= 0 && ny < height && !connectedToEdge.has(`${nx},${ny}`) && grid[ny][nx] === '-') { connectedToEdge.add(`${nx},${ny}`); queue.push([nx, ny]) } }
  const filledCells = new Set<string>()
  for (let y = 0; y < height; y++) for (let x = 0; x < width; x++) if (grid[y][x] === '-' && !connectedToEdge.has(`${x},${y}`)) filledCells.add(`${x},${y}`)
  return filledCells
}

const wrapText = (text: string, maxWidth: number, charWidth: number): string[] => {
  const words = text.split(' '), lines: string[] = []
  let currentLine = ''
  for (const word of words) { const testLine = currentLine ? `${currentLine} ${word}` : word; if (testLine.length * charWidth > maxWidth && currentLine) { lines.push(currentLine); currentLine = word } else currentLine = testLine }
  if (currentLine) lines.push(currentLine)
  return lines
}

const normalizeGrid = (grid: string[][]): string => {
  const height = grid.length, width = grid[0]?.length || 0
  const normalized: string[][] = []
  for (let y = 0; y < height; y++) {
    const row: string[] = []
    for (let x = 0; x < width; x++) row.push(grid[y][x])
    normalized.push(row)
  }
  return normalized.map(row => row.join('')).join('|')
}

const rotateGrid90 = (grid: string[][]): string[][] => {
  const height = grid.length, width = grid[0]?.length || 0, rotated: string[][] = []
  for (let x = 0; x < width; x++) { const newRow: string[] = []; for (let y = height - 1; y >= 0; y--) newRow.push(grid[y][x]); rotated.push(newRow) }
  return rotated
}

const flipHorizontal = (grid: string[][]): string[][] => grid.map(row => [...row].reverse())

const flipVertical = (grid: string[][]): string[][] => [...grid].reverse().map(row => [...row])

const getAllTransformationHashes = (grid: string[][]): Set<string> => {
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

const CrosswordGenerator = () => {
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
    setStats(`Iteracja ${iteration.id} ${isIterationBest(index) ? '(najlepsza)' : ''} | Avg intersections: ${iteration.avgIntersections.toFixed(2)} | Words: ${iteration.wordCount}/${iteration.totalWords}`)
  }

  const handleGenerate = async () => {
    const words = wordEntries.filter(e => e.enabled && e.word.trim().length > 1).map(e => e.word.trim().toUpperCase())
    if (!words.length) return alert('Please enter at least one word')
    const prepPwd = preparePassword(passwordInput)
    setIsGenerating(true); setGrid(null); setPassword([]); setGridNumbers(new Map()); setPlacedWords([]); setAllPlacedWords([]); setHiddenWords(new Set()); setDisconnectedHiddenWords(new Set()); setStats('Rozpoczynam generowanie krzyżówki...'); setRevealedLetters(new Set()); setIndicateVowels(false); setIndicatePolishChars(false); setHideWords(true); setGeneratedIterations([]); setSelectedIterationIndex(0); setIterationsExpanded(false)
    let best: BeamState | null = null, bestScore = -Infinity
    const allIterations: GeneratedIteration[] = [], seenGridHashes = new Set<string>()
    for (let i = 0; i < GEN_ATTEMPTS; i++) {
      generationProgress.current = i+1
      setStats(`Generowanie iteracji ${i + 1}/${GEN_ATTEMPTS}...`); await new Promise(r => setTimeout(r, 10))
      try {
        const randomWidth = 50 + Math.floor(Math.random() * words.length*10)
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

        const score = (avgIntersections * compactness * 100) + (b.area/4+filledCellsCount) * density/4

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
      <svg ref={svgRef} viewBox={`-12 -20 ${totalWidth-10} ${totalHeight}`} xmlns="http://www.w3.org/2000/svg" style={{ fontFamily: 'sans-serif', width: '100%', maxWidth: totalWidth+'px', maxHeight: totalHeight+'px' }}>
        <g style={{ filter: 'drop-shadow(1px 0 0 black) drop-shadow(0 1px 0 black) drop-shadow(-1px 0 0 black) drop-shadow(0 -1px 0 black)' }}>
          {grid.map((row, y) => row.map((cell, x) => {
            const isFilled = filledCells.has(`${x},${y}`), isVowel = POLISH_VOWELS.has(cell), isPolishChar = POLISH_SPECIAL_CHARS.has(cell), hasNumber = gridNumbers.has(`${x},${y}`), number = gridNumbers.get(`${x},${y}`), cellX = x * CELL_SIZE, cellY = y * CELL_SIZE
            if (isFilled) return <g key={`${x},${y}`}><rect x={cellX} y={cellY} width={CELL_SIZE} height={CELL_SIZE} fill="white" stroke="black" strokeWidth="1" /><rect x={cellX + 3} y={cellY + 3} width={CELL_SIZE - 6} height={CELL_SIZE - 6} fill="black" /></g>
            if (cell === '-') return null
            return <g key={`${x},${y}`}><rect x={cellX} y={cellY} width={CELL_SIZE} height={CELL_SIZE} fill="white" stroke="black" strokeWidth="1" />{hasNumber && <text x={cellX + 3} y={cellY + 10} fontSize="9" fill="#666" fontWeight="500">{number}</text>}{shouldShowLetter(cell) && <text x={cellX + CELL_SIZE / 2} y={cellY + CELL_SIZE / 2 + 7} fontSize="20" fontWeight="600" textAnchor="middle" fill="black">{cell}</text>}{hideWords && indicateVowels && isVowel && <circle cx={cellX + 5} cy={cellY + CELL_SIZE - 5} r="2" fill="black" />}{hideWords && indicatePolishChars && isPolishChar && <polygon points={`${cellX + 3},${cellY + CELL_SIZE - 3} ${cellX + 6},${cellY + CELL_SIZE - 8} ${cellX + 9},${cellY + CELL_SIZE - 3}`} fill="black" />}</g>
          }))}
        </g>
        <g transform={`translate(${hintsX}, 6)`}>
          <rect x="-8" y="-8" width={WORD_HINT_MAX_WIDTH + 16} height={hintsHeight + 12} fill="white" stroke="#666" strokeWidth="1" rx="4" />
          {hintsContent.map((hint, idx) => <g key={idx} transform={`translate(0, ${hint.yOffset})`}><text x={0} y={12} fontSize="11" fill="black">•</text>{hint.lines.map((line, lineIdx) => <text key={lineIdx} x={10} y={12 + lineIdx * HINT_LINE_HEIGHT} fontSize="11" fill="black">{line}</text>)}</g>)}
        </g>
        {password.length > 0 && (
          <g transform={`translate(0, ${passwordY})`}>
            {helperLines.map((line, idx) => <text key={`helper-${idx}`} x={0} y={12 + idx * HELPER_LINE_HEIGHT} fontSize="12" fill="black">{line.split(' ').map((w, wi) => ['samogłoski', 'polskie_znaki'].includes(w) || w.replace(',', '').replace('_', ' ').length === 1 ? <tspan key={wi}><tspan fontWeight="700">{w.replace(',', '').replace('_', ' ')}</tspan>{w.includes(',') ? ', ' : ' '}</tspan> : <tspan key={wi}>{w} </tspan>)}</text>)}
            {solutionLines.map((line, idx) => <text key={`solution-${idx}`} x={0} y={14 + helperLines.length * HELPER_LINE_HEIGHT + idx * HELPER_LINE_HEIGHT} fontSize="12" fill="black" fontWeight="500">{line}</text>)}
            <g transform={`translate(0, ${helperLines.length * HELPER_LINE_HEIGHT + solutionLines.length * HELPER_LINE_HEIGHT + 10})`}>
              {password.map((char, i) => { const charX = i * SMALL_CELL_SIZE; if (char.newWord && i !== 0) newWord++; return <g key={i}><rect x={charX+newWord} y={0} width={SMALL_CELL_SIZE} height={SMALL_CELL_SIZE} fill="white" stroke="black" strokeWidth="1" /><text x={(charX + newWord/2) + SMALL_CELL_SIZE / 2} y={SMALL_CELL_SIZE / 2 + 5} fontSize="14" fontWeight="600" textAnchor="middle" fill={char.isGiven ? 'black' : 'transparent'}>{char.char.toUpperCase()}</text><text x={(charX + newWord/2) + SMALL_CELL_SIZE / 2} y={SMALL_CELL_SIZE + 10} fontSize="9" fontWeight="500" textAnchor="middle" fill="black" opacity={char.isGiven ? .5 : 1}>{char.number}</text></g> })}
            </g>
          </g>
        )}
      </svg>
    )
  }

  const renderIterationCard = (iter: GeneratedIteration, originalIndex: number, sortedIndex: number, isButton: boolean) => {
    const isBest = isIterationBest(originalIndex), isSelected = originalIndex === selectedIterationIndex
    const className = `relative p-4 rounded-xl border-2 transition-all duration-200 text-left ${isSelected || (!isButton && isBest) ? 'bg-indigo-500/20 border-indigo-500 shadow-lg shadow-indigo-500/20' : 'bg-slate-700/30 border-slate-600/30' + (isButton ? ' hover:bg-slate-700/50 hover:border-slate-500/50' : '')}`
    const content = <>
      {isBest && <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg"><svg className="w-3.5 h-3.5 text-white" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg></div>}
      <div className="flex items-center justify-between mb-2"><span className={`text-sm font-bold ${isSelected || (!isButton && isBest) ? 'text-indigo-300' : 'text-slate-300'}`}>#{sortedIndex + 1}</span><span className="text-xs text-slate-500">iter {iter.id}</span></div>
      <div className="space-y-1">
        <div className="flex justify-between text-xs"><span className="text-slate-500">Gęstość:</span><span className={`font-mono ${iter.density >= 50 ? 'text-emerald-400' : iter.density > 30 ? 'text-amber-400' : 'text-red-400'}`}>{iter.density.toFixed(1)}%</span></div>
        <div className="flex justify-between text-xs"><span className="text-slate-500">Przecięcia:</span><span className={`font-mono ${iter.avgIntersections > 2.25 ? 'text-emerald-400' : iter.avgIntersections > 2.15 ? 'text-amber-400' : 'text-red-400'}`}>{iter.intersections} ({iter.avgIntersections.toFixed(2)})</span></div>
        <div className="flex justify-between text-xs"><span className="text-slate-500">Wynik:</span><span className="font-mono text-slate-400">{iter.score.toFixed(2)}</span></div>
      </div>
    </>
    return isButton ? <button key={iter.id} onClick={() => selectIteration(originalIndex)} className={className}>{content}</button> : <div key={iter.id} className={className}>{content}</div>
  }

  return (
    <div className="min-h-screen w-full bg-gradient-to-br from-slate-900 via-slate-800 to-slate-900">
      <div className="max-w-6xl mx-auto px-4 py-8">
        <header className="text-center mb-10">
          <h1 className="text-4xl font-bold text-white mb-2 tracking-tight"><span className="bg-gradient-to-r from-amber-400 via-orange-400 to-amber-500 bg-clip-text text-transparent">Generator Krzyżówek</span></h1>
          <p className="text-slate-400 text-sm">Stwórz własną ala-Jolkową krzyżówkę</p>
        </header>
        <div className="grid lg:grid-cols-3 gap-6 mb-8">
          <div className="lg:col-span-2 flex flex-col bg-slate-800/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 shadow-xl overflow-hidden">
            <div className="px-5 py-4 bg-slate-700/30 border-b border-slate-700/50 flex items-center justify-between gap-x-3">
              <div className="flex items-center gap-3"><div className="w-8 h-8 rounded-lg bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shrink-0"><svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 10h16M4 14h16M4 18h16" /></svg></div><h2 className="text-lg font-semibold text-white whitespace-nowrap">Lista słów</h2></div>
              <div className="flex items-center justify-end gap-x-4 gap-y-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <button onClick={selectAllEntries} className="px-3 py-1 rounded-full text-xs font-medium bg-emerald-500/20 text-emerald-400 border border-emerald-500/30 hover:bg-emerald-500/30 transition-colors">{wordEntries.some(e => !e.enabled) ? <span>Zaznacz</span> : <span>Odznacz</span>} wszystkie</button>
                  <button onClick={removeAllEntries} className="px-3 py-1 rounded-full text-xs font-medium bg-red-500/20 text-red-400 border border-red-500/30 hover:bg-red-500/30 transition-colors">Usuń wszystkie</button>
                </div>
                <div className={`flex items-center gap-1 px-3 py-1 rounded-full text-xs font-medium ${enabledCount !== 0 ? 'bg-amber-500/20 text-amber-400 border border-amber-500/30' : 'bg-slate-600/50 text-slate-400 border border-slate-600/50'}`}>
                  <span>{enabledCount}</span>/<span>{wordEntries.length}</span>
                </div>
              </div>
            </div>
            <div className="p-4 max-h-[317px] overflow-y-auto">
              <div className="space-y-2">
                {wordEntries.map((e, i) => (
                  <div key={i} className={`group flex items-center gap-3 p-3 rounded-xl transition-all duration-200 ${e.enabled ? 'bg-slate-700/40 hover:bg-slate-700/60 border border-slate-600/30' : 'bg-slate-800/30 opacity-60 border border-transparent'}`}>
                    <label className="relative flex items-center cursor-pointer"><input type="checkbox" checked={e.enabled} onChange={() => toggleEnabled(i)} className="peer sr-only" /><div className="w-5 h-5 rounded-md border-2 border-slate-500 peer-checked:border-amber-500 peer-checked:bg-amber-500 transition-all flex items-center justify-center"><svg className="w-3 h-3 text-white opacity-0 peer-checked:opacity-100 transition-opacity" fill="currentColor" viewBox="0 0 20 20"><path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" /></svg></div></label>
                    <input type="text" value={e.word} onChange={ev => updateWord(i, ev.target.value)} className="w-28 px-3 py-1.5 bg-slate-900/50 border border-slate-600/50 rounded-lg font-mono uppercase text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 transition-all" placeholder="wyraz" />
                    <input type="text" value={e.hint} onChange={ev => updateHint(i, ev.target.value)} className="flex-1 px-3 py-1.5 bg-slate-900/50 border border-slate-600/50 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 transition-all" placeholder="podpowiedź, definicja" />
                    <button onClick={() => removeEntry(i)} className="w-8 h-8 flex items-center justify-center rounded-lg text-slate-500 hover:text-red-400 hover:bg-red-500/10 opacity-0 group-hover:opacity-100 transition-all"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" /></svg></button>
                  </div>
                ))}
              </div>
            </div>
            <div className="p-4 bg-slate-700/20 border-t border-slate-700/50 mt-auto">
              <div className="flex gap-2">
                <input type="text" value={newWordInput} onChange={e => setNewWordInput(e.target.value)} className="w-32 px-3 py-2 bg-slate-900/50 border border-slate-600/50 rounded-lg font-mono uppercase text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 transition-all" placeholder="nowy wyraz" onKeyDown={e => e.key === 'Enter' && addWord()} />
                <input type="text" value={newHintInput} onChange={e => setNewHintInput(e.target.value)} className="flex-1 px-3 py-2 bg-slate-900/50 border border-slate-600/50 rounded-lg text-sm text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-amber-500/50 focus:border-amber-500/50 transition-all" placeholder="podpowiedź, definicja" onKeyDown={e => e.key === 'Enter' && addWord()} />
                <button onClick={addWord} className="px-4 py-2 bg-gradient-to-r from-emerald-500 to-green-600 hover:from-emerald-600 hover:to-green-700 text-white font-medium rounded-lg transition-all duration-200 flex items-center gap-2 shadow-lg shadow-emerald-500/20"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" /></svg>Dodaj</button>
              </div>
            </div>
          </div>
          <div className={`grid gap-6 ${isGenerating ? 'grid-rows-[auto_auto]' : 'grid-rows-[auto_auto_1fr]'}`}>
            <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 shadow-xl overflow-hidden">
              <div className="px-5 py-4 bg-slate-700/30 border-b border-slate-700/50 flex items-center gap-3"><div className="w-8 h-8 rounded-lg bg-gradient-to-br from-violet-400 to-purple-500 flex items-center justify-center"><svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 7a2 2 0 012 2m4 0a6 6 0 01-7.743 5.743L11 17H9v2H7v2H4a1 1 0 01-1-1v-2.586a1 1 0 01.293-.707l5.964-5.964A6 6 0 1121 9z" /></svg></div><h2 className="text-lg font-semibold text-white">Rozwiązanie krzyżówki</h2></div>
              <div className="p-5 space-y-4">
                <div><label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">Rozwiązanie</label><input className="w-full px-4 py-2.5 bg-slate-900/50 border border-slate-600/50 rounded-lg font-mono uppercase text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500/50 transition-all" placeholder="wspaniałe stulecie" value={passwordInput} onChange={e => setPasswordInput(e.target.value)} /></div>
                <div><label className="block text-xs font-medium text-slate-400 uppercase tracking-wider mb-2">Podpowiedź</label><input className="w-full px-4 py-2.5 bg-slate-900/50 border border-slate-600/50 rounded-lg text-white placeholder-slate-500 focus:outline-none focus:ring-2 focus:ring-violet-500/50 focus:border-violet-500/50 transition-all" placeholder="jeden z Twoich ulubionych seriali" value={hintInput} onChange={e => setHintInput(e.target.value)} /></div>
              </div>
            </div>
            {isGenerating ? (
              <div className="p-6 rounded-xl border bg-gradient-to-br from-amber-500/10 to-orange-500/10 border-amber-500/30 animate-pulse">
                <div className="flex items-center gap-4">
                  <div className="relative"><div className="w-12 h-12 rounded-full border-4 border-amber-500/30 border-t-amber-500 animate-spin"></div><div className="absolute inset-0 flex items-center justify-center"><svg className="w-5 h-5 text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg></div></div>
                  <div className="flex-1"><p className="text-amber-400 font-semibold mb-1">Generowanie krzyżówki...</p><p className="text-slate-400 text-sm">{stats}</p></div>
                </div>
                {generatedIterations.length > 0 && <div className="mt-4 pt-4 border-t border-amber-500/20"><div className="flex items-center justify-between text-sm"><span className="text-slate-400">Znaleziono unikatowych iteracji:</span><span className="text-amber-400 font-mono font-bold">{generatedIterations.length}</span></div><div className="mt-2 h-2 bg-slate-700/50 rounded-full overflow-hidden"><div className="h-full bg-gradient-to-r from-amber-400 to-orange-500 transition-all duration-300 rounded" style={{ width: `${(generationProgress.current / (GEN_ATTEMPTS)) * 100}%` }}></div></div></div>}
              </div>
            ) : (
              <div className="flex gap-3"><button className={`flex-1 py-3.5 px-6 rounded-xl font-semibold text-white transition-all duration-300 flex items-center justify-center gap-2 shadow-xl ${isGenerating ? 'bg-gradient-to-r from-amber-600 to-orange-600' : 'bg-gradient-to-r from-amber-500 to-orange-500 hover:from-amber-600 hover:to-orange-600 hover:shadow-amber-500/30 hover:scale-[1.02]'}`} onClick={handleGenerate} disabled={isGenerating}><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 10V3L4 14h7v7l9-11h-7z" /></svg>Generuj</button></div>
            )}
            {!isGenerating && stats && <div className={`p-4 rounded-xl border grid place-items-center text-center ${stats.includes('✅') ? 'bg-emerald-500/10 border-emerald-500/30 text-emerald-400' : stats.includes('❌') ? 'bg-red-500/10 border-red-500/30 text-red-400' : 'bg-slate-700/30 border-slate-600/30 text-slate-300'}`}><p className="text-sm font-mono">{stats}</p></div>}
          </div>
        </div>
        {isGenerating && generatedIterations.length > 0 && (
          <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 shadow-xl overflow-hidden mb-8">
            <div className="px-5 py-4 bg-slate-700/30 border-b border-slate-700/50 flex items-center justify-between">
              <div className="flex items-center gap-3"><div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-400 to-blue-500 flex items-center justify-center animate-pulse"><svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg></div><h2 className="text-lg font-semibold text-white">Najlepsze iteracje</h2></div>
              <span className="px-3 py-1 rounded-full text-xs font-medium bg-indigo-500/20 text-indigo-400 border border-indigo-500/30 animate-pulse">Top {Math.min(TOP_ITERATIONS_COUNT, generatedIterations.length)} z {generatedIterations.length}</span>
            </div>
            <div className="p-5"><div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">{sortedIterations.slice(0, TOP_ITERATIONS_COUNT).map((iter, sortedIndex) => { const originalIndex = generatedIterations.findIndex(i => i.id === iter.id); return renderIterationCard(iter, originalIndex, sortedIndex, false) })}</div></div>
          </div>
        )}
        {!isGenerating && generatedIterations.length > 1 && (
          <div ref={iterationsRef} className="scroll-mt-5 bg-slate-800/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 shadow-xl overflow-hidden mb-8">
            <button onClick={() => setIterationsExpanded(!iterationsExpanded)} className="w-full px-5 py-4 bg-slate-700/30 border-b border-slate-700/50 flex items-center justify-between hover:bg-slate-700/50 transition-colors">
              <div className="flex items-center gap-3"><div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-400 to-blue-500 flex items-center justify-center"><svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg></div><h2 className="text-lg font-semibold text-white">Najlepsze iteracje</h2></div>
              <div className="flex items-center gap-3">
                <span className="px-3 py-1 rounded-full text-xs font-medium bg-indigo-500/20 text-indigo-400 border border-indigo-500/30">top {Math.min(TOP_ITERATIONS_COUNT, generatedIterations.length)} z {generatedIterations.length}</span>
                <svg className={`w-5 h-5 text-slate-400 transition-transform duration-200 ${iterationsExpanded ? 'rotate-180' : ''}`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg>
              </div>
            </button>
            {iterationsExpanded && <div className="p-5"><div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-3">{topIterations.map((iter, sortedIndex) => { const originalIndex = generatedIterations.findIndex(i => i.id === iter.id); return renderIterationCard(iter, originalIndex, sortedIndex, true) })}</div></div>}
          </div>
        )}
        {!isGenerating && grid && placedWords.length > 0 && (
          <div className="grid lg:grid-cols-2 gap-6 mb-8">
            <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 shadow-xl overflow-hidden flex flex-col">
              <div className="px-5 py-4 bg-slate-700/30 border-b border-slate-700/50 flex items-center justify-between"><div className="flex items-center gap-3"><div className="w-8 h-8 rounded-lg bg-gradient-to-br from-rose-400 to-pink-500 flex items-center justify-center"><svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" /></svg></div><h2 className="text-lg font-semibold text-white">Umieszczone słowa</h2></div><span className="px-3 py-1 rounded-full text-xs font-medium bg-rose-500/20 text-rose-400 border border-rose-500/30">{placedWords.length}/{allPlacedWords.length} słów</span></div>
              <div className="p-5 flex-1 overflow-y-auto max-h-[219px]"><div className="flex flex-wrap gap-2">{sorted.map((pw, i) => { const isHidden = hiddenWords.has(pw.word); const isDisconnectedHidden = disconnectedHiddenWords.has(pw.word); return <button key={i} onClick={() => toggleWordVisibility(pw.word)} className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-mono transition-all duration-200 border group ${isDisconnectedHidden ? 'bg-slate-800/50 text-slate-600 border-slate-700/30 cursor-not-allowed' : isHidden ? 'bg-slate-800/50 text-slate-500 border-slate-700/30 hover:bg-slate-700/50 hover:text-slate-400' : 'bg-slate-700/50 hover:bg-amber-500/20 text-slate-300 hover:text-amber-400 border-slate-600/30 hover:border-amber-500/30'}`} title={isDisconnectedHidden ? `"${pw.word}" – ukryte jako zależność` : isHidden ? `Przywróć "${pw.word}"` : `Ukryj "${pw.word}"`} disabled={isDisconnectedHidden}>{pw.word.toLowerCase()}{isHidden ? <svg className={`w-3.5 h-3.5 ${isDisconnectedHidden ? 'opacity-30' : 'opacity-50 group-hover:opacity-100'} transition-opacity`} fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13.875 18.825A10.05 10.05 0 0112 19c-4.478 0-8.268-2.943-9.543-7a9.97 9.97 0 011.563-3.029m5.858.908a3 3 0 114.243 4.243M9.878 9.878l4.242 4.242M9.88 9.88l-3.29-3.29m7.532 7.532l3.29 3.29M3 3l3.59 3.59m0 0A9.953 9.953 0 0112 5c4.478 0 8.268 2.943 9.543 7a10.025 10.025 0 01-4.132 5.411m0 0L21 21" /></svg> : <svg className="w-3.5 h-3.5 opacity-50 group-hover:opacity-100 transition-opacity" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" /><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M2.458 12C3.732 7.943 7.523 5 12 5c4.478 0 8.268 2.943 9.542 7-1.274 4.057-5.064 7-9.542 7-4.477 0-8.268-2.943-9.542-7z" /></svg>}</button> })}</div></div>
            </div>
            <div className="bg-slate-800/50 backdrop-blur-sm rounded-2xl border border-slate-700/50 shadow-xl overflow-hidden flex flex-col">
              <div className="px-5 py-4 bg-slate-700/30 border-b border-slate-700/50 flex items-center gap-3"><div className="w-8 h-8 rounded-lg bg-gradient-to-br from-cyan-400 to-blue-500 flex items-center justify-center"><svg className="w-4 h-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6V4m0 2a2 2 0 100 4m0-4a2 2 0 110 4m-6 8a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4m6 6v10m6-2a2 2 0 100-4m0 4a2 2 0 110-4m0 4v2m0-6V4" /></svg></div><h2 className="text-lg font-semibold text-white">Opcje wyświetlania</h2></div>
              <div className="p-5 flex-1">
                <div className="grid grid-cols-2 gap-6">
                  <div className="space-y-4">
                    <label className="flex items-center gap-3 cursor-pointer group"><div className="relative"><input type="checkbox" checked={hideWords} onChange={(e) => handleHideWordsChange(e.target.checked)} className="peer sr-only" /><div className="w-11 h-6 bg-slate-600 rounded-full peer-checked:bg-amber-500 transition-all"></div><div className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-md peer-checked:translate-x-5 transition-all"></div></div><span className="text-sm text-slate-300 group-hover:text-white transition-colors">Ukryj słowa</span></label>
                    <label className={`flex items-center gap-3 ${!hideWords || revealedLetters.size > 0 ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer group'}`}><div className="relative"><input type="checkbox" checked={indicateVowels} disabled={!hideWords || revealedLetters.size > 0} onChange={(e) => handleIndicateVowelsChange(e.target.checked)} className="peer sr-only" /><div className="w-11 h-6 bg-slate-600 rounded-full peer-checked:bg-cyan-500 transition-all peer-disabled:opacity-50"></div><div className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-md peer-checked:translate-x-5 transition-all"></div></div><span className="text-sm text-slate-300 group-hover:text-white transition-colors">Wskaż samogłoski</span></label>
                    <label className={`flex items-center gap-3 ${!hideWords || revealedLetters.size > 0 ? 'opacity-40 cursor-not-allowed' : 'cursor-pointer group'}`}><div className="relative"><input type="checkbox" checked={indicatePolishChars} disabled={!hideWords || revealedLetters.size > 0} onChange={(e) => handleIndicatePolishCharsChange(e.target.checked)} className="peer sr-only" /><div className="w-11 h-6 bg-slate-600 rounded-full peer-checked:bg-violet-500 transition-all peer-disabled:opacity-50"></div><div className="absolute top-0.5 left-0.5 w-5 h-5 bg-white rounded-full shadow-md peer-checked:translate-x-5 transition-all"></div></div><span className="text-sm text-slate-300 group-hover:text-white transition-colors">Wskaż polskie znaki</span></label>
                    <div className="mt-4 pt-4 border-t border-slate-700/50">
                      <button onClick={rotateGrid} className="w-full px-4 py-2 bg-slate-700/50 hover:bg-slate-600/50 text-slate-300 hover:text-white rounded-lg transition-all flex items-center justify-center gap-2 border border-slate-600/30"><svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" /></svg>Obróć</button>
                    </div>
                  </div>
                  <div className="flex flex-col gap-2">
                    <label className="text-xs font-medium text-slate-400 uppercase tracking-wider">Ujawnij litery (Ctrl/Cmd + click)</label>
                    <select multiple disabled={!hideWords} value={[...revealedLetters]} onChange={handleRevealedLettersChange} className="size-full bg-slate-900/50 border border-slate-600/50 rounded-lg px-3 py-2 text-sm text-white focus:outline-none focus:ring-2 focus:ring-cyan-500/50 disabled:opacity-40 disabled:cursor-not-allowed transition-all">{uniqueLetters.map(letter => <option key={letter} value={letter} className="py-1">{letter}</option>)}</select>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>
      {!isGenerating && grid && (
        <div className="pt-10 pb-5 crossword-bg flex flex-col gap-y-10">
          <div className="flex gap-2 ml-10">
            <div onClick={scrollToIterations} className="relative flex items-center justify-between gap-3 bg-slate-800 backdrop-blur-sm rounded-l-2xl rounded-r-lg border border-slate-700 shadow-xl p-4">
              <div className="w-8 h-8 rounded-lg bg-gradient-to-br from-indigo-400 to-blue-500 flex items-center justify-center"><svg className="size-4 text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" /></svg></div>
              {isIterationBest(selectedIterationIndex) && <div className="absolute -top-2 -right-2 w-6 h-6 rounded-full bg-gradient-to-br from-amber-400 to-orange-500 flex items-center justify-center shadow-lg"><svg className="w-3.5 h-3.5 text-white" fill="currentColor" viewBox="0 0 20 20"><path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" /></svg></div>}
            </div>
            <div className="grid gap-1">
              <button onClick={prevIteration} className="px-3 bg-slate-800 opacity-30 hover:opacity-100 text-slate-300 hover:text-white rounded-lg rounded-tr-2xl transition-all flex items-center justify-center gap-2 border border-slate-700"><svg className="size-5 transition-transform duration-200 rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg></button>
              <button onClick={nextIteration} className="px-3 bg-slate-800 opacity-30 hover:opacity-100 text-slate-300 hover:text-white rounded-lg rounded-br-2xl transition-all flex items-center justify-center gap-2 border border-slate-700"><svg className="size-5 transition-transform duration-200 -rotate-90" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" /></svg></button>
            </div>
          </div>
          <div className="grid place-items-center px-10">{renderCrosswordSVG()}</div>
          <div className="flex justify-center mb-10"><button onClick={downloadSVG} className="px-6 py-3 bg-emerald-500 hover:bg-emerald-700 text-white font-semibold rounded-xl transition-all duration-200 flex items-center gap-2"><svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-4l-4 4m0 0l-4-4m4 4V4" /></svg>Pobierz SVG</button></div>
        </div>
      )}
    </div>
  )
}

export default CrosswordGenerator