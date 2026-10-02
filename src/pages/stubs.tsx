import { Construction } from 'lucide-react'

function ComingSoon({ title, blurb }: { title: string; blurb: string }) {
  return (
    <div>
      <h1 className="text-2xl font-semibold">{title}</h1>
      <div className="mt-6 flex flex-col items-center justify-center gap-3 rounded-lg border border-dashed border-line bg-surface-2 px-6 py-20 text-center">
        <Construction className="h-8 w-8 text-accent" aria-hidden />
        <p className="text-lg font-medium">Coming soon</p>
        <p className="max-w-md text-sm text-ink-muted">{blurb}</p>
      </div>
    </div>
  )
}

export const MapsPage = () => (
  <ComingSoon title="Maps" blurb="Interactive maps with extracts, quest zones and loot." />
)
export const PlanningPage = () => (
  <ComingSoon title="Planning" blurb="Plan raids by picking a map and seeing every quest you can work on there." />
)
export const ItemCollectionPage = () => (
  <ComingSoon title="Item Collection" blurb="Track the quest and hideout items you still need to find." />
)
export const CraftsPage = () => (
  <ComingSoon title="Crafts" blurb="Hideout crafts with profit calculations from live flea prices." />
)
export const FleaMarketPage = () => (
  <ComingSoon title="Flea Market" blurb="Search items and see current flea market prices and trends." />
)
