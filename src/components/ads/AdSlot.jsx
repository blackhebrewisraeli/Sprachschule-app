import { COLORS, RADIUS, SPACE } from '../../lib/theme';
import { Meta } from '../ui/Text';
import { adsAllowed } from '../../lib/ads.js';

// Adaptive banners on phones run about 50–62px tall. Track C sets the exact
// height from the plugin's SizeChanged event.
export const AD_SLOT_HEIGHT = 62;

// A reserved place for a banner (spec §8.2): the space exists before the ad,
// so nothing reflows when one loads and nothing ever covers the nav. Only on
// screens with no exercise on them (spec §8.3), and nothing at all unless ads
// are allowed for this learner.
export default function AdSlot({ placement, tier }) {
  if (!adsAllowed({ tier })) return null;
  return (
    <aside
      aria-label="Advertisement"
      data-ad-slot={placement}
      style={{
        minHeight: AD_SLOT_HEIGHT,
        marginTop: SPACE[4],
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        border: `1px dashed ${COLORS.border}`,
        borderRadius: RADIUS.md,
        boxSizing: 'border-box',
      }}
    >
      <Meta>Ad</Meta>
    </aside>
  );
}
