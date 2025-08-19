import React, { useEffect, useMemo, useState, useRef } from 'react'
import { Header } from './components/Header'
import { PromptCard } from './components/PromptCard'
import { Modal } from './components/Modal'
import { CustomPromptForm } from './components/CustomPromptForm'
import { Toast } from './components/Toast'
import { useVault } from './store'

type PromptsJson = {
  tab: string
  sections: {
    section: string
    categories: {
      category: string
      prompts: string[]
    }[]
  }[]
}[]

type FlatPrompt = { id: string; text: string; tab: string; section: string; category: string }

function computeId(tab: string, section: string, category: string, text: string) {
  let h = 0
  const key = `${tab}::${section}::${category}::${text}`
  for (let i = 0; i < key.length; i++) {
    h = ((h << 5) - h) + key.charCodeAt(i)
    h |= 0
  }
  return 'p' + Math.abs(h).toString(36)
}

const SMALL = new Set(['and','or','the','a','an','for','to','of','in','on','at','by','from','with','as','vs','via'])
const ACR = new Set(['API','APIS','SEO','SEM','FAQ','FAQS','UX','UI','PPC','CRM','OKR','OKRS','KPI','KPIS','HR','CTA','CTAS','B2B','B2C','SAAS','SQL','NOSQL','JSON','CSV','IOS','AI'])
function smartTitle(s: string) {
  return s.replace(/\b[\w'']+\b/g, (w, idx) => {
    const upper = w.toUpperCase()
    if (ACR.has(upper)) return upper
    const lower = w.toLowerCase()
    if (idx !== 0 && SMALL.has(lower)) return lower
    return lower.charAt(0).toUpperCase() + lower.slice(1)
  }).replace(/Faqs/gi,'FAQs')
}

function displayLabel(s: string) {
  // collapse whitespace/newlines
  const t = s.replace(/\s+/g, ' ').trim()
  // title case with acronym handling
  let out = smartTitle(t)
  // extra fixes
  out = out.replace(/\bA\/B\b/ig, 'A/B')
           .replace(/\bABM\b/ig, 'ABM')
           .replace(/\bVip\b/g, 'VIP')
  return out
}

function flatten(data: PromptsJson | null): FlatPrompt[] {
  if (!data) return []
  const out: FlatPrompt[] = []
  for (const t of data) {
    for (const s of t.sections) {
      for (const c of s.categories) {
        for (const p of c.prompts) {
          out.push({
            id: computeId(t.tab, s.section, c.category, p),
            text: p,
            tab: t.tab,
            section: s.section,
            category: c.category
          })
        }
      }
    }
  }
  return out
}



// ---- Egne Prompts ----

interface EgnePrompterProps {
  prompts: string[]
  addPrompt: (text: string) => void
  removePrompt: (index: number) => void
  onCopy: (text: string) => void
}

