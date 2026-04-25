import { createContext, useContext, useEffect, useMemo, useReducer, useState, useCallback, useRef } from 'react'
import { defaultState, loadState, saveState, resetState } from '../lib/storage.js'
import { hasSupabase, supabase } from '../lib/supabase.js'
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
  const [aiPanel, setAiPanel] = useState({ open: false, context: null, initialPrompt: null, requestId: null })
  const [toast, setToast] = useState(null)
  const [account, setAccount] = useState({ user: null, ready: false, sync: hasSupabase ? 'Not signed in' : 'Supabase not configured' })
  const cloudLoadedRef = useRef(false)

  useEffect(() => { saveState(state) }, [state])

  useEffect(() => {
    if (!supabase) {
      cloudLoadedRef.current = true
      return
    }

    const loadSession = async () => {
      const { data } = await supabase.auth.getSession()
      const user = data.session?.user || null
      setAccount({ user, ready: true, sync: user ? 'Loading cloud workspace...' : 'Not signed in' })
      if (user) await loadCloudState(user.id)
      else cloudLoadedRef.current = true
    }

    loadSession()
    const { data } = supabase.auth.onAuthStateChange(async (_event, session) => {
      const user = session?.user || null
      setAccount({ user, ready: true, sync: user ? 'Loading cloud workspace...' : 'Not signed in' })
      if (user) await loadCloudState(user.id)
      else cloudLoadedRef.current = true
    })

    return () => data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!supabase || !account.user || !cloudLoadedRef.current) return
    const handle = setTimeout(async () => {
      setAccount((current) => ({ ...current, sync: 'Saving...' }))
      const { error } = await supabase
        .from('app_states')
        .upsert({ user_id: account.user.id, state: cloudSafeState(state), updated_at: new Date().toISOString() })
      setAccount((current) => ({ ...current, sync: error ? error.message : 'Synced' }))
    }, 900)

    return () => clearTimeout(handle)
  }, [state, account.user])

  const loadCloudState = async (userId) => {
    const { data, error } = await supabase.from('app_states').select('state').eq('user_id', userId).maybeSingle()
    cloudLoadedRef.current = true
    if (error) {
      setAccount((current) => ({ ...current, sync: error.message }))
      return
    }
    if (data?.state) {
      dispatch({ type: 'replace-all', value: restoreLocalSecrets(data.state, loadState()) })
      setAccount((current) => ({ ...current, sync: 'Cloud workspace loaded' }))
    } else {
      await supabase.from('app_states').upsert({ user_id: userId, state: cloudSafeState(loadState()) })
      setAccount((current) => ({ ...current, sync: 'Cloud workspace created' }))
    }
  }

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
  const openAI = useCallback((context = null, initialPrompt = null) => {
    setAiPanel({ open: true, context, initialPrompt, requestId: uid() })
  }, [])
  const closeAI = useCallback(() => setAiPanel({ open: false, context: null, initialPrompt: null, requestId: null }), [])
  const clearAIPrompt = useCallback(() => {
    setAiPanel((current) => ({ ...current, initialPrompt: null }))
  }, [])

  const showToast = useCallback((msg, kind = 'info') => {
    setToast({ msg, kind, id: uid() })
    setTimeout(() => setToast(null), 2500)
  }, [])

  const signIn = useCallback(async (email, password) => {
    if (!supabase) {
      showToast('Supabase is not configured yet', 'error')
      return
    }
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (!error) {
      showToast('Signed in', 'success')
      return
    }
    const created = await supabase.auth.signUp({ email, password })
    if (created.error) showToast(created.error.message, 'error')
    else showToast('Account created. Check email confirmation if Supabase requires it.', 'success')
  }, [showToast])

  const signOut = useCallback(async () => {
    await supabase?.auth.signOut()
    showToast('Signed out', 'success')
  }, [showToast])

  const reset = useCallback(() => {
    resetState()
    replaceAll(defaultState)
  }, [replaceAll])

  const value = useMemo(() => ({
    state, dispatch, add, update, remove, set, merge, replaceAll, setSettings, setUser,
    route, navigate,
    aiPanel, openAI, closeAI, clearAIPrompt,
    account, signIn, signOut,
    toast, showToast,
    reset,
  }), [state, add, update, remove, set, merge, replaceAll, setSettings, setUser, route, navigate, aiPanel, openAI, closeAI, clearAIPrompt, account, signIn, signOut, toast, showToast, reset])

  return <AppCtx.Provider value={value}>{children}</AppCtx.Provider>
}

export const useApp = () => {
  const ctx = useContext(AppCtx)
  if (!ctx) throw new Error('useApp must be used within AppProvider')
  return ctx
}

function cloudSafeState(state) {
  return {
    ...state,
    settings: {
      ...state.settings,
      aiKey: ''
    }
  }
}

function restoreLocalSecrets(cloudState, localState) {
  return {
    ...defaultState,
    ...cloudState,
    settings: {
      ...defaultState.settings,
      ...(cloudState.settings || {}),
      aiKey: localState.settings?.aiKey || ''
    }
  }
}
