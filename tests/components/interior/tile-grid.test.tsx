import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { TileGrid } from '@/components/interior/tile-grid';

describe('TileGrid', () => {
  it('renders children inside a grid container', () => {
    render(
      <TileGrid>
        <div data-testid="child">child</div>
      </TileGrid>
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
  });

  it('has a configurable grid using minmax(0,1fr) to prevent column drift', () => {
    const { container } = render(<TileGrid><div /></TileGrid>);
    const grid = container.firstElementChild as HTMLElement;
    expect(grid.className).toContain('grid');
    expect(grid.className).toContain('grid-cols-2');
  });
});
