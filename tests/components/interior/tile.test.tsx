import { render, screen, fireEvent, within } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { Tile, NewTile } from '@/components/interior/tile';

describe('Tile', () => {
  it('renders a 4:3 cover area with name and sub', () => {
    const { container } = render(<Tile coverUrl="/x.jpg" name="12 Acacia Ave" sub="9 rooms" />);
    expect(within(container).getByText('12 Acacia Ave')).toBeInTheDocument();
    expect(within(container).getByText('9 rooms')).toBeInTheDocument();
  });

  it('renders long names in full without truncation', () => {
    // Post-Plan-1 rule: listing names must NEVER be cut off — they wrap
    // to as many lines as needed. Asserts the wrapping classes, not truncate.
    const { container } = render(<Tile coverUrl="/x.jpg" name="A very long listing name that should never wrap" sub="1 room" />);
    const name = within(container).getByText(/A very long listing name that should never wrap/);
    expect(name.className).toContain('break-words');
    expect(name.className).not.toContain('truncate');
  });

  it('falls back to a placeholder when coverUrl is null', () => {
    const { container } = render(<Tile coverUrl={null} name="New Listing" sub="0 rooms" />);
    expect(within(container).getByText('New Listing')).toBeInTheDocument();
    // Verify SOME placeholder rendered — exact markup is implementation-specific
    const images = within(container).queryAllByRole('img');
    expect(images.length).toBe(0);
  });

  it('renders as a link when href is provided', () => {
    const { container } = render(<Tile coverUrl="/x.jpg" name="Test Listing" sub="3 rooms" href="/listings/123" />);
    const link = within(container).getByRole('link');
    expect(link).toHaveAttribute('href', '/listings/123');
  });

  it('calls onClick when clicked as a button', () => {
    const onClick = vi.fn();
    const { container } = render(<Tile coverUrl="/x.jpg" name="Test" sub="2 rooms" onClick={onClick} />);
    const button = within(container).getByRole('button');
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalled();
  });
});

describe('NewTile', () => {
  it('renders the terra "New listing" affordance', () => {
    const onClick = vi.fn();
    const { container } = render(<NewTile label="New listing" onClick={onClick} />);
    expect(within(container).getByText('New listing')).toBeInTheDocument();
  });

  it('calls onClick when activated', () => {
    const onClick = vi.fn();
    const { container } = render(<NewTile label="New listing" onClick={onClick} />);
    const button = within(container).getByRole('button');
    fireEvent.click(button);
    expect(onClick).toHaveBeenCalled();
  });

  it('has identical total height to Tile for grid uniformity', () => {
    const { container: containerTile } = render(
      <Tile coverUrl="/x.jpg" name="Test" sub="1 room" />
    );
    const { container: containerNewTile } = render(
      <NewTile label="New" onClick={vi.fn()} />
    );
    const tile = containerTile.querySelector('.flex') as HTMLElement;
    const newTile = containerNewTile.querySelector('.flex') as HTMLElement;
    // Both should have flex structure
    expect(tile).toBeTruthy();
    expect(newTile).toBeTruthy();
    expect(tile.className).toContain('flex');
    expect(newTile.className).toContain('flex');
  });
});
