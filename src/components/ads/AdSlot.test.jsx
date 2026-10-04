import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const allowed = vi.hoisted(() => ({ value: false }));
vi.mock('../../lib/ads.js', () => ({ adsAllowed: () => allowed.value }));

import AdSlot, { AD_SLOT_HEIGHT } from './AdSlot';

describe('AdSlot', () => {
  beforeEach(() => {
    allowed.value = false;
  });

  it('renders nothing unless ads are allowed for this learner', () => {
    const { container } = render(<AdSlot placement="home" tier="free" />);
    expect(container).toBeEmptyDOMElement();
  });

  // The space exists before the ad, so nothing reflows when a banner loads.
  it('reserves a fixed-height, labelled place for a banner', () => {
    allowed.value = true;
    render(<AdSlot placement="profile" tier="free" />);
    const slot = screen.getByRole('complementary', { name: 'Advertisement' });
    expect(slot).toHaveAttribute('data-ad-slot', 'profile');
    expect(slot).toHaveStyle({ minHeight: `${AD_SLOT_HEIGHT}px` });
  });
});
