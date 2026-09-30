// One place that knows how to start a run for any lead source.
import { startScrapeJob } from './scrape.service.js';
import { startRedditJob } from './social.service.js';
import { startIntentJob } from './intent.service.js';

export const sourceOf = (t) => t?.source || 'maps';

/** Mongo filter on ScrapeTarget.source for a schedule/list source value. */
export function sourceFilter(source) {
  if (!source || source === 'any') return {};
  if (source === 'maps') return { source: { $in: ['maps', null] } };
  if (source === 'social') return { source: { $nin: ['maps', null] } };
  return { source };
}

/** Start a run. `wait` (schedules) resolves when non-Maps runs finish. */
export async function startTargetRun(target, args, { wait = false } = {}) {
  const s = sourceOf(target);
  if (s === 'maps') return startScrapeJob(args);
  if (s === 'reddit') return startRedditJob({ ...args, wait });
  return startIntentJob({ ...args, wait });
}
