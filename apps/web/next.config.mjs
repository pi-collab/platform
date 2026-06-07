/** @type {import('next').NextConfig} */
const nextConfig = {
  // Required: transpile the shared package (raw TypeScript, not pre-built)
  transpilePackages: ['@platform/shared'],
}

export default nextConfig
