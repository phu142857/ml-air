import { PageHeader } from '@/components/layout/page-header'
import { PageBody } from '@/components/layout/page-body'
import { Section } from '@/components/layout/section'
import { CardPanel } from '@/components/layout/card-panel'
import { Layout } from 'lucide-react'
import { Button } from '@/components/ui/button'

export default function PageStructurePage() {
  return (
    <main className="ds-page-wrapper">
      <PageHeader
        title="Page Structure"
        description="Semantic layout components for consistent page patterns"
        icon={<Layout className="h-6 w-6" />}
        actions={
          <Button variant="outline" size="sm">
            Edit
          </Button>
        }
      />
      <PageBody>
        <Section
          title="Page Layout Components"
          description="Use these components to maintain consistent page structure"
        >
          <div className="space-y-6">
            <CardPanel>
              <h4 className="mb-2 font-semibold">PageHeader Component</h4>
              <code className="text-xs">
                &lt;PageHeader title=&quot;Title&quot; description=&quot;Description&quot; /&gt;
              </code>
              <p className="mt-3 text-sm text-muted-foreground">
                Use for page titles with optional icon and actions. Provides consistent header styling
                with proper spacing and typography.
              </p>
            </CardPanel>

            <CardPanel>
              <h4 className="mb-2 font-semibold">PageBody Component</h4>
              <code className="text-xs">
                &lt;PageBody&gt;Content&lt;/PageBody&gt;
              </code>
              <p className="mt-3 text-sm text-muted-foreground">
                Wraps page content with max-width constraint and consistent padding. Handles scrollable
                overflow automatically.
              </p>
            </CardPanel>

            <CardPanel>
              <h4 className="mb-2 font-semibold">Section Component</h4>
              <code className="text-xs">
                &lt;Section title=&quot;Title&quot;&gt;Content&lt;/Section&gt;
              </code>
              <p className="mt-3 text-sm text-muted-foreground">
                Groups related content with heading and description. Maintains consistent spacing
                between sections.
              </p>
            </CardPanel>

            <CardPanel>
              <h4 className="mb-2 font-semibold">CardPanel Component</h4>
              <code className="text-xs">
                &lt;CardPanel&gt;Content&lt;/CardPanel&gt;
              </code>
              <p className="mt-3 text-sm text-muted-foreground">
                Reusable container with border, background, and shadow. Two sizes available: default
                and small.
              </p>
            </CardPanel>
          </div>
        </Section>

        <Section
          title="Spacing Guidelines"
          description="Consistent spacing between sections and components"
        >
          <div className="space-y-4">
            <CardPanel>
              <h4 className="mb-2 font-semibold">Section Spacing</h4>
              <ul className="list-inside list-disc space-y-2 text-sm text-muted-foreground">
                <li>Between sections: 2rem (mb-8)</li>
                <li>Between items in section: 1rem (space-y-4)</li>
                <li>Within cards: 1.5rem (p-6) or 1rem (p-4)</li>
              </ul>
            </CardPanel>

            <CardPanel>
              <h4 className="mb-2 font-semibold">Page Padding</h4>
              <ul className="list-inside list-disc space-y-2 text-sm text-muted-foreground">
                <li>Horizontal: 1.5rem (px-6)</li>
                <li>Vertical: 2rem (py-8)</li>
                <li>Max width: 80rem (max-w-7xl)</li>
              </ul>
            </CardPanel>
          </div>
        </Section>

        <Section
          title="Accessibility in Page Structure"
          description="Best practices for semantic and accessible layouts"
        >
          <div className="space-y-4">
            <CardPanel>
              <h4 className="mb-2 font-semibold">Heading Hierarchy</h4>
              <p className="text-sm text-muted-foreground">
                Always maintain proper heading hierarchy (h1 → h2 → h3). Use semantic tags
                for structure, not for styling.
              </p>
            </CardPanel>

            <CardPanel>
              <h4 className="mb-2 font-semibold">Focus Management</h4>
              <p className="text-sm text-muted-foreground">
                Interactive elements receive focus-visible ring styling. Keyboard navigation should
                flow logically through the page.
              </p>
            </CardPanel>

            <CardPanel>
              <h4 className="mb-2 font-semibold">Content Grouping</h4>
              <p className="text-sm text-muted-foreground">
                Use Section component to group related content. Provides both visual and semantic
                structure for screen readers.
              </p>
            </CardPanel>
          </div>
        </Section>

        <Section
          title="Example Page Structure"
          description="Recommended layout pattern for all pages"
        >
          <CardPanel className="bg-muted/50">
            <code className="block text-xs leading-relaxed">
              {`<main className="ds-page-wrapper">
  <PageHeader 
    title="Page Title"
    description="Optional description"
    actions={<Button>Action</Button>}
  />
  <PageBody>
    <Section title="First Section">
      <CardPanel>Content</CardPanel>
    </Section>
    
    <Section title="Second Section">
      <CardPanel>More content</CardPanel>
    </Section>
  </PageBody>
</main>`}
            </code>
          </CardPanel>
        </Section>
      </PageBody>
    </main>
  )
}
