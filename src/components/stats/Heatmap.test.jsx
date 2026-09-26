import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { SPACE } from '../../lib/theme';
import Heatmap, { HeatmapLegend } from './Heatmap';

// Mirrors Heatmap's cell bounds: floor, ceiling and gutter per layout.
const CELL = {
  regular: { min: 8, max: 20, gap: 2 },
  mobile: { min: 7, max: 14, gap: 1 },
};

const day = (date, total, intensity) => ({ date, total, intensity });

describe('Heatmap', () => {
  it('renders one titled cell per day with pluralized tooltips', () => {
    const data = [day('2026-06-01', 1, 1), day('2026-06-02', 5, 2), day('2026-06-03', 0, 0)];
    const { container } = render(<Heatmap data={data} mobile={false} />);
    expect(container.querySelector('[title="2026-06-01 · 1 exercise"]')).not.toBeNull();
    expect(container.querySelector('[title="2026-06-02 · 5 exercises"]')).not.toBeNull();
    expect(container.querySelector('[title="2026-06-03 · 0 exercises"]')).not.toBeNull();
  });

  it('pads the trailing week so the grid stays rectangular', () => {
    // 8 days span 2 weeks → grid should hold 14 cells (8 days + 6 pads)
    const data = Array.from({ length: 8 }, (_, i) => day(`2026-06-0${i + 1}`, i, Math.min(i, 4)));
    render(<Heatmap data={data} mobile />);
    expect(screen.getByTestId('activity-heatmap').children).toHaveLength(14);
  });

  it('adds no padding when the data is a whole number of weeks', () => {
    const data = Array.from({ length: 7 }, (_, i) => day(`2026-06-0${i + 1}`, 1, 1));
    render(<Heatmap data={data} mobile={false} />);
    expect(screen.getByTestId('activity-heatmap').children).toHaveLength(7);
  });

  it.each([
    [false, CELL.regular],
    [true, CELL.mobile],
  ])('sizes cells to the card within bounds when mobile is %s', (mobile, cell) => {
    // 53 weeks of data → 53 columns that grow with the card up to `max`.
    const data = Array.from({ length: 365 }, (_, i) => day(`d${i}`, 0, 0));
    render(<Heatmap data={data} mobile={mobile} />);
    expect(screen.getByTestId('activity-heatmap')).toHaveStyle({
      gridTemplateColumns: `repeat(53, minmax(${cell.min}px, ${cell.max}px))`,
      gridTemplateRows: 'repeat(7, auto)',
      gap: `${cell.gap}px`,
    });
  });

  it('centres the year in a wide card instead of hugging the left edge', () => {
    // At a fixed 8px the grid was 477px wide, so a desktop card drew the year
    // in its left third and left the rest of the card blank.
    render(<Heatmap data={[day('2026-06-01', 1, 1)]} mobile={false} />);
    expect(screen.getByTestId('activity-heatmap')).toHaveStyle({
      justifyContent: 'center',
      width: '100%',
      minWidth: 'min-content',
    });
  });

  it('scrolls in its own box, never the grid itself', () => {
    // Centring a box that also scrolls pushes overflow off BOTH edges and the
    // oldest weeks become unreachable. The scroller is a separate parent.
    render(<Heatmap data={[day('2026-06-01', 1, 1)]} mobile />);
    const scroller = screen.getByTestId('activity-heatmap-scroll');
    expect(scroller).toContainElement(screen.getByTestId('activity-heatmap'));
    expect(scroller).toHaveStyle({ overflowX: 'auto', paddingBottom: `${SPACE[1]}px` });
    expect(screen.getByTestId('activity-heatmap').style.overflowX).toBe('');
  });

  it('draws every cell square at the column width', () => {
    render(<Heatmap data={[day('2026-06-01', 1, 1)]} mobile={false} />);
    const [cell] = screen.getByTestId('activity-heatmap').children;
    expect(cell).toHaveStyle({ width: '100%', boxSizing: 'border-box' });
    expect(cell.style.aspectRatio).toBe('1 / 1');
  });
});

describe('HeatmapLegend', () => {
  it('renders the LESS → MORE scale with all five intensity swatches', () => {
    const { container, getByText } = render(<HeatmapLegend />);
    expect(getByText('LESS')).toBeInTheDocument();
    expect(getByText('MORE')).toBeInTheDocument();
    // 5 swatches + 2 text spans
    expect(container.querySelectorAll('span')).toHaveLength(7);
  });
});
