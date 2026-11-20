/**
 * Small per-browser memory for the Tracker: which folds are open and which view a phone shows.
 * Storage can be missing or blocked (private window); then nothing is remembered.
 */

const FOLDS_KEY = 'wfhub.rotations.open';
const VIEW_KEY = 'wfhub.tracker.view';

export type TrackerView = 'checklist' | 'live';

function readFolds(): Record<string, boolean> {
  try {
    const raw: unknown = JSON.parse(globalThis.localStorage?.getItem(FOLDS_KEY) ?? '{}');
    return raw && typeof raw === 'object' ? (raw as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

/** Whether a fold was left open; folded when never touched. */
export function isFoldOpen(key: string): boolean {
  return readFolds()[key] === true;
}

export function setFoldOpen(key: string, open: boolean): void {
  try {
    const folds = readFolds();
    if (open) folds[key] = true;
    else delete folds[key];
    globalThis.localStorage?.setItem(FOLDS_KEY, JSON.stringify(folds));
  } catch {
    // not remembered
  }
}

export function savedTrackerView(): TrackerView {
  try {
    return globalThis.localStorage?.getItem(VIEW_KEY) === 'live' ? 'live' : 'checklist';
  } catch {
    return 'checklist';
  }
}

export function saveTrackerView(view: TrackerView): void {
  try {
    globalThis.localStorage?.setItem(VIEW_KEY, view);
  } catch {
    // not remembered
  }
}
