import { create } from "zustand"
import { toast } from "sonner"
import { listen } from "@tauri-apps/api/event"
import {
  type AiConfig,
  getAiConfig,
  saveAiConfig,
  saveConversation,
  getConversations,
  getOrCreateAiCache,
  saveAiCache,
  generateSummary as apiGenerateSummary,
  generateSummaryWithContext as apiGenerateSummaryWithContext,
  explainText as apiExplainText,
  aiChat as apiAiChat,
  translateText as apiTranslateText,
} from "@/lib/api"

// SHA256 hash utility - matches backend implementation
async function sha256(text: string): Promise<string> {
  const encoder = new TextEncoder()
  const data = encoder.encode(text)
  const hashBuffer = await crypto.subtle.digest('SHA-256', data)
  const hashArray = Array.from(new Uint8Array(hashBuffer))
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')
  return hashHex
}

// Generate cache key: SHA256(query_type + query_text)
async function generateCacheKey(queryType: string, queryText: string): Promise<string> {
  return await sha256(queryType + queryText)
}

interface AiMessage {
  role: "user" | "assistant" | "error"
  content: string
  timestamp?: string
}

interface AiStoreState {
  config: AiConfig | null
  conversations: AiMessage[]
  loading: boolean
  error: string | null
  summaryLoading: boolean
  explainLoading: boolean
  chatLoading: boolean
  translateLoading: boolean
}

interface AiStoreActions {
  loadConfig: () => Promise<void>
  saveConfig: (apiBase: string, apiKey: string, modelName: string, temperature: number, maxTokens: number, proxyUrl?: string) => Promise<void>
  loadConversations: (paperId: string | number) => Promise<void>
  addMessage: (paperId: string | number, message: AiMessage) => Promise<void>
  clearConversations: () => void
  getCachedResponse: (queryHash: string, paperId: string | number) => Promise<string | null>
  cacheResponse: (queryHash: string, paperId: string | number, queryText: string, response: string) => Promise<void>
  generateSummary: (paperId: string | number) => Promise<void>
  explainText: (paperId: string | number, text: string, page: number) => Promise<void>
  aiChat: (paperId: string | number, question: string, context?: string) => Promise<void>
  translateText: (paperId: string | number, text: string, page?: number) => Promise<string>
}

function classifyError(e: unknown): string {
  const msg = String(e)
  if (msg.includes("401") || msg.includes("403") || msg.includes("ApiKey") || msg.includes("API key") || msg.includes("apiKeyError")) {
    return "请检查 API Key 配置"
  }
  if (msg.includes("timeout") || msg.includes("Timeout") || msg.includes("超时") || msg.includes("timeoutError")) {
    return "请求超时，请重试"
  }
  if (msg.includes("Network") || msg.includes("network") || msg.includes("网络") || msg.includes("连接") || msg.includes("networkError")) {
    return "网络不可用，请检查连接"
  }
  return "操作失败，请重试"
}

