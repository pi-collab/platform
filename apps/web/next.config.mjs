/** @type {import('next').NextConfig} */
const nextConfig = {
  // Required: transpile ESM-only packages and the shared workspace package
  transpilePackages: ['@platform/shared', '@paper-design/shaders-react', '@paper-design/shaders'],
}

export default nextConfig
