import { PageHeader } from '@/components/layout/page-header'
import { PageBody } from '@/components/layout/page-body'
import { Section } from '@/components/layout/section'
import { CardPanel } from '@/components/layout/card-panel'
import { Palette } from 'lucide-react'

export default function TokensPage() {
  const colors = [
    { name: 'Running', hex: '#3F86F3', var: '--status-running' },
    { name: 'Success', hex: '#7cb518', var: '--status-success' },
    { name: 'Warning', hex: '#FCBC04', var: '--status-warning' },
    { name: 'Error', hex: '#EB4233', var: '--status-error' },
  ]

  const spacing = [
    { name: 'xs', value: '0.5rem' },
    { name: 'sm', value: '1rem' },
    { name: 'md', value: '1.5rem' },
    { name: 'lg', value: '2rem' },
    { name: 'xl', value: '2.5rem' },
  ]

  const fontSizes = [
    { name: 'xs-tight', size: '10px' },
    { name: 'xs', size: '12px' },
    { name: 'sm', size: '14px' },
    { name: 'base', size: '16px' },
    { name: 'lg', size: '18px' },
    { name: 'xl', size: '20px' },
    { name: '2xl', size: '24px' },
  ]

  return (
    <main className="ds-page-wrapper">
      <PageHeader
        title="Design Tokens"
        description="Complete design system tokens including colors, spacing, and typography"
        icon={<Palette className="h-6 w-6" />}
      />
      <PageBody>
        <Section
          title="Status Colors"
          description="MLOps semantic colors for consistent status indication"
        >
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 md:grid-cols-4">
            {colors.map((color) => (
              <CardPanel key={color.hex}>
                <div
                  className="mb-3 h-24 rounded-lg"
                  style={{ backgroundColor: color.hex }}
                />
                <h4 className="font-semibold">{color.name}</h4>
                <code className="text-xs">{color.hex}</code>
                <code className="block text-xs">{color.var}</code>
              </CardPanel>
            ))}
          </div>
        </Section>

        <Section
          title="Spacing Scale"
          description="Consistent spacing values for layout and components"
        >
          <div className="space-y-4">
            {spacing.map((item) => (
              <div key={item.name} className="flex items-center gap-4">
                <div className="w-20">
                  <code className="text-sm font-semibold">{item.name}</code>
                </div>
                <div
                  className="bg-primary"
                  style={{ width: item.value, height: '2rem' }}
                />
                <span className="text-sm text-muted-foreground">{item.value}</span>
              </div>
            ))}
          </div>
        </Section>

        <Section
          title="Typography Scale"
          description="Font sizes available as design tokens"
        >
          <div className="space-y-3">
            {fontSizes.map((font) => (
              <div key={font.name} className="flex items-baseline gap-4">
                <div className="w-32">
                  <code className="text-sm">--font-size-{font.name}</code>
                </div>
                <div style={{ fontSize: font.size }} className="flex-1">
                  The quick brown fox jumps over the lazy dog
                </div>
                <span className="w-16 text-right text-sm text-muted-foreground">
                  {font.size}
                </span>
              </div>
            ))}
          </div>
        </Section>

        <Section
          title="Motion Timing"
          description="Consistent transition and animation timing"
        >
          <div className="space-y-4">
            <CardPanel>
              <h4 className="font-semibold">Fast Transition (150ms)</h4>
              <p className="text-sm text-muted-foreground">Used for hover and focus states</p>
            </CardPanel>
            <CardPanel>
              <h4 className="font-semibold">Default Transition (200ms)</h4>
              <p className="text-sm text-muted-foreground">Used for interactive elements</p>
            </CardPanel>
            <CardPanel>
              <h4 className="font-semibold">Respects prefers-reduced-motion</h4>
              <p className="text-sm text-muted-foreground">All animations can be disabled by user preference</p>
            </CardPanel>
          </div>
        </Section>
      </PageBody>
    </main>
  )
}
