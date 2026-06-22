import type { Metadata, Viewport } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import '@/styles/globals.css';
// Leaflet CSS must be imported at layout level so it's available when the
// dynamically-loaded WorldMap component mounts on the client.
import 'leaflet/dist/leaflet.css';
import '@/components/map/WorldMap.css';

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
});

const jetbrainsMono = JetBrains_Mono({
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
  display: 'swap',
});

export const viewport: Viewport = {
  themeColor: '#080d16',
  width: 'device-width',
  initialScale: 1,
  minimumScale: 1,
};

export const metadata: Metadata = {
  metadataBase: new URL('https://worldmonitor-core.vercel.app'),
  title: 'WorldMonitor Agents | Multi-Domain Intelligence Platform',
  description: 'Real-time multi-domain OSINT intelligence: geopolitical, cyber, energy, climate, nuclear, and more.',
  keywords: ['OSINT', 'intelligence', 'threat monitoring', 'cyber', 'energy', 'climate', 'nuclear', 'geopolitics'],
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    title: 'WorldMonitor',
    statusBarStyle: 'black-translucent',
  },
  icons: {
    icon: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
      { url: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
      { url: '/icons/icon.svg', type: 'image/svg+xml' },
    ],
    apple: [
      { url: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
    ],
  },
  openGraph: {
    type: 'website',
    title: 'WorldMonitor Agents',
    description: 'Real-time multi-domain OSINT intelligence platform.',
    siteName: 'WorldMonitor Agents',
  },
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="mobile-web-app-capable" content="yes" />
      </head>
      <body className={`${inter.variable} ${jetbrainsMono.variable} font-sans`}>
        {children}
        {/* PWA service worker registration */}
        <script
          dangerouslySetInnerHTML={{
            __html: `
              if ('serviceWorker' in navigator) {
                window.addEventListener('load', () => {
                  navigator.serviceWorker.register('/sw.js').catch(() => {});
                });
              }
            `,
          }}
        />
      </body>
    </html>
  );
}
