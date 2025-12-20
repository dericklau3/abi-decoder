/** @type {import('next').NextConfig} */
const isProd = process.env.NODE_ENV === 'production';

const nextConfig = {
  output: 'export',  // 启用静态导出
  basePath: isProd ? '/abi-decoder' : '',
  images: {
    unoptimized: true,
  },
}

module.exports = nextConfig
