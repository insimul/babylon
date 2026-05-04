/**
 * LoadingScreen — React overlay that replaces the old single-line
 * "Loading world..." screen with phased feedback required by US-010:
 *   - current phase label + per-phase progress
 *   - overall progress bar
 *   - estimated time remaining
 *   - rotating tips to keep players engaged
 *   - timeout warning with options (wait / lower quality / cancel)
 */
import React, { useEffect, useMemo, useState } from 'react';
import type { StartupProfilerState } from './StartupProfiler';
import { LOADING_TIPS, pickTip } from './loadingTips';

export interface LoadingScreenProps {
  state: StartupProfilerState;
  title?: string;
  subtitle?: string;
  tips?: string[];
  /** ms before the timeout warning appears. Default: 60_000. */
  timeoutMs?: number;
  onContinueWaiting?: () => void;
  onLowerQuality?: () => void;
  onCancel?: () => void;
}

function formatDuration(ms: number): string {
  if (!isFinite(ms) || ms < 0) return '—';
  const totalSec = Math.round(ms / 1000);
  if (totalSec < 60) return `${totalSec}s`;
  const m = Math.floor(totalSec / 60);
  const s = totalSec % 60;
  return `${m}m ${s.toString().padStart(2, '0')}s`;
}

export function LoadingScreen({
  state,
  title = 'Loading world...',
  subtitle,
  tips = LOADING_TIPS,
  timeoutMs = 60_000,
  onContinueWaiting,
  onLowerQuality,
  onCancel,
}: LoadingScreenProps) {
  const [tipIndex, setTipIndex] = useState(0);
  const [timedOut, setTimedOut] = useState(false);
  const [dismissedTimeout, setDismissedTimeout] = useState(false);

  useEffect(() => {
    if (tips.length <= 1) return;
    const h = setInterval(() => setTipIndex((i) => i + 1), 6500);
    return () => clearInterval(h);
  }, [tips.length]);

  useEffect(() => {
    if (state.completedAt != null) return;
    if (state.elapsedMs >= timeoutMs) {
      setTimedOut(true);
      return;
    }
    const remaining = timeoutMs - state.elapsedMs;
    const h = setTimeout(() => setTimedOut(true), remaining);
    return () => clearTimeout(h);
  }, [state.elapsedMs, state.completedAt, timeoutMs]);

  const overallPct = Math.round(state.overallProgress * 100);
  const currentPhase =
    state.phases.find((p) => p.id === state.currentPhaseId) ??
    state.phases.find((p) => p.status === 'running') ??
    state.phases.find((p) => p.status !== 'complete' && p.status !== 'skipped');

  const tip = useMemo(() => pickTip(tips, tipIndex), [tips, tipIndex]);

  const showTimeout = timedOut && !dismissedTimeout && state.completedAt == null;

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="loading-screen"
      style={{
        position: 'absolute',
        inset: 0,
        background: '#f5f0e8',
        color: '#6b5d4d',
        zIndex: 10,
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 24,
        fontFamily: 'system-ui, sans-serif',
      }}
    >
      <div style={{ fontSize: 22, fontWeight: 500, marginBottom: 4 }}>{title}</div>
      {subtitle && (
        <div style={{ fontSize: 13, color: '#9a8b78', marginBottom: 20 }}>
          {subtitle}
        </div>
      )}

      <div
        style={{
          width: 320,
          height: 8,
          background: 'rgba(0,0,0,0.08)',
          borderRadius: 4,
          overflow: 'hidden',
          marginBottom: 8,
        }}
      >
        <div
          data-testid="overall-progress-bar"
          style={{
            width: `${overallPct}%`,
            height: '100%',
            background: '#7a5c3a',
            transition: 'width 0.25s ease',
          }}
        />
      </div>
      <div style={{ fontSize: 12, color: '#9a8b78', marginBottom: 16 }}>
        {overallPct}%
        {state.estimatedRemainingMs != null && state.completedAt == null && (
          <> · about {formatDuration(state.estimatedRemainingMs)} remaining</>
        )}
      </div>

      {currentPhase && (
        <div style={{ width: 320, marginBottom: 12 }}>
          <div style={{ fontSize: 13, marginBottom: 4 }}>{currentPhase.label}</div>
          <div
            style={{
              height: 4,
              background: 'rgba(0,0,0,0.06)',
              borderRadius: 2,
              overflow: 'hidden',
            }}
          >
            <div
              data-testid="phase-progress-bar"
              style={{
                width: `${Math.round(currentPhase.progress * 100)}%`,
                height: '100%',
                background: '#b08d5e',
                transition: 'width 0.2s ease',
              }}
            />
          </div>
        </div>
      )}

      <ul
        data-testid="phase-list"
        style={{
          listStyle: 'none',
          padding: 0,
          margin: '8px 0 20px 0',
          width: 320,
          fontSize: 12,
          color: '#9a8b78',
        }}
      >
        {state.phases.map((p) => (
          <li
            key={p.id}
            style={{
              display: 'flex',
              justifyContent: 'space-between',
              padding: '2px 0',
              opacity:
                p.status === 'pending' ? 0.5 : p.status === 'error' ? 1 : 0.9,
              color: p.status === 'error' ? '#a84232' : undefined,
            }}
          >
            <span>
              {p.status === 'complete'
                ? '✓'
                : p.status === 'running'
                  ? '…'
                  : p.status === 'error'
                    ? '×'
                    : p.status === 'skipped'
                      ? '·'
                      : ' '}{' '}
              {p.label}
            </span>
            <span>
              {p.status === 'running'
                ? `${Math.round(p.progress * 100)}%`
                : p.status === 'complete'
                  ? `${Math.round((p.durationMs ?? 0) / 100) / 10}s`
                  : ''}
            </span>
          </li>
        ))}
      </ul>

      {tip && (
        <div
          data-testid="loading-tip"
          style={{
            maxWidth: 360,
            textAlign: 'center',
            fontStyle: 'italic',
            color: '#b8a898',
            fontSize: 12,
            marginBottom: 12,
          }}
        >
          {tip}
        </div>
      )}

      {showTimeout && (
        <div
          data-testid="loading-timeout"
          style={{
            marginTop: 8,
            padding: '12px 16px',
            background: 'rgba(168, 66, 50, 0.08)',
            border: '1px solid rgba(168, 66, 50, 0.3)',
            borderRadius: 6,
            maxWidth: 360,
            textAlign: 'center',
          }}
        >
          <div style={{ fontSize: 13, color: '#a84232', marginBottom: 8 }}>
            Loading is taking longer than expected.
          </div>
          <div style={{ display: 'flex', gap: 8, justifyContent: 'center', flexWrap: 'wrap' }}>
            <button
              onClick={() => {
                setDismissedTimeout(true);
                onContinueWaiting?.();
              }}
              style={timeoutButtonStyle()}
            >
              Keep waiting
            </button>
            {onLowerQuality && (
              <button onClick={onLowerQuality} style={timeoutButtonStyle()}>
                Try lower quality
              </button>
            )}
            {onCancel && (
              <button onClick={onCancel} style={timeoutButtonStyle('danger')}>
                Cancel
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function timeoutButtonStyle(variant?: 'danger'): React.CSSProperties {
  const base: React.CSSProperties = {
    padding: '6px 12px',
    borderRadius: 4,
    border: 'none',
    cursor: 'pointer',
    fontSize: 12,
    background: '#7a5c3a',
    color: '#fff',
  };
  if (variant === 'danger') {
    return { ...base, background: '#a84232' };
  }
  return base;
}
