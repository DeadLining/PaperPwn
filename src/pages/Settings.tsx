import { useEffect, useState, useRef, useCallback } from "react"
import { Key, Database, Palette, Globe, Loader2, CheckCircle2, AlertCircle } from "lucide-react"
import { useAiStore } from "@/lib/stores/ai-store"
import { getStoredTheme, setStoredTheme, type ThemePreference } from "@/lib/theme"
import { cn } from "@/lib/utils"

export function Settings() {
  const { config, loadConfig, saveConfig } = useAiStore()

  const [apiBase, setApiBase] = useState("")
  const [apiKey, setApiKey] = useState("")
  const [modelName, setModelName] = useState("")
  const [temperature, setTemperature] = useState(0.7)
  const [maxTokens, setMaxTokens] = useState(2048)
  const [proxyUrl, setProxyUrl] = useState("")
  const [theme, setTheme] = useState<ThemePreference>(() => getStoredTheme())

  const [saveStatus, setSaveStatus] = useState<"idle" | "saving" | "saved" | "error">("idle")
  const [validationErrors, setValidationErrors] = useState<Record<string, string>>({})

  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  // Load config on mount
  useEffect(() => {
    loadConfig()
  }, [loadConfig])

  // Fill form when config loaded
  useEffect(() => {
    if (config) {
      setApiBase(config.apiBase)
      setApiKey(config.apiKey)
      setModelName(config.modelName)
      setTemperature(config.temperature)
      setMaxTokens(config.maxTokens)
      setProxyUrl(config.proxyUrl || "")
    }
  }, [config])

  // Validate fields
  const validate = useCallback((field: string, value: string): string | null => {
    switch (field) {
      case "apiBase":
        if (!value) return "API Base URL is required"
        try {
          new URL(value)
        } catch {
          return "Invalid URL format"
        }
        return null
      case "apiKey":
        if (!value) return "API Key is required"
        if (value.length < 8) return "API Key seems too short"
        return null
      case "modelName":
        if (!value) return "Model name is required"
        return null
      case "proxyUrl":
        if (!value) return null
        try {
          new URL(value)
        } catch {
          return "Invalid proxy URL format"
        }
        return null
      default:
        return null
    }
  }, [])

  // Debounced save
  const triggerDebouncedSave = useCallback((overrides: Partial<{
    apiBase: string
    apiKey: string
    modelName: string
    temperature: number
    maxTokens: number
    proxyUrl: string
  }> = {}) => {
    const nextApiBase = overrides.apiBase ?? apiBase
    const nextApiKey = overrides.apiKey ?? apiKey
    const nextModelName = overrides.modelName ?? modelName
    const nextTemperature = overrides.temperature ?? temperature
    const nextMaxTokens = overrides.maxTokens ?? maxTokens
    const nextProxyUrl = overrides.proxyUrl ?? proxyUrl

    // Validate all fields first
    const errors: Record<string, string> = {}
    const baseErr = validate("apiBase", nextApiBase)
    if (baseErr) errors.apiBase = baseErr
    const keyErr = validate("apiKey", nextApiKey)
    if (keyErr) errors.apiKey = keyErr
    const modelErr = validate("modelName", nextModelName)
    if (modelErr) errors.modelName = modelErr
    const proxyErr = validate("proxyUrl", nextProxyUrl)
    if (proxyErr) errors.proxyUrl = proxyErr
    setValidationErrors(errors)

    if (Object.keys(errors).length > 0) return

    if (debounceRef.current) clearTimeout(debounceRef.current)
    setSaveStatus("saving")
    debounceRef.current = setTimeout(async () => {
      try {
        await saveConfig(nextApiBase, nextApiKey, nextModelName, nextTemperature, nextMaxTokens, nextProxyUrl)
        setSaveStatus("saved")
        setTimeout(() => setSaveStatus("idle"), 2000)
      } catch (e) {
        setSaveStatus("error")
      }
    }, 800)
  }, [apiBase, apiKey, modelName, temperature, maxTokens, proxyUrl, saveConfig, validate])

  // Field change handlers
  const handleApiBaseChange = (value: string) => {
    setApiBase(value)
    const err = validate("apiBase", value)
    setValidationErrors((prev) => ({ ...prev, apiBase: err || "" }))
    triggerDebouncedSave({ apiBase: value })
  }

  const handleApiKeyChange = (value: string) => {
    setApiKey(value)
    const err = validate("apiKey", value)
    setValidationErrors((prev) => ({ ...prev, apiKey: err || "" }))
    triggerDebouncedSave({ apiKey: value })
  }

  const handleModelNameChange = (value: string) => {
    setModelName(value)
    const err = validate("modelName", value)
    setValidationErrors((prev) => ({ ...prev, modelName: err || "" }))
    triggerDebouncedSave({ modelName: value })
  }

  const handleTemperatureChange = (value: number) => {
    setTemperature(value)
    triggerDebouncedSave({ temperature: value })
  }

  const handleMaxTokensChange = (value: number) => {
    setMaxTokens(value)
    triggerDebouncedSave({ maxTokens: value })
  }

  const handleProxyUrlChange = (value: string) => {
    setProxyUrl(value)
    const err = validate("proxyUrl", value)
    setValidationErrors((prev) => ({ ...prev, proxyUrl: err || "" }))
    triggerDebouncedSave({ proxyUrl: value })
  }

  const handleThemeChange = (nextTheme: ThemePreference) => {
    setTheme(nextTheme)
    setStoredTheme(nextTheme)
  }

  const themeButtonClass = (value: ThemePreference) => cn(
    "px-3 py-1.5 text-sm rounded-md border transition-colors",
    theme === value
      ? "border-primary bg-primary text-primary-foreground"
      : "border-input bg-background text-foreground hover:bg-accent hover:text-accent-foreground"
  )

  return (
    <div className="flex flex-col h-full overflow-auto">
      <header className="p-4 border-b border-border">
        <h2 className="text-xl font-semibold text-foreground">Settings</h2>
      </header>

      <div className="p-6 space-y-8 max-w-2xl">
        {/* API Configuration */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Key className="h-5 w-5 text-primary" />
            <h3 className="text-base font-medium text-foreground">API Configuration</h3>
            {saveStatus === "saving" && <Loader2 className="h-3 w-3 animate-spin text-muted-foreground" />}
            {saveStatus === "saved" && <CheckCircle2 className="h-3 w-3 text-green-500" />}
            {saveStatus === "error" && <AlertCircle className="h-3 w-3 text-red-500" />}
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                API Base URL
              </label>
              <input
                type="text"
                placeholder="https://api.openai.com/v1"
                className="w-full px-3 py-2 text-sm border border-input rounded-md bg-background text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-ring"
                value={apiBase}
                onChange={(e) => handleApiBaseChange(e.target.value)}
              />
              {validationErrors.apiBase && (
                <p className="text-xs text-red-500 mt-1">{validationErrors.apiBase}</p>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                Custom endpoint for proxy or local deployment
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                API Key
              </label>
              <input
                type="password"
                placeholder="sk-..."
                className="w-full px-3 py-2 text-sm border border-input rounded-md bg-background text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-ring"
                value={apiKey}
                onChange={(e) => handleApiKeyChange(e.target.value)}
              />
              {validationErrors.apiKey && (
                <p className="text-xs text-red-500 mt-1">{validationErrors.apiKey}</p>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                Required for AI-powered features (summary, Q&A, translation)
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Model Name
              </label>
              <input
                type="text"
                placeholder="gpt-4o"
                className="w-full px-3 py-2 text-sm border border-input rounded-md bg-background text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-ring"
                value={modelName}
                onChange={(e) => handleModelNameChange(e.target.value)}
              />
              {validationErrors.modelName && (
                <p className="text-xs text-red-500 mt-1">{validationErrors.modelName}</p>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                OpenAI-compatible model identifier (e.g., gpt-4o, gpt-4o-mini)
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Temperature
              </label>
              <div className="flex items-center gap-3">
                <input
                  type="range"
                  min={0}
                  max={2}
                  step={0.1}
                  value={temperature}
                  onChange={(e) => handleTemperatureChange(parseFloat(e.target.value))}
                  className="flex-1"
                />
                <span className="text-sm text-muted-foreground w-8">{temperature}</span>
              </div>
            </div>
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Max Tokens
              </label>
              <input
                type="number"
                min={128}
                max={8192}
                value={maxTokens}
                onChange={(e) => handleMaxTokensChange(parseInt(e.target.value, 10) || 2048)}
                className="w-full px-3 py-2 text-sm border border-input rounded-md bg-background text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>
        </section>

        {/* Library Settings */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Database className="h-5 w-5 text-primary" />
            <h3 className="text-base font-medium text-foreground">Library</h3>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Storage Path
              </label>
              <input
                type="text"
                placeholder="~/PaperLibrary"
                className="w-full px-3 py-2 text-sm border border-input rounded-md bg-background text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-ring"
              />
            </div>
          </div>
        </section>

        {/* Appearance */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Palette className="h-5 w-5 text-primary" />
            <h3 className="text-base font-medium text-foreground">Appearance</h3>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Theme
              </label>
              <div className="flex gap-2">
                <button className={themeButtonClass("light")} onClick={() => handleThemeChange("light")}>
                  Light
                </button>
                <button className={themeButtonClass("dark")} onClick={() => handleThemeChange("dark")}>
                  Dark
                </button>
                <button className={themeButtonClass("system")} onClick={() => handleThemeChange("system")}>
                  System
                </button>
              </div>
            </div>
          </div>
        </section>

        {/* Network */}
        <section>
          <div className="flex items-center gap-2 mb-4">
            <Globe className="h-5 w-5 text-primary" />
            <h3 className="text-base font-medium text-foreground">Network</h3>
          </div>
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-foreground mb-1">
                Proxy URL
              </label>
              <input
                type="text"
                placeholder="http://127.0.0.1:7890"
                className="w-full px-3 py-2 text-sm border border-input rounded-md bg-background text-foreground placeholder:text-muted-foreground outline-none focus:ring-1 focus:ring-ring"
                value={proxyUrl}
                onChange={(e) => handleProxyUrlChange(e.target.value)}
              />
              {validationErrors.proxyUrl && (
                <p className="text-xs text-red-500 mt-1">{validationErrors.proxyUrl}</p>
              )}
              <p className="text-xs text-muted-foreground mt-1">
                Used for downloading papers from URL when configured.
              </p>
            </div>
          </div>
        </section>
      </div>
    </div>
  )
}
