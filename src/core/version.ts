import packageJson from '../../package.json'

export interface VersionInfo {
  version: string
  buildTime: string
  commit?: string
}

export const LOCAL_VERSION: VersionInfo = {
  version: packageJson.version,
  buildTime: import.meta.env.VITE_BUILD_TIME ?? 'dev',
  commit: import.meta.env.VITE_COMMIT_SHA ?? 'local',
}

const VERSION_URL = `${import.meta.env.BASE_URL}version.json`

export async function fetchRemoteVersion(timeoutMs = 3000): Promise<VersionInfo | null> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), timeoutMs)

  try {
    const res = await fetch(VERSION_URL, {
      cache: 'no-store',
      signal: controller.signal,
    })
    if (!res.ok) return null
    return (await res.json()) as VersionInfo
  } catch {
    return null
  } finally {
    clearTimeout(timer)
  }
}

export function compareVersions(a: string, b: string): number {
  const pa = a.split('.').map(Number)
  const pb = b.split('.').map(Number)
  for (let i = 0; i < 3; i++) {
    const diff = (pa[i] ?? 0) - (pb[i] ?? 0)
    if (diff !== 0) return diff
  }
  return 0
}

export function buildVersionReport(
  local: VersionInfo,
  remote: VersionInfo | null,
  online: boolean,
): string[] {
  const lines = [
    `本地版本: ${local.version}`,
    `本地构建: ${local.buildTime}`,
    `本地提交: ${local.commit ?? 'unknown'}`,
    `运行环境: ${online ? '在线 Pages' : '本地开发'}`,
    `版本文件: ${VERSION_URL}`,
  ]

  if (!remote) {
    lines.push('远程版本: 获取失败（离线或超时）')
    return lines
  }

  lines.push(
    `远程版本: ${remote.version}`,
    `远程构建: ${remote.buildTime}`,
    `远程提交: ${remote.commit ?? 'unknown'}`,
  )

  const cmp = compareVersions(remote.version, local.version)
  if (cmp > 0) lines.push('状态: 有新版本可更新（请刷新缓存）')
  else if (cmp < 0) lines.push('状态: 本地版本高于远程（开发中）')
  else lines.push('状态: 版本一致')

  return lines
}
