/** @type {import('next').NextConfig} */
const nextConfig = {
  output: 'export',  // 启用静态导出
  basePath: '/abi-decoder',  // 例如 '/transaction-decoder'
  images: {
    unoptimized: true,
  },
}

module.exports = nextConfig
