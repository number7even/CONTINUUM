/** @type {import('next').NextConfig} */
const nextConfig = {
  // Default to Node runtime everywhere (the MCP SDK SSE client needs
  // Node's EventSource + fetch surface; Edge runtime is incompatible).
  experimental: {},
};

module.exports = nextConfig;
