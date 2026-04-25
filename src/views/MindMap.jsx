import { useEffect, useMemo, useState } from 'react'
import {
  Background,
  Controls,
  MiniMap,
  ReactFlow,
  applyEdgeChanges,
  applyNodeChanges,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { useApp } from '../context/AppContext.jsx'
import { Icon } from '../components/Icons.jsx'
import { uid, cx } from '../lib/utils.js'
import { callAI, buildSystemPrompt } from '../lib/ai.js'

const nodeTypes = { scholarNode: ScholarNode }

export default function MindMap() {
  const { state, add, update, remove, showToast } = useApp()
  const [mapId, setMapId] = useState(state.mindmaps[0]?.id || null)
  const [selectedNodeId, setSelectedNodeId] = useState(null)
  const [source, setSource] = useState('')
  const [sourceNoteId, setSourceNoteId] = useState('')
  const [busy, setBusy] = useState(false)
  const [nodes, setNodes] = useState([])
  const [edges, setEdges] = useState([])

  const map = state.mindmaps.find((m) => m.id === mapId)
  const selectedNode = map ? findNode(map.root, selectedNodeId) || map.root : null

  const flow = useMemo(() => {
    if (!map) return { nodes: [], edges: [] }
    return treeToFlow(map.root, map.positions || {}, {
      onAdd: addChild,
      onDelete: deleteNode,
      onExpand: aiExpand,
      onSelect: setSelectedNodeId,
    })
  }, [map?.root, map?.positions])

  useEffect(() => {
    setNodes(flow.nodes)
    setEdges(flow.edges)
    if (!selectedNodeId && map?.root?.id) setSelectedNodeId(map.root.id)
  }, [flow.nodes, flow.edges, map?.id])

  const createMap = () => {
    const rootId = uid()
    const m = add('mindmaps', {
      title: 'New mind map',
      root: { id: rootId, label: 'Central idea', children: [] },
      positions: { [rootId]: { x: 0, y: 0 } },
    })
    setMapId(m.id)
    setSelectedNodeId(rootId)
  }

  const patch = (p) => update('mindmaps', { id: map.id, ...p })

  function addChild(parentId) {
    if (!map) return
    const childId = uid()
    const updateTree = (node) => {
      if (node.id === parentId) return { ...node, children: [...safeChildren(node), { id: childId, label: 'New node', children: [] }] }
      return { ...node, children: safeChildren(node).map(updateTree) }
    }
    const parentPos = map.positions?.[parentId] || { x: 0, y: 0 }
    patch({
      root: updateTree(map.root),
      positions: { ...(map.positions || {}), [childId]: { x: parentPos.x + 260, y: parentPos.y + 120 } },
    })
    setSelectedNodeId(childId)
  }

  function renameNode(nodeId, label) {
    if (!map) return
    const walk = (node) => node.id === nodeId ? { ...node, label } : { ...node, children: safeChildren(node).map(walk) }
    patch({ root: walk(map.root) })
  }

  function deleteNode(nodeId) {
    if (!map || nodeId === map.root.id) return
    const walk = (node) => ({ ...node, children: safeChildren(node).filter((c) => c.id !== nodeId).map(walk) })
    patch({ root: walk(map.root) })
    setSelectedNodeId(map.root.id)
  }

  async function aiExpand(node) {
    if (!map || !node) return
    setBusy(true)
    try {
      const data = await callAI({
        settings: state.settings,
        system: buildSystemPrompt(state, 'Expanding a visual mind map with concise study concepts.'),
        json: true,
        messages: [{
          role: 'user',
          content: `Give 4-6 concise child nodes for "${node.label}" in the mind map "${map.title}". Return JSON only: {"children":["...","..."]}.`
        }],
      })
      const items = (data?.children || []).map((x) => String(x).trim()).filter(Boolean).slice(0, 6)
      if (!items.length) {
        showToast('No nodes returned', 'info')
        return
      }
      const newNodes = items.map((label) => ({ id: uid(), label, children: [] }))
      const walk = (n) => n.id === node.id
        ? { ...n, children: [...safeChildren(n), ...newNodes] }
        : { ...n, children: safeChildren(n).map(walk) }
      const parentPos = map.positions?.[node.id] || { x: 0, y: 0 }
      const positions = { ...(map.positions || {}) }
      newNodes.forEach((n, i) => {
        positions[n.id] = { x: parentPos.x + 260, y: parentPos.y + (i - (newNodes.length - 1) / 2) * 110 }
      })
      patch({ root: walk(map.root), positions })
      showToast(`Added ${items.length} nodes`, 'success')
    } catch (e) {
      showToast(e.message || 'AI error', 'error')
    } finally {
      setBusy(false)
    }
  }

  const generateMap = async () => {
    const note = state.notes.find((n) => n.id === sourceNoteId)
    const promptSource = note ? `Note title: ${note.title}\n\n${note.content}` : source
    if (!promptSource.trim()) return showToast('Add a topic or choose a note first', 'info')
    setBusy(true)
    try {
      const data = await callAI({
        settings: state.settings,
        system: buildSystemPrompt(state, 'Generating a study mind map.'),
        json: true,
        messages: [{
          role: 'user',
          content: `Create a useful A-level study mind map from this source. Return JSON only: {"title":"...","root":{"label":"...","children":[{"label":"...","children":[{"label":"..."}]}]}}.\n\nSOURCE:\n${promptSource}`
        }],
      })
      const root = normaliseTree(data?.root || { label: source || note?.title || 'Mind map' })
      const m = add('mindmaps', {
        title: data?.title || root.label || 'AI mind map',
        root,
        positions: {},
      })
      setMapId(m.id)
      setSelectedNodeId(root.id)
      setSource('')
      setSourceNoteId('')
      showToast('AI mind map created', 'success')
    } catch (e) {
      showToast(e.message || 'AI error', 'error')
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className="grid grid-cols-1 lg:grid-cols-[280px_1fr] gap-4 min-h-[72vh]">
      <div className="card p-3 flex flex-col gap-3">
        <div className="flex items-center justify-between px-1">
          <div className="font-display font-semibold">Maps</div>
          <button className="btn-ghost" onClick={createMap}><Icon.plus className="w-4 h-4" /></button>
        </div>
        <ul className="space-y-1 max-h-56 overflow-y-auto">
          {state.mindmaps.map((m) => (
            <li key={m.id}>
              <button onClick={() => { setMapId(m.id); setSelectedNodeId(m.root?.id) }}
                className={cx('w-full text-left p-3 rounded-2xl flex items-center gap-2',
                  m.id === mapId ? 'bg-brand-50 dark:bg-brand-900/30' : 'hover:bg-ink-50 dark:hover:bg-ink-800')}>
                <Icon.mindmap className="w-4 h-4 text-ink-400" />
                <span className="font-medium text-sm truncate">{m.title}</span>
              </button>
            </li>
          ))}
          {state.mindmaps.length === 0 && <li className="text-center text-sm text-ink-500 py-6">No maps yet</li>}
        </ul>

        <div className="border-t border-ink-100 dark:border-ink-800 pt-3 space-y-2">
          <div className="section-title">AI generate</div>
          <textarea
            className="input min-h-[84px]"
            placeholder="Type a topic, e.g. differentiation from first principles"
            value={source}
            onChange={(e) => setSource(e.target.value)}
          />
          <select className="input" value={sourceNoteId} onChange={(e) => setSourceNoteId(e.target.value)}>
            <option value="">Or choose a note</option>
            {state.notes.map((n) => <option key={n.id} value={n.id}>{n.title || 'Untitled'}</option>)}
          </select>
          <button className="btn-soft w-full" onClick={generateMap} disabled={busy}><Icon.sparkle className="w-4 h-4" /> Generate map</button>
        </div>

        {selectedNode && (
          <div className="border-t border-ink-100 dark:border-ink-800 pt-3 space-y-2">
            <div className="section-title">Selected node</div>
            <input className="input" value={selectedNode.label} onChange={(e) => renameNode(selectedNode.id, e.target.value)} />
            <div className="grid grid-cols-2 gap-2">
              <button className="btn-soft" onClick={() => addChild(selectedNode.id)}><Icon.plus className="w-4 h-4" /> Child</button>
              <button className="btn-soft" onClick={() => aiExpand(selectedNode)} disabled={busy}><Icon.sparkle className="w-4 h-4" /> Expand</button>
            </div>
            {selectedNode.id !== map?.root?.id && (
              <button className="btn-ghost text-rose-600 w-full" onClick={() => deleteNode(selectedNode.id)}><Icon.trash className="w-4 h-4" /> Delete node</button>
            )}
          </div>
        )}
      </div>

      <div className="card p-4 flex flex-col min-h-[72vh]">
        {!map ? (
          <div className="flex-1 flex items-center justify-center text-ink-500">Create or generate a map</div>
        ) : (
          <>
            <div className="flex items-center gap-2 mb-3">
              <input className="text-xl font-display font-semibold bg-transparent focus:outline-none flex-1"
                value={map.title} onChange={(e) => patch({ title: e.target.value })} />
              {busy && <div className="text-sm text-ink-500 animate-pulse-soft">Working...</div>}
              <button className="btn-ghost text-rose-600" onClick={() => { remove('mindmaps', map.id); setMapId(state.mindmaps.find((m) => m.id !== map.id)?.id || null) }}>
                <Icon.trash className="w-4 h-4" />
              </button>
            </div>
            <div className="flex-1 min-h-[560px] rounded-2xl overflow-hidden border border-ink-100 dark:border-ink-800 bg-ink-50 dark:bg-ink-950">
              <ReactFlow
                nodes={nodes}
                edges={edges}
                nodeTypes={nodeTypes}
                onNodesChange={(changes) => setNodes((nds) => applyNodeChanges(changes, nds))}
                onEdgesChange={(changes) => setEdges((eds) => applyEdgeChanges(changes, eds))}
                onNodeClick={(_, node) => setSelectedNodeId(node.id)}
                onNodeDragStop={(_, node) => patch({ positions: { ...(map.positions || {}), [node.id]: node.position } })}
                fitView
              >
                <Background />
                <Controls />
                <MiniMap pannable zoomable />
              </ReactFlow>
            </div>
          </>
        )}
      </div>
    </div>
  )
}

function ScholarNode({ id, data, selected }) {
  return (
    <div
      className={cx(
        'min-w-[150px] max-w-[230px] rounded-2xl border px-3 py-2 shadow-card bg-white dark:bg-ink-900',
        selected ? 'border-brand-400 ring-2 ring-brand-300' : 'border-ink-200 dark:border-ink-700'
      )}
      onClick={() => data.onSelect(id)}
    >
      <div className="font-medium text-sm leading-snug break-words">{data.label}</div>
      <div className="mt-2 flex gap-1">
        <button className="chip !px-2" onClick={(e) => { e.stopPropagation(); data.onAdd(id) }} title="Add child"><Icon.plus className="w-3 h-3" /></button>
        <button className="chip !px-2" onClick={(e) => { e.stopPropagation(); data.onExpand({ id, label: data.label }) }} title="AI expand"><Icon.sparkle className="w-3 h-3" /></button>
        {!data.root && <button className="chip !px-2" onClick={(e) => { e.stopPropagation(); data.onDelete(id) }} title="Delete"><Icon.x className="w-3 h-3" /></button>}
      </div>
    </div>
  )
}

function treeToFlow(root, savedPositions, handlers) {
  const levels = {}
  const links = []
  const walk = (node, depth = 0, parent = null) => {
    ;(levels[depth] = levels[depth] || []).push(node)
    if (parent) links.push({ source: parent.id, target: node.id })
    safeChildren(node).forEach((child) => walk(child, depth + 1, node))
  }
  walk(root)

  const nodes = Object.entries(levels).flatMap(([depthKey, level]) => {
    const depth = Number(depthKey)
    return level.map((node, index) => ({
      id: node.id,
      type: 'scholarNode',
      position: savedPositions[node.id] || {
        x: depth * 280,
        y: (index - (level.length - 1) / 2) * 135,
      },
      data: {
        label: node.label,
        root: node.id === root.id,
        ...handlers,
      },
    }))
  })

  const edges = links.map((link) => ({
    id: `${link.source}-${link.target}`,
    source: link.source,
    target: link.target,
    type: 'smoothstep',
    animated: false,
    className: 'stroke-brand-400',
  }))

  return { nodes, edges }
}

function findNode(node, id) {
  if (!node || !id) return null
  if (node.id === id) return node
  for (const child of safeChildren(node)) {
    const found = findNode(child, id)
    if (found) return found
  }
  return null
}

function normaliseTree(node) {
  return {
    id: uid(),
    label: String(node?.label || 'Mind map').slice(0, 80),
    children: (node?.children || []).slice(0, 8).map(normaliseTree),
  }
}

function safeChildren(node) {
  return Array.isArray(node?.children) ? node.children : []
}
