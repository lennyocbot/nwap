import { createContext, useContext, useEffect, useMemo, useReducer, useState, useCallback } from 'react'
import { defaultState, loadState, saveState, resetState } from '../lib/storage.js'
import { uid } from '../lib/utils.js'

const AppCtx = createContext(null)

const reducer = (state, action) => {
  switch (action.type) {
    case 'set':         return { ...state, [action.key]: action.value }
    case 'merge':       return { ...state, ...action.value }
    case 'add':         return { ...state, [action.key]: [...(state[action.key] || []), action.item] }
    case 'update':      return {
      ...state,
      [action.key]: (state[action.key] || []).map((x) => (x.id === action.item.id ? { ...x, ...action.item } : x)),
    }
    case 'remove':      return { ...state, [action.key]: (state[action.key] || []).filter((x) => x.id !== action.id) }
    case 'reorder':     return { ...state, [action.key]: action.value }
    case 'replace-all': return action.value
    default:            return state
  }
}

export function AppProvider({ children }) {
  const [state, dispatch] = useReducer(reducer, null, loadState)
  const [route, setRoute] = useState({ name: 'dashboard', params: {} })
  const [aiPanel, setAiPanel] = useState({ open: false, context: null })
  const [toast, setToast] = useState(null)

  useEffect(() => { saveState(state) }, [state])

  // Theme
  useEffect(() => {
    const apply = () => {
      const t = state.settings.theme
      const dark = t === 'dark' || (t === 'system' && window.matchMedia('(prefers-color-scheme: dark)').matches)
      document.documentElement.classList.toggle('dark', dark)
    }
    apply()
    const mq = window.matchMedia('(prefers-color-scheme: dark)')
    const h = () => state.settings.theme === 'system' && apply()
    mq.addEventListener?.('change', h)
    return () => mq.removeEventListener?.('change', h)
  }, [state.settings.theme])

  // CRUD helpers
  const add = useCallback((key, item) => {
    const withId = { id: uid(), ...item }
    dispatch({ type: 'add', key, item: withId })
    return withId
  }, [])
  const update = useCallback((key, item) => dispatch({ type: 'update', key, item }), [])
  const remove = useCallback((key, id) => dispatch({ type: 'remove', key, id }), [])
  const set = useCallback((key, value) => dispatch({ type: 'set', key, value }), [])
  const merge = useCallback((value) => dispatch({ type: 'merge', value }), [])
  const replaceAll = useCallback((value) => dispatch({ type: 'replace-all', value }), [])
  const setSettings = useCallback((patch) => dispatch({ type: 'set', key: 'settings', value: { ...state.settings, ...patch } }), [state.settings])
  const setUser = useCallback((patch) => dispatch({ type: 'set', key: 'user', value: { ...state.user, ...patch } }), [state.user])

  const navigate = useCallback((name, params = {}) => setRoute({ name, params }), [])
  const openAI = useCallback((context = null) => setAiPanel({ open: true, context }), [])
  const closeAI = useCallback(() => setAiPanel({ open: false, context: null }), [])

  const showToast = useCallback((msg, kind = 'info') => {
    setToast({ msg, kind, id: uid() })
    setTimeout(() => setToast(null), 2500)
  }, [])

  const reset = useCallback(() => {
    resetState()
    replaceAll(defaultState)
  }, [replaceAll])

  const value = useMemo(() => ({
    state, dispatch, add, update, remove, set, merge, replaceAll, setSettings, setUser,
    route, navigate,
    aiPanel, openAI, closeAI,
    toast, showToast,
    reset,
  }), [state, add, update, remove, set, merge, replaceAll, setSettings, setUser, route, navigate, aiPanel, openAI, closeAI, toast, showToast, reset])

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>
}

export const useApp = () => {
  const ctx = useContext(AppCtx)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}
