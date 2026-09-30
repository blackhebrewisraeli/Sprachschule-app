import { COLORS, SPACE } from '../../lib/theme';
import { PageFrame, Stack } from '../ui/Layout';
import Heading from '../ui/Heading';
import { Body, Meta } from '../ui/Text';
import Button from '../ui/Button';

/**
 * The shared shell for the two compliance pages.
 *
 * They are full-page routes rather than a tab or a sheet because a legal
 * document has to survive being linked to from outside the app — a support
 * reply, an app-store listing, a regulator's email. That also means they must
 * render for a SIGNED-OUT visitor: gating them behind the entry flow would
 * make them unreachable to exactly the person deciding whether to sign up.
 *
 * `sections` is a list of { heading, paragraphs, items, after } rather than
 * markup so the two documents stay plain text and cannot drift into layout
 * decisions.
 */
export default function LegalPage({ title, updated, intro, sections, onBack }) {
  return (
    <PageFrame as="main" maxWidth={720}>
      <Stack gap={6}>
        <Stack gap={3}>
          <Button onClick={onBack} aria-label="Back to the app">
            ← Back
          </Button>
          <Heading level={1} size="xl">
            {title}
          </Heading>
          <Meta>{updated}</Meta>
        </Stack>

        {intro && <Body>{intro}</Body>}

        {sections.map((section) => (
          <Stack key={section.heading} gap={3} as="section">
            <Heading level={2} size="md">
              {section.heading}
            </Heading>
            {(section.paragraphs ?? []).map((text) => (
              <Body key={text}>{text}</Body>
            ))}
            {section.items?.length > 0 && (
              // A real <ul>: these are enumerations in the source text, and a
              // screen reader should hear "list, 3 items" rather than three
              // loose paragraphs.
              <Stack as="ul" gap={2} style={{ margin: 0, paddingLeft: SPACE[5] }}>
                {section.items.map((item) => (
                  <Body as="li" key={item.term ?? item.text} style={{ color: COLORS.ink }}>
                    {item.term && <strong>{item.term}</strong>} {item.text}
                  </Body>
                ))}
              </Stack>
            )}
            {(section.after ?? []).map((text) => (
              <Body key={text}>{text}</Body>
            ))}
          </Stack>
        ))}
      </Stack>
    </PageFrame>
  );
}
