import type { ImgHTMLAttributes, ReactElement, SVGProps } from 'react'
import type { ActivityCategory } from '../types'

type IconProps = SVGProps<SVGSVGElement> & { size?: number }
type BrandIconProps = Omit<ImgHTMLAttributes<HTMLImageElement>, 'width' | 'height'> & { size?: number }

const base = (size: number): SVGProps<SVGSVGElement> => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
})

// 北向品牌图标：仰望前方的北极熊与珊瑚色旅行路线。
export const LogoIcon = ({ size = 22, alt = '', ...p }: BrandIconProps) => (
  <img
    src={`${import.meta.env.BASE_URL}northward-icon-128.png`}
    width={size}
    height={size}
    alt={alt}
    {...p}
  />
)

export const TrainIcon = ({ size = 16, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <rect x="5" y="3" width="14" height="14" rx="3" />
    <path d="M5 11h14M9 21l1.5-4M15 21l-1.5-4" />
    <circle cx="9" cy="14" r="0.5" fill="currentColor" />
    <circle cx="15" cy="14" r="0.5" fill="currentColor" />
  </svg>
)

export const LandmarkIcon = ({ size = 16, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <path d="M4 21h16M5 21V10M19 21V10M8 21v-8M12 21v-8M16 21v-8" />
    <path d="M3 10l9-6 9 6" />
  </svg>
)

export const FoodIcon = ({ size = 16, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <path d="M6 3v8a2 2 0 0 0 4 0V3M8 13v8" />
    <path d="M17 3c-1.5 1-2.5 3-2.5 5.5S16 12 17 12s2.5-1 2.5-3.5S18.5 4 17 3zM17 12v9" />
  </svg>
)

export const BedIcon = ({ size = 16, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <path d="M3 7v13M3 16h18v4M3 12h18" />
    <path d="M6 12V9a2 2 0 0 1 2-2h11a2 2 0 0 1 2 2v3" />
  </svg>
)

export const ShopIcon = ({ size = 16, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <path d="M5 8h14l-1 12a1 1 0 0 1-1 1H7a1 1 0 0 1-1-1L5 8z" />
    <path d="M9 8V6a3 3 0 0 1 6 0v2" />
  </svg>
)

export const CalendarIcon = ({ size = 17, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <rect x="3" y="5" width="18" height="16" rx="2" />
    <path d="M3 10h18M8 3v4M16 3v4" />
  </svg>
)

export const OverviewIcon = ({ size = 17, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <rect x="3" y="3" width="7" height="7" rx="2" />
    <rect x="14" y="3" width="7" height="7" rx="2" />
    <rect x="3" y="14" width="7" height="7" rx="2" />
    <rect x="14" y="14" width="7" height="7" rx="2" />
  </svg>
)

export const HeartIcon = ({ size = 17, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <path d="M20.8 5.8a5.1 5.1 0 0 0-7.2 0L12 7.4l-1.6-1.6a5.1 5.1 0 0 0-7.2 7.2L12 21l8.8-8a5.1 5.1 0 0 0 0-7.2z" />
  </svg>
)

export const DownloadIcon = ({ size = 16, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <path d="M12 3v12M7 10l5 5 5-5M4 21h16" />
  </svg>
)

export const CheckCircleIcon = ({ size = 16, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="m8 12 2.6 2.6L16.5 9" />
  </svg>
)

export const AlertCircleIcon = ({ size = 16, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v6M12 17h.01" />
  </svg>
)

export const ChevronRightIcon = ({ size = 14, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <path d="m9 18 6-6-6-6" />
  </svg>
)

export const MapIcon = ({ size = 17, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <path d="M9 4L3 6v14l6-2 6 2 6-2V4l-6 2-6-2z" />
    <path d="M9 4v14M15 6v14" />
  </svg>
)

export const WalletIcon = ({ size = 17, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <rect x="3" y="6" width="18" height="14" rx="2.5" />
    <path d="M3 10h18M16 15h2" />
  </svg>
)

export const SettingsIcon = ({ size = 17, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09a1.7 1.7 0 0 0-1-1.55 1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.7 1.7 0 0 0 .34-1.87 1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09a1.7 1.7 0 0 0 1.55-1 1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.7 1.7 0 0 0 1.87.34h0a1.7 1.7 0 0 0 1-1.55V3a2 2 0 1 1 4 0v.09a1.7 1.7 0 0 0 1 1.55h0a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.7 1.7 0 0 0-.34 1.87v0a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.55 1z" />
  </svg>
)

export const PlusIcon = ({ size = 15, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <path d="M12 5v14M5 12h14" />
  </svg>
)

export const TrashIcon = ({ size = 15, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <path d="M4 7h16M10 11v6M14 11v6" />
    <path d="M6 7l1 13a1 1 0 0 0 1 1h8a1 1 0 0 0 1-1l1-13M9 7V4a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v3" />
  </svg>
)

export const EditIcon = ({ size = 13, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <path d="M11 5H6a2 2 0 0 0-2 2v11a2 2 0 0 0 2 2h11a2 2 0 0 0 2-2v-5" />
    <path d="M18.5 2.5a2.1 2.1 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
  </svg>
)

export const ChevronDownIcon = ({ size = 14, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <path d="M6 9l6 6 6-6" />
  </svg>
)

export const ClockIcon = ({ size = 13, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </svg>
)

export const PinIcon = ({ size = 13, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <path d="M12 21s-7-5.5-7-11a7 7 0 0 1 14 0c0 5.5-7 11-7 11z" />
    <circle cx="12" cy="10" r="2" />
  </svg>
)

export const NoteIcon = ({ size = 13, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <path d="M4 5a2 2 0 0 1 2-2h12a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V5zM8 8h8M8 12h8M8 16h5" />
  </svg>
)

export const CoinIcon = ({ size = 13, ...p }: IconProps) => (
  <svg {...base(size)} {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M14.5 9.5a3 3 0 1 0 0 5M12 6.5v11" />
  </svg>
)

export const CATEGORY_ICONS: Record<ActivityCategory, (p: IconProps) => ReactElement> = {
  traffic: TrainIcon,
  sight: LandmarkIcon,
  food: FoodIcon,
  stay: BedIcon,
  shop: ShopIcon,
}
