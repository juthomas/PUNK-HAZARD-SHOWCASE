import type { NextConfig } from "next";
import createNextIntlPlugin from 'next-intl/plugin';

const withNextIntl = createNextIntlPlugin('./i18n/request.ts');

const nextConfig: NextConfig = {
  async redirects() {
    const localePrefixes = ['/fr', '/en'];
    const pathMap: [string, string][] = [
      ['logiciels', 'softwares'],
      ['boutique', 'shop'],
      ['projets', 'projects'],
      ['a-propos', 'about'],
      ['mentions-legales', 'legal'],
      ['profil', 'profile'],
      ['cgv', 'terms'],
    ];
    const redirects: { source: string; destination: string; permanent: true }[] = [];
    for (const prefix of localePrefixes) {
      for (const [oldPath, newPath] of pathMap) {
        redirects.push({
          source: `${prefix}/${oldPath}`,
          destination: `${prefix}/${newPath}`,
          permanent: true,
        });
        redirects.push({
          source: `${prefix}/${oldPath}/:path*`,
          destination: `${prefix}/${newPath}/:path*`,
          permanent: true,
        });
      }
    }
    return redirects;
  },
  async headers() {
    return [
      {
        source: "/fonts/:path*",
        headers: [
          { key: "Cache-Control", value: "public, max-age=31536000, immutable" },
          { key: "Access-Control-Allow-Origin", value: "*" },
          { key: "Access-Control-Allow-Credentials", value: "true" },
          { key: "Access-Control-Allow-Methods", value: "GET, OPTIONS" },
          { key: "Access-Control-Allow-Headers", value: "*" },
        ],
      },
    ];
  },
};

export default withNextIntl(nextConfig);
