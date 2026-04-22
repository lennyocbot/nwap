import { useEffect, useRef, useState } from 'react'
import { useApp } from '../context/AppContext.jsx'
import { Icon } from '../components/Icons.jsx'
import { uid, cx } from '../lib/utils.js'
import { callAI, buildSystemPrompt } from '../lib/ai.js'

// Lightweight radial mind map. Each map is a tree of nodes.
export default function MindMap() {
  const { state, add, update, remove, showToast } = useApp()
  const [mapId, setMapId] = useState(state.mindmaps[0]?.id || null)
  const [busy, setBusy] = useState(false)

  const map = state.mindmaps.find((m) => m.id === mapId)

  const createMap = () => {
    const m = add('mindmaps', {
      title: 'New mind map',
      root: { id: uid(), label: 'Central idea', children: [] },
    })
    setMapId(m.id)
  }

  const patch = (p) => update('mindmaps', { id: map.id, ...p })

  const addChild = (parentId) => {
    const updateTree = (node) => {
      if (node.id === parentId) return { ...node, children: [...node.children, { id: uid(), label: 'New node', children: [] }] }
      return { ...node, children: node.children.map(updateTree) }
    }
    patch({ root: updateTree(map.root) })
  }

  const renameNode = (nodeId, label) => {
    const walk = (node) => node.id === nodeId ? { ...node, label } : { ...node, children: node.children.map(walk) }
    patch({ root: walk(map.root) })
  }

  const deleteNode = (nodeId) => {
    if (nodeId === map.root.id) return
    const walk = (node) => ({ ...node, children: node.children.filter((c) => c.id !== nodeId).map(walk) })
    patch({ root: walk(map.root) })
  }

  const aiExpand = async (node) => {
    setBusy(true)
    try {
      const text = await callAI({
        settings: state.settings,
        system: buildSystemPrompt(state, `Expanding a mind map node.`),
        messages: [{ role: 'user', content: `Give 4 concise (max 6-word) sub-concepts for "${node.label}" in the context of mind map "${map.title}". Return each on a new line, no numbering.` }],
      })
      const items = text.split(/\n+/).map((x) => x.replace(/^[-*\d.\s]+/, '').trim()).filter(Boolean).slice(0, 6)
      const walk = (n) => n.id === node.id
        ? { ...n, children: [...n.children, ...items.map((label) => ({ id: uid(), label, children: [] }))] }
        : { ...n, children: n.children.map(walk) }
      patch({ root: walk(map.root) })
    } catch (e) { showToast(e.message || 'AI error', 'error') } finally { setBusy(false) }
  }

  return (
    <div className="grid grid-cols-1 md:grid-cols-[280px_1fr] gap-4">
      <div className="card p-3">
        <div className="flex items-center justify-between px-1 mb-2">
          <div className="font-display font-semibold">Maps</div>
          <button className="btn-ghost" onClick={createMap}><Icon.plus className="w-4 h-4" /></button>
        </div>
        <ul className="space-y-1">
          {state.mindmaps.map((m) => (
            <li key={m.id}>
              <button onClick={() => setMapId(m.id)}
                className={cx('w-full text-left p-3 rounded-2xl flex items-center gap-2',
                  m.id === mapId ? 'bg-brand-50 dark:bg-brand-900/30' : 'hover:bg-ink-50 dark:hover:bg-ink-800')}>
                <Icon.mindmap className="w-4 h-4 text-ink-400" />
                <span className="font-medium text-sm truncate">{m.title}</span>
              </button>
            </li>
          ))}
          {state.mindmaps.length === 0 && <li className="text-center text-sm text-ink-500 py-6">No maps yet</li>}
        </ul>
      </div>

      <div className="card p-4 flex flex-col min-h-[60vh]">
        {!map ? (
          <div className="flex-1 flex items-center justify-center text-ink-500">Create or select a map</div>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-3">
              <input className="text-xl font-display font-semibold bg-transparent focus:outline-none flex-1"
                value={map.title} onChange={(e) => patch({ title: e.target.value })} />
              <button className="btn-ghost text-rose-600" onClick={() => { remove('mindmaps', map.id); setMapId(state.mindmaps.find((m) => m.id !== map.id)?.id || null) }}>
                <Icon.trash className="w-4 h-4" />
              </button>
            </div>
            {busy && <div className="text-sm text-ink-500 animate-pulse-soft mb-2">Expanding…</div>}
            <div className="flex-1 overflow-auto">
              <Tree node={map.root} depth={0}
                onRename={renameNode} onAddChild={addChild} onDelete={deleteNode} onExpand={aiExpand} isRoot />
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function Tree({ node, depth, isRoot, onRename, onAddChild, onDelete, onExpand }) {
  const palette = ['from-brand-500 to-violet-500', 'from-emerald-500 to-teal-500', 'from-amber-500 to-rose-500', 'from-sky-500 to-brand-500', 'from-pink-500 to-violet-500']
  const color = palette[depth % palette.length]
  return (
    <div className="relative pl-6">
      {!isRoot && <span className="absolute left-2 top-4 w-3 border-t border-dashed border-ink-300 dark:border-ink-700" />}
      <div className={cx('inline-flex items-center gap-1 rounded-2xl text-white px-3 py-1.5 shadow-card bg-gradient-to-br', color, isRoot && 'text-base')}>
        <input value={node.label} onChange={(e) => onRename(node.id, e.target.value)}
          className="bg-transparent focus:outline-none text-sm font-medium min-w-[60px]" size={Math.max(8, node.label.length)} />
        <button className="ml-1 opacity-80 hover:opacity-100" title="Add child" onClick={() => onAddChild(node.id)}><Icon.plus className="w-3.5 h-3.5" /></button>
        <button className="opacity-80 hover:opacity-100" title="Expand with AI" onClick={() => onExpand(node)}><Icon.sparkle className="w-3.5 h-3.5" /></button>
        {!isRoot && <button className="opacity-80 hover:opacity-100" title="Delete" onClick={() => onDelete(node.id)}><Icon.x className="w-3.5 h-3.5" /></button>}
      </div>
      {node.children.length > 0 && (
        <div className="mt-2 ml-4 space-y-2 border-l border-dashed border-ink-300 dark:border-ink-700">
          {node.children.map((c) => (
            <Tree key={c.id} node={c} depth={depth + 1}
              onRename={onRename} onAddChild={onAddChild} onDelete={onDelete} onExpand={onExpand} />
          ))}
        </div>
      )}
    </div>
  )
}
