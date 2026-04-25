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
  const [account, setAccount] = useState({
    user: null,
    ready: !hasSupabase,
    sync: hasSupabase ? 'Checking session...' : 'Supabase not configured',
    error: null,
  })
  const cloudLoadedRef = useRef(!hasSupabase)

  useEffect(() => {
    saveState(account.user ? localCacheState(state) : state)
  }, [state, account.user])

  useEffect(() => {
    if (!supabase) {
      cloudLoadedRef.current = true
      return
    }

    const loadSession = async () => {
      try {
        const { data, error } = await withTimeout(supabase.auth.getSession(), 'Session check timed out')
        if (error) throw error
        const user = data.session?.user || null
        cloudLoadedRef.current = false
        setAccount({ user, ready: true, sync: user ? 'Loading cloud workspace...' : 'Local demo mode', error: null })
        if (user) await loadCloudState(user.id)
        else {
          cloudLoadedRef.current = true
          dispatch({ type: 'replace-all', value: restoreLocalSecrets(defaultState, loadState()) })
        }
      } catch (error) {
        cloudLoadedRef.current = true
        setAccount((current) => ({ ...current, ready: true, sync: 'Sync error', error: error.message }))
      }
    }

    loadSession()
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user || null
      cloudLoadedRef.current = false
      setAccount({ user, ready: true, sync: user ? 'Loading cloud workspace...' : 'Local demo mode', error: null })
      if (user) setTimeout(() => loadCloudState(user.id), 0)
      else {
        cloudLoadedRef.current = true
        dispatch({ type: 'replace-all', value: restoreLocalSecrets(defaultState, loadState()) })
      }
    })

    return () => data.subscription.unsubscribe()
  }, [])

  useEffect(() => {
    if (!supabase || !account.user || !cloudLoadedRef.current) return
    const handle = setTimeout(async () => {
      await saveCloudState(account.user.id, state)
    }, 900)

    return () => clearTimeout(handle)
  }, [state, account.user?.id])

  const loadCloudState = async (userId) => {
    cloudLoadedRef.current = false
    try {
      const { data, error } = await withTimeout(
        supabase.from('app_states').select('state').eq('user_id', userId).maybeSingle(),
        'Cloud workspace load timed out'
      )
      if (error) throw error
      if (data?.state) {
        const nextState = restoreLocalSecrets(data.state, loadState())
        cloudLoadedRef.current = true
        dispatch({ type: 'replace-all', value: nextState })
        setAccount((current) => ({ ...current, sync: 'Cloud workspace loaded', error: null }))
      } else {
        const nextState = restoreLocalSecrets(defaultState, loadState())
        const createError = await saveCloudState(userId, nextState, 'Cloud workspace created')
        cloudLoadedRef.current = true
        dispatch({ type: 'replace-all', value: nextState })
        if (!createError) setAccount((current) => ({ ...current, sync: 'Cloud workspace created', error: null }))
      }
    } catch (error) {
      cloudLoadedRef.current = true
      setAccount((current) => ({ ...current, sync: 'Sync error', error: error.message }))
    }
  }

  const saveCloudState = async (userId, nextState = state, success = 'Synced') => {
    if (!supabase || !userId) return null
    setAccount((current) => ({ ...current, sync: 'Saving...', error: null }))
    try {
      const { error } = await withTimeout(
        supabase
          .from('app_states')
          .upsert({ user_id: userId, state: cloudSafeState(nextState), updated_at: new Date().toISOString() }),
        'Cloud workspace save timed out'
      )
      setAccount((current) => ({ ...current, sync: error ? 'Sync error' : success, error: error?.message || null }))
      return error
    } catch (error) {
      setAccount((current) => ({ ...current, sync: 'Sync error', error: error.message }))
      return error
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
    const created = await supabase.auth.signUp({
      email,
      password,
      options: {
        emailRedirectTo: window.location.origin,
      },
    })
    if (created.error) showToast(created.error.message, 'error')
    else showToast('Account created. Check email confirmation if Supabase requires it.', 'success')
  }, [showToast])

  const signOut = useCallback(async () => {
    await supabase?.auth.signOut()
    resetState()
    replaceAll(restoreLocalSecrets(defaultState, loadState()))
    showToast('Signed out', 'success')
  }, [replaceAll, showToast])

  const retrySync = useCallback(async () => {
    if (!account.user) return
    setAccount((current) => ({ ...current, sync: 'Loading cloud workspace...', error: null }))
    await loadCloudState(account.user.id)
  }, [account.user, state])

  const reset = useCallback(() => {
    resetState()
    replaceAll(defaultState)
  }, [replaceAll])

  const value = useMemo(() => ({
    state, dispatch, add, update, remove, set, merge, replaceAll, setSettings, setUser,
    route, navigate,
    aiPanel, openAI, closeAI, clearAIPrompt,
    account, signIn, signOut, retrySync,
    toast, showToast,
    reset,
  }), [state, add, update, remove, set, merge, replaceAll, setSettings, setUser, route, navigate, aiPanel, openAI, closeAI, clearAIPrompt, account, signIn, signOut, retrySync, toast, showToast, reset])

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
    files: (state.files || []).map(stripFileForCloud),
    settings: {
      ...state.settings,
      aiKey: ''
    }
  }
}

function localCacheState(state) {
  return {
    ...state,
    files: (state.files || []).map((file) => file?.storagePath ? stripFileForCloud(file) : file)
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
    },
    files: (cloudState.files || []).map(stripFileForCloud)
  }
}

function stripFileForCloud(file) {
  const { data, signedUrl, previewUrl, ...metadata } = file || {}
  return metadata
}

function withTimeout(promise, message, ms = 12000) {
  let timer
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms)
  })
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer))
}
