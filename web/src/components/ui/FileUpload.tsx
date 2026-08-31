import { useState, useRef } from "react"
import { adminApi } from "../../lib/api"
import { Images, X, Clock, CheckCircle } from "@phosphor-icons/react"

interface FileUploadProps {
  value?: string | null
  onChange: (fileKey: string | null) => void
  type: string
  accept?: string
  className?: string
  aspectRatio?: "video" | "square" | "auto"
  label?: string
  description?: string
}

export function FileUpload({
  value,
  onChange,
  type,
  accept = "image/*",
  className = "",
  aspectRatio = "video",
  label,
  description,
}: FileUploadProps) {
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  const aspectClass = aspectRatio === "video" ? "aspect-video" : aspectRatio === "square" ? "aspect-square" : "h-32"

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return

    setError(null)
    setUploading(true)

    try {
      const result = await adminApi.uploadFile(file, type)
      onChange(result.fileKey)
    } catch (err) {
      setError((err as Error).message || "Upload failed")
    } finally {
      setUploading(false)
      if (inputRef.current) inputRef.current.value = ""
    }
  }

  const handleRemove = () => {
    onChange(null)
  }

  const previewUrl = value ? `${import.meta.env.VITE_API_URL}/files/${encodeURIComponent(value)}` : null

  return (
    <div className={className}>
      {label && (
        <label className="block text-xs font-medium text-fg mb-1">{label}</label>
      )}
      {description && (
        <p className="text-xs text-muted mb-2">{description}</p>
      )}

      {previewUrl ? (
        <div className={`relative ${aspectClass} rounded-lg overflow-hidden bg-muted/30 border border-border`}>
          <img src={previewUrl} alt="" className="w-full h-full object-cover" />
          <div className="absolute inset-0 bg-black/40 opacity-0 hover:opacity-100 transition-opacity flex items-center justify-center gap-2">
            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              className="p-2 bg-white rounded-full hover:bg-white/90 transition-colors"
            >
              <Images size={16} />
            </button>
            <button
              type="button"
              onClick={handleRemove}
              className="p-2 bg-white rounded-full hover:bg-white/90 transition-colors text-danger"
            >
              <X size={16} />
            </button>
          </div>
          <div className="absolute bottom-2 right-2">
            <CheckCircle size={16} className="text-green-500" />
          </div>
        </div>
      ) : (
        <label className={`flex flex-col items-center justify-center ${aspectClass} rounded-lg border-2 border-dashed border-border bg-muted/10 cursor-pointer hover:border-accent/50 hover:bg-muted/20 transition-colors`}>
          {uploading ? (
            <div className="flex flex-col items-center gap-2">
              <Clock size={24} className="text-accent animate-spin" />
              <span className="text-xs text-muted">Uploading…</span>
            </div>
          ) : (
            <div className="flex flex-col items-center gap-2 p-4 text-center">
              <Images size={24} className="text-muted" />
              <span className="text-xs text-muted">
                Click to upload or drag and drop
              </span>
              <span className="text-[10px] text-muted/70">PNG, JPG, WEBP up to 5MB</span>
            </div>
          )}
          <input
            ref={inputRef}
            type="file"
            accept={accept}
            className="hidden"
            disabled={uploading}
            onChange={handleFileSelect}
          />
        </label>
      )}

      {error && (
        <p className="text-xs text-danger mt-1">{error}</p>
      )}
    </div>
  )
}
