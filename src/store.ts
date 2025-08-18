import { create } from 'zustand'
import type { PromptsJson, CustomPrompt } from './types'

type State = {
  dark: boolean
  setDark: (v: boolean) => void
  data: PromptsJson | null
  setData: (d: PromptsJson) => void
  favorites: Record<string, true>
  toggleFavorite: (id: string) => void
  isFavorite: (id: string) => boolean
  clearFavorites: () => void
  custom: CustomPrompt[]
  addCustom: (row: Omit<CustomPrompt, 'id'|'createdAt'> & {id?: string}) => void
  removeCustom: (id: string) => void
}

function loadJSON(key: string) {
  try { const raw = localStorage.getItem(key); return raw ? JSON.parse(raw) : null } catch { return null }
}
function saveJSON(key: string, value: any) {
  try { localStorage.setItem(key, JSON.stringify(value)) } catch {}
}
function loadFavorites(): Record<string, true> {
  try {
    const raw = localStorage.getItem('pv_favs')
    if (!raw) return {}
    const obj = JSON.parse(raw)
    return obj && typeof obj === 'object' ? obj : {}
  } catch { return {} }
}

export const useVault = create<State>((set, get) => ({
  dark: (localStorage.getItem('pv_dark') ?? 'false') === 'true',
  setDark: (v) => { localStorage.setItem('pv_dark', String(v)); set({ dark: v }) },
  data: (() => {
    try { const raw = localStorage.getItem('pv_json'); return raw ? JSON.parse(raw) : null } catch { return null }
  })(),
  setData: (d) => { try { localStorage.setItem('pv_json', JSON.stringify(d)) } catch {}; set({ data: d }) },
  favorites: loadFavorites(),
  toggleFavorite: (id) => {
    const favs = { ...get().favorites }
    if (favs[id]) delete favs[id]; else favs[id] = true
    try { localStorage.setItem('pv_favs', JSON.stringify(favs)) } catch {}
    set({ favorites: favs })
  },
  isFavorite: (id) => !!get().favorites[id],
  clearFavorites: () => { try { localStorage.removeItem('pv_favs') } catch {}; set({ favorites: {} }) },

  custom: (loadJSON('pv_custom') ?? []) as CustomPrompt[],
  addCustom: (r) => {
    const now = Date.now()
    const id = r.id ?? ('c' + Math.random().toString(36).slice(2) + now.toString(36))
    const row: CustomPrompt = { id, tab: r.tab, section: r.section, category: r.category, text: r.text, createdAt: now }
    const list = [...get().custom, row]
    saveJSON('pv_custom', list)
    set({ custom: list })
  },
  removeCustom: (id) => {
    const list = get().custom.filter(x => x.id !== id)
    saveJSON('pv_custom', list)
    set({ custom: list })
  },
}))
