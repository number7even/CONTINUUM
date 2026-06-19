// @ts-check
import { defineConfig } from 'astro/config';
import starlight from '@astrojs/starlight';

/**
 * Continuum — public docs + landing site (MD8 deliverable).
 *
 * Served at the www.continuum.rest apex. Unlike the operator console
 * (console.continuum.rest, noindex), THIS site is the public, indexable
 * front door for the OSS project. Brand palette: Inkwell / Lunar Eclipse /
 * Creme Brulee / Au Lait (src/styles/brand.css).
 *
 * Bound by The Nine v0.1.0.
 */
export default defineConfig({
  site: 'https://www.continuum.rest',
  integrations: [
    starlight({
      title: 'Continuum',
      description:
        'Persistent, verifiable memory for AI coding assistants. An open-source MCP engine that refuses to mark work done until a shell command proves it.',
      customCss: ['./src/styles/brand.css'],
      social: [
        {
          icon: 'github',
          label: 'GitHub',
          href: 'https://github.com/number7even/CONTINUUM',
        },
      ],
      editLink: {
        baseUrl: 'https://github.com/number7even/CONTINUUM/edit/main/apps/docs/',
      },
      lastUpdated: true,
      sidebar: [
        {
          label: 'Start Here',
          items: [{ label: 'Overview', link: '/overview/' }],
        },
        {
          label: 'Engineering',
          items: [{ label: 'Architecture', link: '/architecture/' }],
        },
        {
          label: 'Roadmap',
          items: [{ label: 'North Star Build Plan', link: '/build-plan/' }],
        },
      ],
    }),
  ],
});
