/**
 * Brief 100 Part B — shared between drawer-actions.ts ('use server', which
 * may only export async functions) and the drawer component. Same split
 * every other actions.ts in this app uses, and the reason it exists: a
 * 'use server' file that exports an object fails at request time, not at
 * build time.
 */
export interface DrawerActionState {
  error: string | null
  savedAt: string | null
}

export const drawerInitialState: DrawerActionState = { error: null, savedAt: null }