function EgnePrompter({ prompts, addPrompt, removePrompt, onCopy }: EgnePrompterProps) {
  const [text, setText] = useState("");
  return (
    <div className="space-y-3">
      <h2 className="text-lg font-semibold">Egne Prompts</h2>
      <div className="flex gap-2">
        <input
          className="flex-1 rounded border px-2 py-1"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Skriv din egen prompt..."
        />
        <button
          className="bg-green-600 text-white px-3 py-1 rounded"
          onClick={() => { if(text.trim()){ addPrompt(text); setText(""); } }}
        >
          Tilføj
        </button>
      </div>
      <div className="space-y-2">
        {prompts.map((p,i)=>(
          <div key={i} className="relative border rounded p-2 bg-slate-50 dark:bg-slate-800">
            <button
              className="absolute top-1 right-1 text-red-500 text-xs"
              onClick={()=>removePrompt(i)}
            >
              ✕
            </button>
            <div
              className="cursor-pointer hover:bg-slate-100 dark:hover:bg-slate-700 p-1 rounded"
              onClick={()=>onCopy(p)}
            >
              {p}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}


export default function App() {
  const {
    dark, setDark,
    data, setData,
    favorites, toggleFavorite, isFavorite
    } = useVault()
  const { custom, addCustom, removeCustom } = useVault()

  const [activeTab, setActiveTab] = useState<string>('')
  const [q, setQ] = useState('')
  const [copied, setCopied] = useState(false)
  const [copiedCustomId, setCopiedCustomId] = useState<string>('')
  const [openNew, setOpenNew] = useState(false)

  // keep Tailwind dark mode in sync with state
  useEffect(() => {
    const root = document.documentElement
    root.classList.toggle('dark', dark)
    try { localStorage.setItem('pv_dark', JSON.stringify(dark)) } catch {}
  }, [dark])

  const [showFav, setShowFav] = useState(false)
  const [showCustom, setShowCustom] = useState(false)

  
  useEffect(() => {
    if (data) return
    const load = async () => {
      const res = await fetch('/prompts.json')
      const json = await res.json()
      setData(json)
      if (!activeTab) setActiveTab(json?.[0]?.tab ?? '')
    }
    load()
  }, [data, setData, activeTab])

  useEffect(() => {
    if (!activeTab && data?.[0]?.tab) setActiveTab(data[0].tab)
  }, [data, activeTab])

  const tabs = useMemo(() => (data ? data.map(t => t.tab) : []), [data])
  const allPrompts = useMemo(() => flatten(data), [data])
  const currentTab = useMemo(() => data?.find(t => t.tab === activeTab), [data, activeTab])

  const isSearching = q.trim().length > 0
  const searchRes = useMemo(() => {
    if (!isSearching) return []
    const s = q.toLowerCase()
    return allPrompts.filter(p =>
      p.text.toLowerCase().includes(s) ||
      p.category.toLowerCase().includes(s) ||
      p.section.toLowerCase().includes(s) ||
      p.tab.toLowerCase().includes(s)
    )
  }, [isSearching, q, allPrompts])

  

// Export/Import for custom prompts (merge) with immediate localStorage persistence
const fileRef = useRef<HTMLInputElement | null>(null)
const handleExportCustom = () => {
  try {
    // @ts-ignore custom comes from store
    const rows = custom ?? []
    const blob = new Blob([JSON.stringify(rows, null, 2)], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = 'custom-prompts.json'
    a.click()
    URL.revokeObjectURL(url)
  } catch (e) {
    console.error('Export failed', e)
  }
}
const handleImportClick = () => fileRef.current?.click()
const handleImportChange: React.ChangeEventHandler<HTMLInputElement> = (e) => {
  const file = e.target.files?.[0]
  if (!file) return
  const reader = new FileReader()
  reader.onload = () => {
    try {
      const arr = JSON.parse(String(reader.result))
      if (Array.isArray(arr)) {
        // Merge: add each item; addCustom persists immediately
        for (const it of arr) {
          const tab = String(it.tab ?? 'Custom')
          const section = String(it.section ?? 'Mine Prompter')
          const category = String(it.category ?? 'General')
          const text = String(it.text ?? '')
          if (text.trim()) addCustom({ tab, section, category, text })
        }
      }
    } catch (err) {
      console.error('Import failed', err)
    } finally {
      if (fileRef.current) fileRef.current.value = ''
    }
  }
  reader.readAsText(file)
}

const handleCopy = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 900)
  }

  const handleCustomCopy = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopiedCustomId(id)
    setTimeout(() => setCopiedCustomId(''), 900)
  }

  return (
    <div className="min-h-screen bg-white dark:bg-slate-950">
      <Header
        dark={dark}
        setDark={setDark}
        onToggleFav={() => setShowFav(v => !v)}
        showFav={showFav}
        onToggleCustom={() => setShowCustom(v => !v)}
        showCustom={showCustom}
      />

      <div className="mx-auto max-w-[1400px] px-4 md:px-6 py-4 md:py-6 flex gap-6">
        <div className="md:fixed md:inset-y-16 md:left-0 hidden md:flex md:w-72 md:flex-col md:border-r border-slate-200/70 dark:border-slate-800/70 p-4">
          <div className="mb-3">
            <label className="block text-sm font-medium text-ink dark:text-white mb-1">Faner</label>
            <select
              value={activeTab}
              onChange={(e) => { 
                setShowFav(false); 
                setShowCustom(false); 
                setActiveTab(e.target.value); 
                const el = document.getElementById(`sec-${e.target.value}`); 
                if (el) {
                  const offset = 120;
                  const elementPosition = el.offsetTop - offset;
                  window.scrollTo({ top: elementPosition, behavior: 'smooth' });
                }
              }}
              className="w-full rounded-2xl border px-3 py-2 shadow-soft bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-ink dark:text-white"
            >
              {tabs.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          <nav className="space-y-4 overflow-y-auto pr-1">
            <h3 className="text-xs uppercase tracking-wide text-slate-500 dark:text-slate-400">Sektioner & kategorier</h3>
            {currentTab?.sections.map(s => (
              <div key={displayLabel(s.section)} className="space-y-1">
                <button
                  className="font-semibold text-sm text-ink dark:text-white hover:underline"
                  onClick={() => { setShowFav(false); setShowCustom(false); const el = document.getElementById(`sec-${displayLabel(s.section)}`)
                    if (el) {
                      const offset = 120; // Height of sticky search + padding
                      const elementPosition = el.offsetTop - offset;
                      window.scrollTo({ top: elementPosition, behavior: 'smooth' });
                    }
                  }}
                >
                  {displayLabel(s.section)}
                </button>
                <ul className="pl-5 list-disc marker:text-slate-400 text-sm leading-snug text-slate-600 dark:text-slate-300 space-y-1">
                  {s.categories.map(c => (
                    <li key={`${displayLabel(s.section)}-${displayLabel(c.category)}`}>
                      <button
                        className="block text-left hover:underline break-words whitespace-normal"
                        onClick={() => { setShowFav(false); setShowCustom(false); const el = document.getElementById(`cat-${displayLabel(s.section)}::${displayLabel(c.category)}`)
                          if (el) {
                            const offset = 120; // Height of sticky search + padding
                            const elementPosition = el.offsetTop - offset;
                            window.scrollTo({ top: elementPosition, behavior: 'smooth' });
                          }
                        }}
                      >
                        {displayLabel(c.category)}
                      </button>
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </nav>
        </div>

        <main className="flex-1 md:ml-72 space-y-6">
          {/* Mobile tab selector */}
          <div className="md:hidden">
            <label className="block text-sm font-medium text-ink dark:text-white mb-2">Vælg fane</label>
            <select
              value={activeTab}
              onChange={(e) => { 
                setShowFav(false); 
                setShowCustom(false); 
                setActiveTab(e.target.value);
              }}
              className="w-full rounded-2xl border px-3 py-2 shadow-soft bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-ink dark:text-white"
            >
              {tabs.map(t => (
                <option key={t} value={t}>{t}</option>
              ))}
            </select>
          </div>

          <div className="sticky top-0 z-10 pt-2 pb-3 bg-white/80 dark:bg-slate-950/80 backdrop-blur">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Søg på tværs af alt…"
              className="w-full rounded-2xl border px-4 py-2 bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 text-ink dark:text-white"
            />
          </div>

          {!isSearching && showFav && (
            <>
              <h2 className="text-xl font-semibold text-ink dark:text-white">Favoritter</h2>
              {/* Grouped favorites by section with category badge (Variant B) */}
              {(() => {
                const favs = allPrompts.filter(p => isFavorite(p.id));
                const grouped: Record<string, Record<string, typeof favs>> = {};
                for (const p of favs) {
                  const sec = p.section || 'Ukendt sektion';
                  const cat = p.category || 'Ukendt kategori';
                  (grouped[sec] ||= {});
                  (grouped[sec][cat] ||= [] as any);
                  grouped[sec][cat].push(p);
                }
                const sections = Object.keys(grouped);
                if (sections.length === 0) {
                  return (
                    <div className="text-sm text-slate-500 dark:text-slate-400">
                      Du har ingen favoritter endnu. Klik på ☆ på et kort.
                    </div>
                  );
                }
                return sections.map(sec => (
                  <div key={sec} className="mt-4">
                    <h3 className="text-lg font-semibold text-ink dark:text-white mb-2">{sec}</h3>
                    <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
                      {Object.entries(grouped[sec]).flatMap(([cat, arr]) =>
                        arr.map((p: any) => (
                          <div key={p.id} className="space-y-2">
                            <span className="inline-block text-xs px-2 py-0.5 rounded bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300">
                              {cat}
                            </span>
                            <PromptCard
                              id={p.id}
                              text={p.text}
                              onCopy={() => handleCopy(p.text)}
                              onToggleFav={toggleFavorite}
                              fav={true}
                            />
                          </div>
                        ))
                      )}
                    </div>
                  </div>
                ));
              })()}

            </>
          )}

          {!isSearching && showCustom && (
            <>
              <h2 className="text-xl font-semibold text-ink dark:text-white">Egne Prompter</h2>
              <div className="space-y-4">
                <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <button onClick={handleExportCustom} className="px-3 py-1.5 rounded-2xl bg-slate-600 text-white transition hover:bg-amber-500 hover:shadow-soft dark:bg-slate-700 dark:hover:bg-amber-500">
            Eksportér
          </button>
          <button onClick={handleImportClick} className="px-3 py-1.5 rounded-2xl bg-slate-600 text-white transition hover:bg-amber-500 hover:shadow-soft dark:bg-slate-700 dark:hover:bg-amber-500">
            Importér
          </button>
          <input ref={fileRef} type="file" accept="application/json" className="hidden" onChange={handleImportChange} />
        </div>

                  <button onClick={() => setOpenNew(true)} className="px-3 py-1.5 rounded-2xl bg-amber-500 text-white">
                    Ny prompt
                  </button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
  {custom.map(p => (
    <div key={p.id} className="relative">
      <button
        onClick={(e) => { e.stopPropagation(); removeCustom(p.id) }}
        className="absolute right-2 top-2 p-1 rounded-full text-slate-400 hover:text-red-500 hover:bg-red-50 dark:hover:bg-red-900/30"
        title="Slet"
        aria-label="Slet"
      >
        ×
      </button>
      <div onClick={() => handleCustomCopy(p.text, p.id)} className={"rounded-2xl border p-4 transition border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 hover:shadow-soft active:scale-[0.99] cursor-pointer " + (copiedCustomId === p.id ? 'ring-2 ring-amber-500' : '')}>
        <div className="text-xs text-slate-600 dark:text-slate-400 mb-2">{p.tab} / {p.section} / {p.category}</div>
        <div className="text-sm text-slate-800 dark:text-slate-100 whitespace-pre-wrap">{p.text}</div>
        {copiedCustomId === p.id && (
          <div className="mt-2 text-xs px-2 py-0.5 rounded-full bg-accent text-white inline-block">Kopieret!</div>
        )}
      </div>
    </div>
  ))}
</div>
              </div>

              <Modal open={openNew} onClose={() => setOpenNew(false)} title="Ny prompt">
                <CustomPromptForm onSubmit={(v) => { addCustom(v); setOpenNew(false) }} />
              </Modal>
            </>
          )}

          {isSearching && (
            <>
              <h2 className="text-xl font-semibold text-ink dark:text-white">Resultater</h2>
              <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-3">
                {searchRes.map(p => (
                  <PromptCard
                    key={p.id}
                    id={p.id}
                    text={p.text}
                    onCopy={() => handleCopy(p.text)}
                    onToggleFav={toggleFavorite}
                    fav={isFavorite(p.id)}
                  />
                ))}
              </div>
            </>
          )}

          {!isSearching && !showFav && !showCustom && currentTab && currentTab.sections.map(s => (
            <section key={displayLabel(s.section)} id={`sec-${displayLabel(s.section)}`} className="space-y-3">
              <h2 className="text-2xl font-semibold text-ink dark:text-white">{displayLabel(s.section)}</h2>
              {s.categories.map(c => (
                <div key={`${displayLabel(s.section)}-${displayLabel(c.category)}`} id={`cat-${displayLabel(s.section)}::${displayLabel(c.category)}`} className="space-y-2">
                  <h3 className="text-lg font-semibold text-ink dark:text-white">{displayLabel(c.category)}</h3>
                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                    {c.prompts.map((p) => {
                      const id = computeId(activeTab, s.section, c.category, p)
                      return (
                        <PromptCard
                          key={id}
                          id={id}
                          text={p}
                          onCopy={() => handleCopy(p)}
                          onToggleFav={toggleFavorite}
                          fav={isFavorite(id)}
                        />
                      )
                    })}
                  </div>
                </div>
              ))}
            </section>
          ))}

        </main>
      </div>
    
      <Toast message="Kopieret!" show={copied} />
</div>
  )
}

