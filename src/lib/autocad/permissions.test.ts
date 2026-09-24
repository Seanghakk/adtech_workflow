import { describe, it, expect } from 'vitest'
import { canRunExport, EXPORT_WRITE_TEAMS, type ExportActor } from './permissions'

const pic: ExportActor = { isPic: true, isSuperadmin: false, teamCode: 'project_management' }
const shopDrawing: ExportActor = { isPic: false, isSuperadmin: false, teamCode: 'shop_drawing' }
const aAndA: ExportActor = { isPic: false, isSuperadmin: false, teamCode: 'a_and_a' }
const superadmin: ExportActor = { isPic: false, isSuperadmin: true, teamCode: 'qs' }
const outsider: ExportActor = { isPic: false, isSuperadmin: false, teamCode: 'finance' }
const tenderTeam: ExportActor = { isPic: false, isSuperadmin: false, teamCode: 'tender' }

/**
 * These mirror workflow.autocad_export_log's own INSERT policy as migration
 * 038 leaves it, and must keep mirroring it:
 *   is_superadmin() OR current_team() IN (shop_drawing, a_and_a) OR PIC
 */
describe('canRunExport — the export log’s own rule, transcribed', () => {
  it('lets the project’s PIC export', () => {
    expect(canRunExport(pic)).toBe(true)
  })

  it('lets both shop drawing teams export', () => {
    expect(canRunExport(shopDrawing)).toBe(true)
    // Brief 100 Part A, amended 24 Sep 2026: A&A was refused by migration
    // 033's policy; migration 038 added them, because running the export is
    // the same work as importing the shop drawing BOQ they already can.
    expect(canRunExport(aAndA)).toBe(true)
  })

  it('lets a superadmin export any project', () => {
    expect(canRunExport(superadmin)).toBe(true)
  })

  it('refuses everyone else, including a team with no rule behind it', () => {
    expect(canRunExport(outsider)).toBe(false)
    expect(canRunExport(tenderTeam)).toBe(false)
  })

  it('carries exactly the two teams the policy names', () => {
    expect([...EXPORT_WRITE_TEAMS]).toEqual(['shop_drawing', 'a_and_a'])
  })
})