export const useAiStore = create<AiStoreState & AiStoreActions>((set, get) => ({
  config: null,
  conversations: [],
  loading: false,
  error: null,
  summaryLoading: false,
  explainLoading: false,
  chatLoading: false,
  translateLoading: false,

  loadConfig: async () => {
    try {
      const config = await getAiConfig()
      set({ config })
    } catch (e) {
      set({ error: String(e) })
    }
  },

  saveConfig: async (apiBase: string, apiKey: string, modelName: string, temperature: number, maxTokens: number, proxyUrl = "") => {
    try {
      const config = await saveAiConfig(apiBase, apiKey, modelName, temperature, maxTokens, proxyUrl)
      set({ config })
    } catch (e) {
      toast.error(classifyError(e))
      set({ error: String(e) })
    }
  },

  loadConversations: async (paperId: string | number) => {
    set({ loading: true, error: null })
    try {
      const json = await getConversations(paperId)
      const conversations: AiMessage[] = json ? JSON.parse(json) : []
      set({ conversations, loading: false })
    } catch (e) {
      set({ conversations: [], error: String(e), loading: false })
    }
  },

  addMessage: async (paperId: string | number, message: AiMessage) => {
    const { conversations } = get()
    const updated = [...conversations, message]
    set({ conversations: updated })
    try {
      await saveConversation(paperId, JSON.stringify(updated))
    } catch (e) {
      set({ error: String(e) })
    }
  },

  clearConversations: () => set({ conversations: [] }),

  getCachedResponse: async (queryHash: string, paperId: string | number) => {
    try {
      return await getOrCreateAiCache(queryHash, paperId)
    } catch (e) {
      return null
    }
  },

  cacheResponse: async (queryHash: string, paperId: string | number, queryText: string, response: string) => {
    try {
      await saveAiCache(queryHash, paperId, queryText, response)
    } catch (e) {
      console.error("Failed to cache AI response", e)
    }
  },

  generateSummary: async (paperId: string | number) => {
    set({ summaryLoading: true, error: null })
    try {
      const pdfContext = await new Promise<string>((resolve) => {
        let resolved = false
        const timer = setTimeout(() => {
          if (!resolved) {
            resolved = true
            resolve("")
          }
        }, 1000)
        window.dispatchEvent(new CustomEvent("request-pdf-summary-context", {
          detail: {
            pages: 3,
            maxChars: 8000,
            callback: (text: string) => {
              if (resolved) return
              resolved = true
              clearTimeout(timer)
              resolve(text)
            },
          },
        }))
      })
      const result = pdfContext.trim()
        ? await apiGenerateSummaryWithContext(paperId, pdfContext)
        : await apiGenerateSummary(paperId)
      await get().addMessage(paperId, { role: "assistant", content: result, timestamp: new Date().toISOString() })
      set({ summaryLoading: false })
    } catch (e) {
      const err = classifyError(e)
      toast.error(err)
      await get().addMessage(paperId, { role: "error", content: err, timestamp: new Date().toISOString() })
      set({ error: String(e), summaryLoading: false })
    }
  },

  explainText: async (paperId: string | number, text: string, page: number) => {
    set({ explainLoading: true, error: null })
    try {
      // Cache key: SHA256("explain_text" + paperId + text)
      const queryType = "explain_text"
      const queryText = paperId + "|" + text.substring(0, 200) + "|" + page
      const cacheKey = await generateCacheKey(queryType, queryText)

      const cached = await get().getCachedResponse(cacheKey, paperId)
      if (cached) {
        await get().addMessage(paperId, { role: "assistant", content: cached, timestamp: new Date().toISOString() })
        set({ explainLoading: false })
        return
      }
      const result = await apiExplainText(paperId, text, page)
      await get().addMessage(paperId, { role: "assistant", content: result, timestamp: new Date().toISOString() })
      await get().cacheResponse(cacheKey, paperId, queryText, result)
      set({ explainLoading: false })
    } catch (e) {
      const err = classifyError(e)
      toast.error(err)
      await get().addMessage(paperId, { role: "error", content: err, timestamp: new Date().toISOString() })
      set({ error: String(e), explainLoading: false })
    }
  },

  aiChat: async (paperId: string | number, question: string, context?: string) => {
    set({ chatLoading: true, error: null })
    // Add user message
    const userMsg: AiMessage = { role: "user", content: question, timestamp: new Date().toISOString() }
    await get().addMessage(paperId, userMsg)

    // Add placeholder assistant message for streaming
    const { conversations } = get()
    const placeholder: AiMessage = { role: "assistant", content: "", timestamp: new Date().toISOString() }
    const withPlaceholder = [...conversations, placeholder]
    set({ conversations: withPlaceholder })

    try {
      const queryType = "ai_chat_v3_routed_context"
      const queryText = paperId + "|" + question + "|" + (context || "")
      const cacheKey = await generateCacheKey(queryType, queryText)

      // Check cache first
      const cached = await get().getCachedResponse(cacheKey, paperId)
      if (cached) {
        // Use cached response, update placeholder
        const { conversations: updatedConvs } = get()
        const final = [...updatedConvs]
        final[final.length - 1] = { ...placeholder, content: cached }
        set({ conversations: final })
        await saveConversation(paperId, JSON.stringify(final))
        set({ chatLoading: false })
        return
      }

      // Setup streaming listeners
      const unlistenChunk = await listen<string>("ai-stream-chunk", (event) => {
        const { conversations } = get()
        const lastMsg = conversations[conversations.length - 1]
        if (lastMsg && lastMsg.role === "assistant") {
          const updated = [...conversations]
          updated[updated.length - 1] = { ...lastMsg, content: lastMsg.content + event.payload }
          set({ conversations: updated })
        }
      })

      const result = await apiAiChat(paperId, question, context)

      // Cleanup streaming listener
      unlistenChunk()

      // Get final content
      const finalContent = result || get().conversations[get().conversations.length - 1]?.content || ""

      // If streaming did not update the placeholder, set result directly
      const { conversations: finalConvs } = get()
      const last = finalConvs[finalConvs.length - 1]
      if (last && last.role === "assistant" && last.content === "") {
        const updated = [...finalConvs]
        updated[updated.length - 1] = { ...last, content: finalContent }
        set({ conversations: updated })
        await saveConversation(paperId, JSON.stringify(updated))
      } else {
        // Streaming already updated - save final state
        await saveConversation(paperId, JSON.stringify(finalConvs))
      }

      // Cache the response
      await get().cacheResponse(cacheKey, paperId, queryText, finalContent)
      set({ chatLoading: false })
    } catch (e) {
      const err = classifyError(e)
      toast.error(err)
      // Remove placeholder, add error message
      const { conversations } = get()
      const cleaned = conversations.filter(m => m !== placeholder)
      set({ conversations: [...cleaned, { role: "error", content: err, timestamp: new Date().toISOString() }] })
      await saveConversation(paperId, JSON.stringify(get().conversations))
      set({ error: String(e), chatLoading: false })
    }
  },

  translateText: async (paperId: string | number, text: string, page?: number): Promise<string> => {
    set({ translateLoading: true, error: null })
    try {
      // Cache key: SHA256("translate_text" + paperId + text)
      const queryType = "translate_text"
      const queryText = paperId + "|" + text.substring(0, 200) + "|" + (page ?? 0)
      const cacheKey = await generateCacheKey(queryType, queryText)

      const cached = await get().getCachedResponse(cacheKey, paperId)
      if (cached) {
        set({ translateLoading: false })
        return cached
      }
      const result = await apiTranslateText(paperId, text, page)
      await get().cacheResponse(cacheKey, paperId, queryText, result)
      set({ translateLoading: false })
      return result
    } catch (e) {
      const err = classifyError(e)
      toast.error(err)
      set({ error: String(e), translateLoading: false })
      throw e
    }
  },
}))