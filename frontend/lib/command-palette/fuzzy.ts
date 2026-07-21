/** Subsequence fuzzy match with higher scores for consecutive and start matches. */
export function fuzzyScore(query: string, text: string): number | null {
  const q = query.trim().toLowerCase()
  const t = text.trim().toLowerCase()
  if (!q) return 1
  if (!t) return null

  if (t === q) return 1000
  if (t.startsWith(q)) return 900 + (100 - Math.min(t.length, 100))
  if (t.includes(q)) return 700 + (100 - t.indexOf(q))

  let qi = 0
  let score = 0
  let lastMatch = -1
  let consecutive = 0

  for (let i = 0; i < t.length && qi < q.length; i++) {
    if (t[i] === q[qi]) {
      consecutive = lastMatch === i - 1 ? consecutive + 1 : 0
      score += 10 + consecutive * 5
      if (i === 0) score += 20
      if (/[^a-z0-9]/.test(t[i - 1] ?? "")) score += 8
      lastMatch = i
      qi++
    }
  }

  return qi === q.length ? score : null
}

export function fuzzyFilter<T>(
  query: string,
  items: T[],
  getText: (item: T) => string,
): T[] {
  const q = query.trim()
  if (!q) return items

  return items
    .map((item) => ({ item, score: fuzzyScore(q, getText(item)) }))
    .filter((row): row is { item: T; score: number } => row.score != null)
    .sort((a, b) => b.score - a.score)
    .map((row) => row.item)
}
