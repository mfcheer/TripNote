import { HeartIcon } from './Icons'

// 手机端仅保留想去地点库入口；手动添加安排仍由桌面工作区承担。
export default function MobilePlanDock({ onOpen }: { onOpen: () => void }) {
  return (
    <nav className="mobile-plan-dock shrink-0" aria-label="想去地点">
      <button type="button" onClick={onOpen} className="mobile-plan-dock__trigger">
        <HeartIcon size={17} /> 想去
      </button>
    </nav>
  )
}
