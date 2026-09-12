import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/** Charting knows nothing about money.
 *
 *  A tooth chart records findings — what is there, what was done to it. What
 *  anybody was charged is a different question, asked in a different place,
 *  by different people. Billing lived here for a while and was moved into
 *  the patient's visit history, which is where a visit is read about
 *  afterwards.
 *
 *  This is a structural test rather than a behavioural one because the thing
 *  being protected is an absence, and an absence is exactly what a
 *  behavioural test cannot notice coming back.
 */
// process.cwd() rather than import.meta.url: under vitest the latter
// resolves against the project root and yields /src/features/charting.
const CHARTING = join(process.cwd(), 'src/features/charting')

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(full)
    if (!/\.tsx?$/.test(entry.name)) return []
    // This file names the forbidden words in order to forbid them.
    if (entry.name === 'noBilling.test.ts') return []
    return [full]
  })
}

describe('the charting feature', () => {
  const files = sourceFiles(CHARTING)

  it('has source files to check', () => {
    expect(files.length).toBeGreaterThan(5)
  })

  it('imports nothing from the billing feature', () => {
    const offenders = files.filter((f) => /from ['"][^'"]*\/billing\//.test(readFileSync(f, 'utf8')))
    expect(offenders, `charting must not import from billing:\n${offenders.join('\n')}`).toEqual([])
  })

  // Not even a "view invoice" pointer: a link is a reference, and the point
  // is that the chart does not raise the subject at all.
  it('mentions no invoice, bill or charge anywhere', () => {
    const offenders: string[] = []
    for (const file of files) {
      const lines = readFileSync(file, 'utf8').split('\n')
      lines.forEach((line, i) => {
        if (/\b(invoice|billing|billable)\b/i.test(line)) offenders.push(`${file}:${i + 1}: ${line.trim()}`)
      })
    }
    expect(offenders, `charting must not mention billing:\n${offenders.join('\n')}`).toEqual([])
  })

  it('routes nowhere near an invoice', () => {
    const offenders = files.filter((f) => /\/invoices?\//.test(readFileSync(f, 'utf8')))
    expect(offenders, `charting must not link to invoices:\n${offenders.join('\n')}`).toEqual([])
  })
})
