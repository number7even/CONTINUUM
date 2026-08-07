/**
 * /ask — ask your knowledge (Semantic SONA), grounded + trust-tiered + local.
 *
 * IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans
 */
import AskConsole from './AskConsole';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'CONTINUUM · Ask' };

export default function AskPage() {
  return <AskConsole />;
}
