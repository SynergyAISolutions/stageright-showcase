import { describe, it, expect, vi } from 'vitest';
import { fireEvent, render, screen } from '@testing-library/react';
import { ProviderComparisonTabs } from '@/components/staging/provider-comparison-tabs';
import type { ComparisonResult } from '@/types';

const baseComparison: ComparisonResult = {
  originalUrl: 'signed://original',
  style: 'Modern',
  roomTypes: ['Living Room'],
  activeVariant: 'gemini-full',
  results: {
    'gemini-full': {
      variantId: 'gemini-full',
      provider: 'gemini',
      label: 'Gemini Nano Banana Pro',
      modelId: 'gemini-3-pro-image-preview',
      analysisMode: 'full',
      imageUrl: 'signed://gemini',
      s3Key: 'staged/gemini.png',
      sessionId: 'session-gemini',
    },
    'openai-full-medium': {
      variantId: 'openai-full-medium',
      provider: 'openai',
      label: 'OpenAI GPT Image 2 · Full Medium',
      modelId: 'gpt-image-2',
      analysisMode: 'full',
      quality: 'medium',
      imageUrl: 'signed://openai',
      s3Key: 'staged/openai.png',
      sessionId: 'session-openai',
    },
  },
};

describe('ProviderComparisonTabs', () => {
  it('renders model tabs and calls onProviderChange', () => {
    const onProviderChange = vi.fn();
    render(
      <ProviderComparisonTabs
        comparison={baseComparison}
        onProviderChange={onProviderChange}
      />,
    );

    expect(screen.getByRole('tab', { name: /Gemini Nano Banana Pro/i })).toHaveAttribute('aria-selected', 'true');
    fireEvent.click(screen.getByRole('tab', { name: /OpenAI GPT Image 2 · Full Medium/i }));
    expect(onProviderChange).toHaveBeenCalledWith('openai-full-medium');
  });

  it('shows an error state when a provider failed', () => {
    const comparison: ComparisonResult = {
      ...baseComparison,
      activeVariant: 'openai-full-medium',
      results: {
        ...baseComparison.results,
        'openai-full-medium': {
          ...baseComparison.results['openai-full-medium']!,
          imageUrl: undefined,
          error: 'OPENAI_API_KEY is not set.',
        },
      },
    };

    render(
      <ProviderComparisonTabs
        comparison={comparison}
        onProviderChange={vi.fn()}
      />,
    );

    expect(screen.getByText(/OpenAI GPT Image 2 · Full Medium failed/i)).toBeInTheDocument();
    expect(screen.getByText(/OPENAI_API_KEY is not set/i)).toBeInTheDocument();
  });
});
