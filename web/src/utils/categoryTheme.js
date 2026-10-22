import { Bug, Droplets, Leaf, Package, ShieldCheck, Sprout } from '@lucide/vue'

/** 分类视觉映射：图标 + 配色 */
export const CATEGORY_META = {
  杀虫剂: { icon: Bug, chip: 'bg-leaf-100 text-leaf-700', image: 'from-leaf-100 to-leaf-200' },
  杀菌剂: { icon: ShieldCheck, chip: 'bg-sky-100 text-sky-700', image: 'from-sky-100 to-sky-200' },
  水溶肥: { icon: Droplets, chip: 'bg-amber-100 text-amber-700', image: 'from-amber-100 to-amber-200' },
  叶面肥: { icon: Leaf, chip: 'bg-emerald-100 text-emerald-700', image: 'from-emerald-100 to-emerald-200' },
  生长调节剂: { icon: Sprout, chip: 'bg-violet-100 text-violet-700', image: 'from-violet-100 to-violet-200' },
  其他: { icon: Package, chip: 'bg-stone-200 text-stone-700', image: 'from-stone-200 to-stone-300' },
}

export function categoryMeta(category) {
  return CATEGORY_META[category] || CATEGORY_META['其他']
}
