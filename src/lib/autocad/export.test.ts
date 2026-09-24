import { describe, it, expect } from 'vitest'
import {
  isPreStandardProject,
  projectNumberFrom,
  buildProjectValues,
  buildDrawingValues,
  buildExportCsv,
  exportFileName,
  buildMissingValueWarnings,
  diffSnapshots,
  PROJECT_TAGS,
  DRAWING_TAGS,
  type ExportSnapshot,
} from './export'

describe('pre-standard projects (v7.2 §8.6)', () => {
  it('uses the project start date against the standard’s roll-out date', () => {
    expect(isPreStandardProject('2026-09-21')).toBe(true)
    expect(isPreStandardProject('2026-09-22')).toBe(false)
    expect(isPreStandardProject('2026-10-01')).toBe(false)
  })

  it('shows nothing when no start date is recorded, rather than guessing', () => {
    expect(isPreStandardProject(null)).toBe(false)
  })
})

describe('the six project values (§8.2)', () => {
  const project = {
    soNumber: 'AD0746V26P',
    name: 'Sample Tower',
    clientName: 'Main Contractor Co',
    cadOwnerName: 'Building Owner Ltd',
    cadConsultantName: 'Consultant Partners',
  }

  it('sends the SO number twice — full under SONO, compact under PROJECTNO', () => {
    const v = buildProjectValues({ ...project, soNumber: 'AD-0746-V26P' })
    expect(v.SONO).toBe('AD-0746-V26P')
    expect(v.PROJECTNO).toBe('AD0746V26P')
  })

  it('maps the client to MAINCONTRACTOR — ADTECH is normally the subcontractor', () => {
    expect(buildProjectValues(project).MAINCONTRACTOR).toBe('Main Contractor Co')
  })

  it('sends an empty string, never "null", for anything not set', () => {
    const v = buildProjectValues({
      soNumber: null,
      name: 'X',
      clientName: null,
      cadOwnerName: null,
      cadConsultantName: null,
    })
    expect(v.OWNER).toBe('')
    expect(v.CONSULTANT).toBe('')
    expect(v.SONO).toBe('')
    expect(projectNumberFrom(null)).toBe('')
  })
})

describe('per-drawing values (§8.2)', () => {
  const base = {
    drawingNumber: 'AD0746V26P-ADT-FIRE-02-DR-F-1001',
    typeLabel: 'Layout drawing',
    floorLabel: 'Level 02',
    revision: 2,
    statusLabel: 'Done',
    issueDate: '2026-09-20',
    drafterName: 'Dara Kim',
    checkerName: 'Sokha Chan',
    approverName: 'Team Leader',
  }

  it('composes a title from the register’s own type and floor', () => {
    expect(buildDrawingValues(base).TITLE).toBe('Layout drawing — Level 02')
  })

  it('sends GENERAL for a project-level drawing, and drops the floor from its title', () => {
    const v = buildDrawingValues({ ...base, floorLabel: null, typeLabel: 'System schematic' })
    expect(v.FLOOR).toBe('GENERAL')
    expect(v.TITLE).toBe('System schematic')
  })

  it('leaves a drawing with nobody recorded blank rather than inventing a name', () => {
    const v = buildDrawingValues({
      ...base,
      revision: null,
      issueDate: null,
      drafterName: null,
      checkerName: null,
      approverName: null,
    })
    expect(v.REV).toBe('')
    expect(v.ISSUEDATE).toBe('')
    expect(v.CREATEDBY).toBe('')
    expect(v.CHECKEDBY).toBe('')
    expect(v.APPROVEDBY).toBe('')
  })
})

