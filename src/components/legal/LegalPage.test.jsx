import { describe, it, expect, vi } from 'vitest';
import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import LegalPage from './LegalPage';

const SECTIONS = [
  { heading: 'One', paragraphs: ['First para.', 'Second para.'] },
  { heading: 'Two', items: [{ term: 'Term:', text: 'its explanation.' }] },
];

describe('LegalPage', () => {
  it('renders the title as the page h1, not merely as bold text', () => {
    // A legal document is a page in its own right; its title is the document
    // heading a screen-reader user navigates to first.
    render(<LegalPage title="Some Policy" updated="Last Updated: X" sections={SECTIONS} />);
    expect(screen.getByRole('heading', { level: 1, name: 'Some Policy' })).toBeInTheDocument();
  });

  it('renders the updated stamp and the intro', () => {
    render(
      <LegalPage title="T" updated="Last Updated: September 2026" intro="Hello." sections={[]} />
    );
    expect(screen.getByText('Last Updated: September 2026')).toBeInTheDocument();
    expect(screen.getByText('Hello.')).toBeInTheDocument();
  });

  it('omits the intro block entirely when there is none', () => {
    const { container } = render(<LegalPage title="T" updated="U" sections={[]} />);
    // One <p> would still be the Meta stamp; the intro is the only Body here.
    expect(container.querySelectorAll('p')).toHaveLength(0);
  });

  it('gives every section an h2 beneath the title', () => {
    render(<LegalPage title="T" updated="U" sections={SECTIONS} />);
    const headings = screen.getAllByRole('heading', { level: 2 });
    expect(headings.map((h) => h.textContent)).toEqual(['One', 'Two']);
  });

  it('renders each paragraph of a section', () => {
    render(<LegalPage title="T" updated="U" sections={SECTIONS} />);
    expect(screen.getByText('First para.')).toBeInTheDocument();
    expect(screen.getByText('Second para.')).toBeInTheDocument();
  });

  it('renders enumerations as a real list, so a reader hears "list, N items"', () => {
    render(<LegalPage title="T" updated="U" sections={SECTIONS} />);
    const list = screen.getByRole('list');
    const items = within(list).getAllByRole('listitem');
    expect(items).toHaveLength(1);
    expect(items[0]).toHaveTextContent('Term: its explanation.');
    // The term is the emphasised lead-in, not a separate paragraph.
    expect(within(items[0]).getByText('Term:').tagName).toBe('STRONG');
  });

  it('renders no list for a section that has only paragraphs', () => {
    render(<LegalPage title="T" updated="U" sections={[SECTIONS[0]]} />);
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('tolerates a section with an empty items array', () => {
    render(<LegalPage title="T" updated="U" sections={[{ heading: 'Empty', items: [] }]} />);
    expect(screen.getByRole('heading', { level: 2, name: 'Empty' })).toBeInTheDocument();
    expect(screen.queryByRole('list')).not.toBeInTheDocument();
  });

  it('renders a term-less item and paragraphs after the list', () => {
    render(
      <LegalPage
        title="T"
        updated="U"
        sections={[{ heading: 'H', items: [{ text: 'plain item' }], after: ['closing words'] }]}
      />
    );
    const item = screen.getByText('plain item');
    expect(item.tagName).toBe('LI');
    expect(item.querySelector('strong')).toBeNull();
    expect(
      item.compareDocumentPosition(screen.getByText('closing words')) &
        Node.DOCUMENT_POSITION_FOLLOWING
    ).toBeTruthy();
  });

  it('calls onBack from a labelled control', async () => {
    const onBack = vi.fn();
    render(<LegalPage title="T" updated="U" sections={[]} onBack={onBack} />);
    await userEvent.click(screen.getByRole('button', { name: 'Back to the app' }));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('does not throw when clicked with no onBack supplied', async () => {
    render(<LegalPage title="T" updated="U" sections={[]} />);
    await userEvent.click(screen.getByRole('button', { name: 'Back to the app' }));
    expect(screen.getByRole('heading', { level: 1, name: 'T' })).toBeInTheDocument();
  });
});
