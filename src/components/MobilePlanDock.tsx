import { useState } from 'react'
import { CalendarIcon, HeartIcon, PlusIcon } from './Icons'

type MobilePlanDockProps = {
  unscheduledCount: number
  onOpenPlaces: () => void
  onPrimaryAction: () => void
}

// 手机上把两颗常驻大按钮收束成一个轻量入口，展开后再选择具体动作。
export default function MobilePlanDock({ unscheduledCount, onOpenPlaces, onPrimaryAction }: MobilePlanDockProps) {
  const [open, setOpen] = useState(false)

  function openPlaces() {
    setOpen(false)
    onOpenPlaces()
  }

  function addActivity() {
    setOpen(false)
    onPrimaryAction()
  }

  return (
    <nav className="mobile-plan-dock shrink-0" aria-label="行程操作">
      {open && (
        <div id="mobile-plan-actions" className="mobile-plan-dock__menu" role="menu" aria-label="添加内容">
          <button type="button" role="menuitem" onClick={addActivity} className="mobile-plan-dock__menu-item">
            <span className="mobile-plan-dock__menu-icon is-primary"><CalendarIcon size={16} /></span>
            <span><strong>添加安排</strong><small>补充时间、地点与花费</small></span>
          </button>
          <button type="button" role="menuitem" onClick={openPlaces} className="mobile-plan-dock__menu-item">
            <span className="mobile-plan-dock__menu-icon"><HeartIcon size={16} /></span>
            <span><strong>想去{unscheduledCount ? ` · ${unscheduledCount}` : ''}</strong><small>收藏、选点或安排地点</small></span>
          </button>
        </div>
      )}
      <button type="button" onClick={() => setOpen((value) => !value)} className="mobile-plan-dock__trigger" aria-expanded={open} aria-controls="mobile-plan-actions">
        <PlusIcon size={17} className={open ? 'rotate-45 transition-transform' : 'transition-transform'} />
        {open ? '收起' : '添加'}
      </button>
    </nav>
  )
}
