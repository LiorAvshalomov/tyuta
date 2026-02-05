/** @type {import('next').NextConfig} */
const nextConfig = {
  images: {
    remotePatterns: [
      // DiceBear (fallback לאוואטר)
      {
        protocol: 'https',
        hostname: 'api.dicebear.com',
      },

      {
        protocol: 'https',
        hostname: 'pixabay.com',
      },

      // Supabase Storage (avatars)
      {
        protocol: 'https',
        hostname: 'dowhdgcvxgzaikmpnchv.supabase.co',
        pathname: '/storage/v1/object/public/**',
      },
    ],
  },
}

module.exports = nextConfig