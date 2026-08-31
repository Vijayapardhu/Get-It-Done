import { useMutation, useQueryClient, useQuery } from "@tanstack/react-query"
import { useNavigate, Link } from "react-router-dom"
import { adminApi } from "../lib/api"
import { ArrowLeft, Plus, X } from "@phosphor-icons/react"
import { useState } from "react"
import { FileUpload } from "../components/ui/FileUpload"

export function CategoryCreate() {
  const navigate = useNavigate()
  const queryClient = useQueryClient()

  const [form, setForm] = useState({
    name: "",
    description: "",
    icon: "",
    displayOrder: "0",
    status: "active",
    imageKey: null as string | null,
    accentColor: "",
    parentId: "",
  })

  const [subcategoryInput, setSubcategoryInput] = useState("")
  const [subcategories, setSubcategories] = useState<string[]>([])

  const { data: parentCategories } = useQuery({
    queryKey: ["parent-categories"],
    queryFn: () => adminApi.getAdminCategories().then((r) => r.data.categories),
  })

  const createMutation = useMutation({
    mutationFn: () => adminApi.createCategory({
      name: form.name,
      description: form.description || undefined,
      icon: form.icon || undefined,
      displayOrder: Number(form.displayOrder),
      status: form.status,
      imageKey: form.imageKey || undefined,
      accentColor: form.accentColor || undefined,
      parentId: form.parentId || undefined,
      subcategories: subcategories.length > 0 ? subcategories : undefined,
    }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: ["service-categories"] })
      queryClient.invalidateQueries({ queryKey: ["parent-categories"] })
      navigate(`/categories/${encodeURIComponent(res.data.category.name)}`)
    },
  })

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    createMutation.mutate()
  }

  const addSubcategory = () => {
    if (subcategoryInput.trim() && !subcategories.includes(subcategoryInput.trim())) {
      setSubcategories([...subcategories, subcategoryInput.trim()])
      setSubcategoryInput("")
    }
  }

  const removeSubcategory = (name: string) => {
    setSubcategories(subcategories.filter((s) => s !== name))
  }

  return (
    <div className="space-y-5">
      <div className="flex items-center gap-3">
        <Link to="/catalogue" className="p-1.5 rounded-md hover:bg-muted/50 transition-colors">
          <ArrowLeft size={18} />
        </Link>
        <div>
          <h1 className="text-lg font-semibold text-fg">New Category</h1>
          <p className="text-xs text-muted">Create a new service category</p>
        </div>
      </div>

      <form onSubmit={handleSubmit} className="space-y-5">
        <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
          <div className="lg:col-span-2 space-y-5">
            <div className="bg-white border border-border rounded-lg p-4 space-y-4">
              <h3 className="text-sm font-medium text-fg">Category Details</h3>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-fg mb-1">Name *</label>
                  <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    required
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-fg mb-1">Parent Category</label>
                  <select
                    value={form.parentId}
                    onChange={(e) => setForm((f) => ({ ...f, parentId: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  >
                    <option value="">None (Top Level)</option>
                    {parentCategories?.map((cat) => (
                      <option key={cat.id} value={cat.id}>{cat.name}</option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-medium text-fg mb-1">Description</label>
                <textarea
                  value={form.description}
                  onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))}
                  rows={3}
                  className="w-full px-3 py-2 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary resize-none"
                />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-fg mb-1">Icon</label>
                  <input
                    type="text"
                    value={form.icon}
                    onChange={(e) => setForm((f) => ({ ...f, icon: e.target.value }))}
                    placeholder="e.g., wrench, home, sparkle"
                    className="w-full px-3 py-2 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                </div>
                <div>
                  <label className="block text-xs font-medium text-fg mb-1">Display Order</label>
                  <input
                    type="number"
                    value={form.displayOrder}
                    onChange={(e) => setForm((f) => ({ ...f, displayOrder: e.target.value }))}
                    min="0"
                    className="w-full px-3 py-2 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  />
                </div>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-medium text-fg mb-1">Status</label>
                  <select
                    value={form.status}
                    onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}
                    className="w-full px-3 py-2 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                  >
                    <option value="active">Active</option>
                    <option value="inactive">Inactive</option>
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-medium text-fg mb-1">Accent Color</label>
                  <div className="flex items-center gap-2">
                    <input
                      type="color"
                      value={form.accentColor || "#6366f1"}
                      onChange={(e) => setForm((f) => ({ ...f, accentColor: e.target.value }))}
                      className="w-10 h-10 rounded-md border border-border cursor-pointer"
                    />
                    <input
                      type="text"
                      value={form.accentColor}
                      onChange={(e) => setForm((f) => ({ ...f, accentColor: e.target.value }))}
                      placeholder="#6366f1"
                      className="flex-1 px-3 py-2 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                    />
                  </div>
                </div>
              </div>
            </div>

            <div className="bg-white border border-border rounded-lg p-4 space-y-4">
              <h3 className="text-sm font-medium text-fg">Subcategories</h3>
              <p className="text-xs text-muted">Add subcategories under this category.</p>

              <div className="flex items-center gap-2">
                <input
                  type="text"
                  value={subcategoryInput}
                  onChange={(e) => setSubcategoryInput(e.target.value)}
                  onKeyDown={(e) => e.key === "Enter" && (e.preventDefault(), addSubcategory())}
                  placeholder="Add a subcategory..."
                  className="flex-1 px-3 py-2 text-sm border border-border rounded-md focus:outline-none focus:ring-2 focus:ring-primary/20 focus:border-primary"
                />
                <button
                  type="button"
                  onClick={addSubcategory}
                  className="p-2 rounded-md bg-primary/10 text-primary hover:bg-primary/20 transition-colors"
                >
                  <Plus size={16} />
                </button>
              </div>

              {subcategories.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {subcategories.map((sub) => (
                    <span
                      key={sub}
                      className="inline-flex items-center gap-1 px-2.5 py-1 text-xs font-medium bg-primary/10 text-primary rounded-full"
                    >
                      {sub}
                      <button
                        type="button"
                        onClick={() => removeSubcategory(sub)}
                        className="hover:text-danger"
                      >
                        <X size={12} />
                      </button>
                    </span>
                  ))}
                </div>
              )}
            </div>

            <div className="bg-white border border-border rounded-lg p-4 space-y-4">
              <h3 className="text-sm font-medium text-fg">Appearance</h3>
              <FileUpload
                value={form.imageKey}
                onChange={(key) => setForm((f) => ({ ...f, imageKey: key }))}
                type="category-image"
                label="Category Image"
                description="Upload an image for this category. Recommended size: 1200x800px"
                aspectRatio="video"
              />
            </div>
          </div>

          <div className="space-y-4">
            <div className="bg-white border border-border rounded-lg p-4">
              <h3 className="text-sm font-medium text-fg mb-3">Preview</h3>
              {form.imageKey ? (
                <div className="aspect-video rounded-md overflow-hidden bg-muted/30 mb-3">
                  <img src={`${import.meta.env.VITE_API_URL}/files/${encodeURIComponent(form.imageKey)}`} alt="" className="w-full h-full object-cover" />
                </div>
              ) : (
                <div
                  className="aspect-video rounded-md flex items-center justify-center mb-3"
                  style={{ backgroundColor: form.accentColor ? `${form.accentColor}20` : "var(--muted)" }}
                >
                  {form.icon ? (
                    <span className="text-3xl">{form.icon}</span>
                  ) : (
                    <span className="text-muted/50 text-3xl">📦</span>
                  )}
                </div>
              )}
              <h4 className="font-medium text-fg">{form.name || "Category Name"}</h4>
              {form.description && (
                <p className="text-xs text-muted mt-1 line-clamp-2">{form.description}</p>
              )}
              {subcategories.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {subcategories.map((sub) => (
                    <span key={sub} className="text-[10px] px-1.5 py-0.5 bg-muted/30 rounded text-muted">
                      {sub}
                    </span>
                  ))}
                </div>
              )}
            </div>

            {createMutation.isError && (
              <div className="bg-danger/10 border border-danger/20 rounded-lg p-3">
                <p className="text-xs text-danger">
                  {(createMutation.error as Error)?.message ?? "Failed to create category"}
                </p>
              </div>
            )}
          </div>
        </div>

        <div className="flex items-center justify-end gap-3 pt-4 border-t border-border">
          <Link
            to="/catalogue"
            className="px-4 py-2 text-sm font-medium text-fg bg-white border border-border rounded-md hover:bg-muted/50 transition-colors"
          >
            Cancel
          </Link>
          <button
            type="submit"
            disabled={createMutation.isPending}
            className="px-4 py-2 text-sm font-medium text-white bg-accent rounded-md hover:bg-accent/90 transition-colors disabled:opacity-50"
          >
            {createMutation.isPending ? "Creating..." : "Create Category"}
          </button>
        </div>
      </form>
    </div>
  )
}
