/** 解析 public 目录资源 URL（兼容 GitHub Pages 子路径） */
export function assetUrl(path: string): string {
  const normalized = path.replace(/^\//, '')
  const base = import.meta.env.BASE_URL
  return `${base}${normalized}`
}
