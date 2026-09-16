import { readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'

/** A patient's type is a label to find people by, not a fork.
 *
 *  Regular and orthodontic patients share one record, one set of histories,
 *  one chart, one invoice flow and one recall. Nothing outside the patients
 *  feature reads `patient_type`, and the moment something does, this app has
 *  two kinds of patient to keep working rather than one.
 *
 *  A structural test rather than a behavioural one because what is being
 *  protected is an absence — and an absence is exactly what a behavioural
 *  test cannot notice coming back. If the clinic later asks for a real
 *  difference (its own report, its own screen), delete this test in the same
 *  commit that introduces it, deliberately.
 */
// process.cwd() rather than import.meta.url, as in noBilling.test.ts.
const FEATURES = join(process.cwd(), 'src/features')
const CORE = join(process.cwd(), 'src/core')

function sourceFiles(dir: string): string[] {
  return readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = join(dir, entry.name)
    if (entry.isDirectory()) return sourceFiles(full)
    if (!/\.tsx?$/.test(entry.name)) return []
    return [full]
  })
}

describe('patient type', () => {
  // Everything except the patients feature, which is where it belongs.
  const files = [
    ...readdirSync(FEATURES, { withFileTypes: true })
      .filter((e) => e.isDirectory() && e.name !== 'patients')
      .flatMap((e) => sourceFiles(join(FEATURES, e.name))),
    ...sourceFiles(CORE),
  ]

  it('has source files to check', () => {
    expect(files.length).toBeGreaterThan(20)
  })

  it('is read nowhere outside the patients feature', () => {
    const offenders: string[] = []
    for (const file of files) {
      readFileSync(file, 'utf8')
        .split('\n')
        .forEach((line, i) => {
          if (/\b(patient_type|PatientType|patientType|orthodontic)\b/i.test(line)) {
            offenders.push(`${file}:${i + 1}: ${line.trim()}`)
          }
        })
    }
    expect(
      offenders,
      `a patient's type is a label, not a fork — these read it:\n${offenders.join('\n')}`,
    ).toEqual([])
  })
})
