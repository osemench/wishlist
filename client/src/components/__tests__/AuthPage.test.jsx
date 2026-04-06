import { describe, test, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import AuthPage from '../AuthPage.jsx';

const noop = () => {};

// Find the tab button (not the submit button) by class
const getTab = (name) =>
  screen.getAllByRole('button', { name }).find(b => b.classList.contains('tab-btn'));

// Find the submit button inside the form
const getSubmitBtn = () =>
  screen.getAllByRole('button').find(b => b.type === 'submit');

describe('AuthPage layout', () => {
  test('renders Sign in tab active by default', () => {
    render(<AuthPage onAuth={noop} />);
    expect(getTab(/^sign in$/i)).toHaveClass('active');
    expect(getTab(/create account/i)).not.toHaveClass('active');
  });

  test('does not show Name field on login tab', () => {
    render(<AuthPage onAuth={noop} />);
    expect(screen.queryByLabelText(/^name$/i)).not.toBeInTheDocument();
  });

  test('switches to register tab and shows Name and Confirm fields', () => {
    render(<AuthPage onAuth={noop} />);
    fireEvent.click(getTab(/create account/i));
    expect(screen.getByLabelText(/^name$/i)).toBeInTheDocument();
    expect(screen.getByLabelText(/confirm password/i)).toBeInTheDocument();
  });

  test('shows Microsoft sign-in button when provider is enabled', () => {
    render(<AuthPage onAuth={noop} providers={{ microsoft: true }} />);
    expect(screen.getByRole('link', { name: /sign in with microsoft/i })).toBeInTheDocument();
  });

  test('hides Microsoft sign-in button when provider is absent', () => {
    render(<AuthPage onAuth={noop} providers={{}} />);
    expect(screen.queryByRole('link', { name: /sign in with microsoft/i })).not.toBeInTheDocument();
  });

  test('displays oauthError prop in error banner', () => {
    render(<AuthPage onAuth={noop} oauthError="OAuth failed" onClearOauthError={noop} />);
    expect(screen.getByText('OAuth failed')).toBeInTheDocument();
  });

  test('dismissing oauth error calls onClearOauthError', () => {
    const onClearOauthError = vi.fn();
    render(<AuthPage onAuth={noop} oauthError="OAuth failed" onClearOauthError={onClearOauthError} />);
    const dismissBtn = screen.getAllByRole('button').find(b => b.textContent === '×');
    fireEvent.click(dismissBtn);
    expect(onClearOauthError).toHaveBeenCalled();
  });
});

describe('AuthPage client-side validation', () => {
  let container;

  beforeEach(() => {
    ({ container } = render(<AuthPage onAuth={noop} />));
    fireEvent.click(getTab(/create account/i));
  });

  // Use fireEvent.submit(form) to bypass native HTML5 required-field validation
  const submit = (c) => fireEvent.submit(c.querySelector('form'));

  test('shows error when name is empty on register', async () => {
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: 'password123' } });
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: 'password123' } });
    submit(container);
    expect((await screen.findAllByText(/name is required/i)).length).toBeGreaterThan(0);
  });

  test('shows error when passwords do not match', async () => {
    fireEvent.change(screen.getByLabelText(/^name$/i), { target: { value: 'Alice' } });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: 'password123' } });
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: 'different' } });
    submit(container);
    expect((await screen.findAllByText(/passwords do not match/i)).length).toBeGreaterThan(0);
  });

  test('shows error when password is too short', async () => {
    fireEvent.change(screen.getByLabelText(/^name$/i), { target: { value: 'Alice' } });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: 'abc' } });
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: 'abc' } });
    submit(container);
    expect((await screen.findAllByText(/at least 8 characters/i)).length).toBeGreaterThan(0);
  });
});

describe('AuthPage form submission', () => {
  let mockFetch;

  beforeEach(() => {
    mockFetch = vi.fn();
    vi.stubGlobal('fetch', mockFetch);
  });

  test('calls onAuth with server response on successful login', async () => {
    const onAuth = vi.fn();
    mockFetch.mockResolvedValueOnce({
      json: async () => ({ token: 'abc123', user: { email: 'a@b.com' } }),
    });
    render(<AuthPage onAuth={onAuth} />);
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: 'password123' } });
    fireEvent.click(getSubmitBtn());
    await waitFor(() => expect(onAuth).toHaveBeenCalledWith({ token: 'abc123', user: { email: 'a@b.com' } }));
  });

  test('shows server error message on failed login', async () => {
    mockFetch.mockResolvedValueOnce({
      json: async () => ({ error: 'Invalid credentials' }),
    });
    render(<AuthPage onAuth={noop} />);
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'a@b.com' } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: 'wrongpass' } });
    fireEvent.click(getSubmitBtn());
    expect((await screen.findAllByText(/invalid credentials/i)).length).toBeGreaterThan(0);
  });

  test('posts to /api/auth/register on register tab', async () => {
    const onAuth = vi.fn();
    mockFetch.mockResolvedValueOnce({
      json: async () => ({ token: 'tok', user: { email: 'new@b.com' } }),
    });
    render(<AuthPage onAuth={onAuth} />);
    fireEvent.click(getTab(/create account/i));
    fireEvent.change(screen.getByLabelText(/^name$/i), { target: { value: 'Bob' } });
    fireEvent.change(screen.getByLabelText(/email/i), { target: { value: 'new@b.com' } });
    fireEvent.change(screen.getByLabelText(/^password$/i), { target: { value: 'password123' } });
    fireEvent.change(screen.getByLabelText(/confirm password/i), { target: { value: 'password123' } });
    fireEvent.click(getSubmitBtn());
    await waitFor(() => expect(onAuth).toHaveBeenCalled());
    expect(mockFetch).toHaveBeenCalledWith('/api/auth/register', expect.objectContaining({ method: 'POST' }));
  });
});