describe('the CSV', () => {
  const project = buildProjectValues({
    soNumber: 'AD0746V26P',
    name: 'Sample Tower',
    clientName: 'Main, Contractor',
    cadOwnerName: 'Owner "Q" Ltd',
    cadConsultantName: null,
  })

  it('carries every tag, project block then drawing block', () => {
    const csv = buildExportCsv(project, [])
    for (const tag of PROJECT_TAGS) expect(csv).toContain(`PROJECT,${tag},`)
    expect(csv).toContain(['SECTION', ...DRAWING_TAGS].join(','))
  })

  it('quotes a value containing a comma or a quote, so a row cannot break', () => {
    const csv = buildExportCsv(project, [])
    expect(csv).toContain('PROJECT,MAINCONTRACTOR,"Main, Contractor"')
    expect(csv).toContain('PROJECT,OWNER,"Owner ""Q"" Ltd"')
  })

  it('still writes the six project values when there are no drawings at all', () => {
    const csv = buildExportCsv(project, [])
    expect(csv).toContain('PROJECT,PROJECTNAME,Sample Tower')
    expect(csv.split('\r\n').filter((l) => l.startsWith('DRAWING,'))).toHaveLength(0)
  })

  it('names the file after the project and the day', () => {
    expect(exportFileName('AD-0746-V26P', new Date('2026-09-24T03:00:00Z'))).toBe(
      'AD0746V26P-sheetset-2026-09-24.csv',
    )
  })
})

describe('missing values warn, never block (§8.3)', () => {
  const none = {
    ownerSet: true,
    consultantSet: true,
    floorsWithoutDrawingCode: 0,
    systemsWithoutCadCode: 0,
    drawingsMissingPeople: 0,
  }

  it('says nothing when everything is filled in', () => {
    expect(buildMissingValueWarnings(none)).toEqual([])
  })

  it('names the tag that will be blank, and where to fix it', () => {
    const w = buildMissingValueWarnings({ ...none, ownerSet: false })
    expect(w).toEqual([{ key: 'exportMissingOwner', count: null, tag: 'OWNER', section: 'identity' }])
  })

  it('counts the things it counts, and points at the right setup section', () => {
    const w = buildMissingValueWarnings({
      ownerSet: false,
      consultantSet: false,
      floorsWithoutDrawingCode: 3,
      systemsWithoutCadCode: 2,
      drawingsMissingPeople: 7,
    })
    expect(w.map((x) => [x.key, x.count, x.section])).toEqual([
      ['exportMissingOwner', null, 'identity'],
      ['exportMissingConsultant', null, 'identity'],
      ['exportMissingFloorCodes', 3, 'structure'],
      ['exportMissingSystemCodes', 2, 'systems'],
      ['exportMissingDrawingPeople', 7, 'drawings'],
    ])
  })
})

describe('changed since the last export (§8.4)', () => {
  const previous: ExportSnapshot = {
    picName: 'Dara Kim',
    owner: 'Owner Ltd',
    consultant: 'Consultant Partners',
    floorCount: 4,
    systemCount: 2,
    drawingCount: 8,
    maxRevision: 1,
  }

  it('says nothing changed when nothing changed', () => {
    expect(diffSnapshots(previous, { ...previous })).toEqual([])
  })

  it('reports the PIC handover with both names', () => {
    const d = diffSnapshots(previous, { ...previous, picName: 'Sokha Chan' })
    expect(d).toEqual([{ key: 'exportChangedPic', from: 'Dara Kim', to: 'Sokha Chan' }])
  })

  it('counts floors added, systems added, drawings registered and a revision bump', () => {
    const d = diffSnapshots(previous, {
      ...previous,
      floorCount: 6,
      systemCount: 3,
      drawingCount: 11,
      maxRevision: 2,
    })
    expect(d).toEqual([
      { key: 'exportChangedFloorsAdded', count: 2 },
      { key: 'exportChangedSystemsAdded', count: 1 },
      { key: 'exportChangedDrawingsRegistered', count: 3 },
      { key: 'exportChangedRevisionBumped', count: 2 },
    ])
  })

  it('reports floors removed separately, since that is not an addition', () => {
    const d = diffSnapshots(previous, { ...previous, floorCount: 1 })
    expect(d).toEqual([{ key: 'exportChangedFloorsRemoved', count: 3 }])
  })

  it('does not claim a revision bump when the highest revision fell', () => {
    expect(diffSnapshots(previous, { ...previous, maxRevision: 0 })).toEqual([])
  })
})
