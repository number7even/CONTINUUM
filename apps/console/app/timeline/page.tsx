/**
 * /timeline — CONTINUUM's session history (Day → Session → items), the receipt
 * for "we did X". Click a session → jump to /brain and isolate that cluster.
 *
 * IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
 */
import Timeline from './Timeline';

export const dynamic = 'force-dynamic';

export default function TimelinePage() {
  return <Timeline />;
}
