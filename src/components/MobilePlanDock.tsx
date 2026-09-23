import { PlusIcon } from './Icons'

// 所有新增动作都进入同一张“添加”抽屉，底部只保留一个轻量入口。
export default function MobilePlanDock({ onOpen }: { onOpen: () => void }) {
  return (
    <nav className="mobile-plan-dock shrink-0" aria-label="添加内容">
      <button type="button" onClick={onOpen} className="mobile-plan-dock__trigger">
        <PlusIcon size={17} /> 添加
      </button>
    </nav>
  )
}
