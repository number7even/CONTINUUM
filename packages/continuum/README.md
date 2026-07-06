# @number7even/continuum

**CONTINUUM — the verifiable memory & trust layer for AI-assisted development.**

The marketed entry point. This package forwards to the CONTINUUM CLI
(`@number7even/continuum-cli`) so the clean one-liner resolves:

```bash
npx @number7even/continuum init      # create the project DB + print the MCP snippet
npx @number7even/continuum start     # run the stdio MCP server
npx @number7even/continuum verify    # run the exit-0 proof gate on open commitments
```

CONTINUUM sits between you and your AI coding assistant (Claude Code, Cursor) as a
persistent, **verifiable** memory: it aggregates five sources of project truth, and
**refuses to mark work done until a shell `verifyCommand` exits 0** — proof, not
assertion. It is bound by **[The Nine](https://thenine.foundation)**, the bidirectional
trust protocol for human-agent collaboration.

- Full docs + source: <https://github.com/number7even/CONTINUUM>
- The governing discipline: <https://thenine.foundation>

_IP by Riaan Kleynhans — Human in the Loop — Copyright Riaan Kleynhans._
