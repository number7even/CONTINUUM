/**
 * /brain — the 3D observation-graph "brain" page.
 *
 * Server component: fetches the graph over MCP/SSE (fetchGraph) and hands it to
 * the client 3D renderer. force-dynamic so every load reflects live engine state.
 */
import { fetchGraph } from './lib';
import { BrainGraph } from './BrainGraph';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'CONTINUUM · Brain' };

export default async function BrainPage() {
  const data = await fetchGraph(3000);
  return <BrainGraph data={data} />;
}
