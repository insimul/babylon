/**
 * SaveMigrationPromptModal (US-013)
 *
 * Surfaces save-file migration outcomes to the player before the game starts.
 * Appears when the loaded save needed migration, had Prolog facts dropped,
 * carries orphaned extension keys, or drifted from the current predicate
 * schema. The modal does NOT appear for clean migrations.
 *
 * Offers three actions:
 *  - Continue anyway — accept the changes and start the game
 *  - Back up first — download the migrated save JSON, then continue
 *  - Start fresh — abandon the save and restart via onStartFresh
 *
 * This is the runtime/SDK version: vanilla HTML + inline styles, no
 * dependency on platform UI primitives. Editor builds can override by
 * passing a different component to BabylonWorld via the `Modal` prop.
 */

import { useEffect, useMemo } from 'react';
import type { MigrationOutcome } from '@shared/save-file';

export type MigrationPromptAction = 'continue' | 'backup' | 'fresh';

export interface SaveMigrationPromptModalProps {
  open: boolean;
  outcome: MigrationOutcome | null;
  onAction: (action: MigrationPromptAction) => void;
}

interface DriftLine {
  id: string;
  text: string;
}

function buildDriftLines(outcome: MigrationOutcome): DriftLine[] {
  const lines: DriftLine[] = [];
  if (outcome.versionsBehind > 0) {
    lines.push({
      id: 'version',
      text: `Save upgraded from format v${outcome.versionFrom} to v${outcome.versionTo} (${outcome.versionsBehind} version${outcome.versionsBehind === 1 ? '' : 's'} behind).`,
    });
  }
  if (outcome.droppedFacts.length > 0) {
    lines.push({
      id: 'dropped-facts',
      text: `${outcome.droppedFacts.length} Prolog fact${outcome.droppedFacts.length === 1 ? '' : 's'} could not be restored and will be discarded.`,
    });
  }
  if (outcome.orphanExtensionKeys.length > 0) {
    lines.push({
      id: 'orphans',
      text: `${outcome.orphanExtensionKeys.length} orphan extension${outcome.orphanExtensionKeys.length === 1 ? '' : 's'} found: ${outcome.orphanExtensionKeys.join(', ')}.`,
    });
  }
  if (outcome.predicateSchemaDrift) {
    lines.push({
      id: 'schema-drift',
      text: 'The game\'s rule schema has changed since this save was created. Some behaviour may differ.',
    });
  }
  return lines;
}

const overlayStyle: React.CSSProperties = {
  position: 'fixed',
  inset: 0,
  background: 'rgba(0, 0, 0, 0.55)',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  zIndex: 1000,
};

const dialogStyle: React.CSSProperties = {
  background: '#fff',
  color: '#1a1a1a',
  borderRadius: 8,
  boxShadow: '0 8px 32px rgba(0, 0, 0, 0.25)',
  maxWidth: 520,
  width: 'calc(100% - 32px)',
  padding: '24px 28px',
  fontFamily: 'system-ui, -apple-system, "Segoe UI", Roboto, sans-serif',
  fontSize: 14,
  lineHeight: 1.45,
};

const titleStyle: React.CSSProperties = {
  margin: 0,
  fontSize: 18,
  fontWeight: 600,
};

const descriptionStyle: React.CSSProperties = {
  margin: '8px 0 16px',
  color: '#555',
};

const listStyle: React.CSSProperties = {
  margin: '0 0 20px 20px',
  paddingLeft: 8,
};

const footerStyle: React.CSSProperties = {
  display: 'flex',
  flexDirection: 'row',
  justifyContent: 'flex-end',
  gap: 8,
  marginTop: 16,
};

const buttonBase: React.CSSProperties = {
  border: '1px solid transparent',
  borderRadius: 6,
  padding: '8px 14px',
  fontSize: 14,
  fontWeight: 500,
  cursor: 'pointer',
  fontFamily: 'inherit',
};

const buttonPrimary: React.CSSProperties = {
  ...buttonBase,
  background: '#7a5c3a',
  color: '#fff',
};

const buttonSecondary: React.CSSProperties = {
  ...buttonBase,
  background: '#f0e8dc',
  color: '#3a2e1f',
};

const buttonOutline: React.CSSProperties = {
  ...buttonBase,
  background: 'transparent',
  borderColor: '#c8b89a',
  color: '#3a2e1f',
};

export function SaveMigrationPromptModal({ open, outcome, onAction }: SaveMigrationPromptModalProps) {
  const driftLines = useMemo(
    () => (outcome ? buildDriftLines(outcome) : []),
    [outcome],
  );

  // Close on Escape — equivalent to "continue anyway"
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onAction('continue');
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onAction]);

  if (!open) return null;

  return (
    <div
      style={overlayStyle}
      role="alertdialog"
      aria-labelledby="save-migration-title"
      aria-describedby="save-migration-description"
      onClick={(e) => {
        if (e.target === e.currentTarget) onAction('continue');
      }}
    >
      <div style={dialogStyle} onClick={(e) => e.stopPropagation()}>
        <h2 id="save-migration-title" style={titleStyle}>Save file needs attention</h2>
        <p id="save-migration-description" style={descriptionStyle}>
          Your save was updated to match the current game version. Review the changes below and
          choose how you'd like to continue.
        </p>

        {driftLines.length > 0 && (
          <ul aria-label="Migration changes" style={listStyle} data-testid="save-migration-drift-list">
            {driftLines.map((line) => (
              <li key={line.id} style={{ marginBottom: 6 }}>{line.text}</li>
            ))}
          </ul>
        )}

        <div style={footerStyle}>
          <button
            type="button"
            style={buttonOutline}
            onClick={() => onAction('fresh')}
            data-testid="save-migration-fresh"
          >
            Start fresh save
          </button>
          <button
            type="button"
            style={buttonSecondary}
            onClick={() => onAction('backup')}
            data-testid="save-migration-backup"
          >
            Back up save first
          </button>
          <button
            type="button"
            style={buttonPrimary}
            onClick={() => onAction('continue')}
            data-testid="save-migration-continue"
            autoFocus
          >
            Continue anyway
          </button>
        </div>
      </div>
    </div>
  );
}
