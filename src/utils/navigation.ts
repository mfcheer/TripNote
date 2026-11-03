export interface NavigationTarget {
  title: string
  location?: string
  lat: number
  lng: number
}

export interface NavigationService {
  id: 'amap' | 'apple' | 'google' | 'baidu' | 'geo'
  name: string
  subtitle: string
  iconColor: string
  getHref: (target: NavigationTarget) => string
  getAppScheme?: (target: NavigationTarget) => string
}

export const NAVIGATION_SERVICES: NavigationService[] = [
  {
    id: 'amap',
    name: '高德地图',
    subtitle: '国内推荐 · 导航与打车',
    iconColor: '#0091ff',
    getHref: ({ title, lat, lng }) =>
      `https://uri.amap.com/marker?position=${lng},${lat}&name=${encodeURIComponent(title)}`,
    getAppScheme: ({ title, lat, lng }) =>
      `amapuri://route/plan/?dlat=${lat}&dlon=${lng}&dname=${encodeURIComponent(title)}&dev=0&t=0`,
  },
  {
    id: 'apple',
    name: 'Apple 地图',
    subtitle: 'iPhone / Mac 原生打开',
    iconColor: '#5856d6',
    getHref: ({ title, lat, lng }) =>
      `https://maps.apple.com/?daddr=${lat},${lng}&dirflg=d&q=${encodeURIComponent(title)}`,
  },
  {
    id: 'google',
    name: 'Google 地图',
    subtitle: '海外旅行首选 · 全球街景',
    iconColor: '#34a853',
    getHref: ({ lat, lng }) =>
      `https://www.google.com/maps/dir/?api=1&destination=${lat},${lng}`,
  },
  {
    id: 'baidu',
    name: '百度地图',
    subtitle: '网页 / 客户端导航',
    iconColor: '#ea4335',
    getHref: ({ title, location, lat, lng }) =>
      `https://api.map.baidu.com/marker?location=${lat},${lng}&title=${encodeURIComponent(title)}&content=${encodeURIComponent(location || title)}&output=html`,
    getAppScheme: ({ title, lat, lng }) =>
      `baidumap://map/direction?destination=name:${encodeURIComponent(title)}|latlng:${lat},${lng}&mode=driving`,
  },
  {
    id: 'geo',
    name: '系统默认地图',
    subtitle: '调用已安装地图应用',
    iconColor: '#637f89',
    getHref: ({ title, lat, lng }) =>
      `geo:${lat},${lng}?q=${lat},${lng}(${encodeURIComponent(title)})`,
  },
]

export function openExternalNavigation(target: NavigationTarget, serviceId: NavigationService['id']) {
  const service = NAVIGATION_SERVICES.find((s) => s.id === serviceId)
  if (!service) return

  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent)
  const scheme = isMobile && service.getAppScheme ? service.getAppScheme(target) : null

  if (scheme) {
    // 优先尝试唤起 App，延迟回退网页
    const startTime = Date.now()
    window.location.href = scheme
    setTimeout(() => {
      if (Date.now() - startTime < 1500) {
        window.open(service.getHref(target), '_blank', 'noopener,noreferrer')
      }
    }, 800)
    return
  }

  window.open(service.getHref(target), '_blank', 'noopener,noreferrer')
}

export function copyCoordinatesToClipboard(target: NavigationTarget): Promise<boolean> {
  const text = `${target.lat.toFixed(5)}, ${target.lng.toFixed(5)}`
  return navigator.clipboard.writeText(text).then(
    () => true,
    () => false,
  )
}
