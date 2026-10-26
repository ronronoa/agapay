import { useState } from 'react';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { afterAll, beforeAll, describe, it, expect, vi } from 'vitest';
import { CampaignAreaFields } from './CampaignAreaFields';
import { usePsgcList } from '../../lib/psgc';

vi.mock('../../lib/psgc', () => ({ usePsgcList: vi.fn() }));
const originalScroll = Object.getOwnPropertyDescriptor(HTMLElement.prototype, 'scrollIntoView');
beforeAll(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
  );
  Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', {
    configurable: true,
    value: vi.fn(),
  });
});
afterAll(() => {
  vi.unstubAllGlobals();
  if (originalScroll)
    Object.defineProperty(HTMLElement.prototype, 'scrollIntoView', originalScroll);
  else Reflect.deleteProperty(HTMLElement.prototype, 'scrollIntoView');
});
function show(initial = { province: '', city: '', barangay: '' }, failed = false) {
  vi.mocked(usePsgcList).mockImplementation((path) => ({
    data:
      path === '/provinces'
        ? [{ code: '0102800000', name: 'Ilocos Norte' }]
        : path?.includes('cities-municipalities/1381600000')
          ? [{ code: '1381600001', name: 'Arkong Bato' }]
          : path?.includes('/regions/')
            ? [{ code: '1381600000', name: 'City of Valenzuela' }]
            : path?.includes('/provinces/')
              ? [{ code: '0102801000', name: 'Adams' }]
              : [],
    isFetching: false,
    isError: failed,
    refetch: vi.fn(),
  }));
  function Form() {
    const [area, setArea] = useState(initial);
    return (
      <>
        <CampaignAreaFields area={area} index={0} onChange={setArea} onRemove={vi.fn()} />
        <output>{JSON.stringify(area)}</output>
      </>
    );
  }
  render(<Form />);
}
describe('PSGC campaign areas', () => {
  it('searches each area dropdown and resets descendants when a parent changes', async () => {
    show();
    expect(screen.getByLabelText('Area 1 city')).toBeDisabled();
    fireEvent.click(screen.getByLabelText('Area 1 province'));
    fireEvent.change(screen.getByLabelText('Search Area 1 province'), {
      target: { value: 'Metro' },
    });
    expect(screen.queryByRole('option', { name: 'Ilocos Norte' })).not.toBeInTheDocument();
    await screen.findByRole('option', { name: 'Metro Manila' });
    fireEvent.keyDown(screen.getByLabelText('Search Area 1 province'), { key: 'ArrowDown' });
    fireEvent.keyDown(screen.getByLabelText('Search Area 1 province'), { key: 'Enter' });
    await waitFor(() => expect(screen.getByLabelText('Area 1 province')).toHaveFocus());
    fireEvent.click(screen.getByLabelText('Area 1 city'));
    fireEvent.change(screen.getByLabelText('Search Area 1 city'), {
      target: { value: 'No matching city' },
    });
    expect(await screen.findByText('No areas found.')).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText('Search Area 1 city'), {
      target: { value: 'Valenzuela' },
    });
    fireEvent.click(await screen.findByRole('option', { name: 'City of Valenzuela' }));
    await waitFor(() => expect(screen.getByLabelText('Area 1 city')).toHaveFocus());
    fireEvent.click(screen.getByLabelText('Area 1 barangay'));
    fireEvent.change(screen.getByLabelText('Search Area 1 barangay'), {
      target: { value: 'Arkong' },
    });
    fireEvent.click(await screen.findByRole('option', { name: 'Arkong Bato' }));
    await waitFor(() => expect(screen.getByLabelText('Area 1 barangay')).toHaveFocus());
    expect(screen.getByRole('status')).toHaveTextContent('Arkong Bato');
    expect(usePsgcList).toHaveBeenCalledWith('/regions/1300000000/cities-municipalities');
    fireEvent.click(screen.getByLabelText('Area 1 province'));
    fireEvent.click(await screen.findByRole('option', { name: 'Ilocos Norte' }));
    await waitFor(() => expect(screen.getByLabelText('Area 1 province')).toHaveFocus());
    expect(screen.getByLabelText('Area 1 city')).toHaveTextContent('Choose city');
    expect(screen.getByLabelText('Area 1 barangay')).toHaveTextContent('Choose barangay');
    fireEvent.click(screen.getByLabelText('Area 1 province'));
    fireEvent.click(await screen.findByRole('option', { name: 'Clear province' }));
    expect(screen.getByLabelText('Area 1 province')).toHaveTextContent('Choose province');
    expect(screen.getByLabelText('Area 1 city')).toBeDisabled();
  });
  it('preserves saved names and offers manual entry when lookup fails', () => {
    show({ province: 'Saved Province', city: 'Saved City', barangay: 'Saved Barangay' }, true);
    expect(screen.getByLabelText('Area 1 barangay')).toHaveValue('Saved Barangay');
    fireEvent.click(screen.getByRole('button', { name: 'Use PSGC lists' }));
    expect(screen.getByText(/Address lists are unavailable/)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Enter manually' }));
    expect(screen.getByLabelText('Area 1 province')).toHaveValue('Saved Province');
    fireEvent.change(screen.getByLabelText('Area 1 barangay'), { target: { value: 'Corrected' } });
    expect(screen.getByRole('status')).toHaveTextContent('Corrected');
  });
});
