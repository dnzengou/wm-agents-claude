import type { Metadata } from 'next';
import { Inter, JetBrains_Mono } from 'next/font/google';
import '@/styles/globals.css';
// Leaflet CSS must be imported at layout level so it's available when the
// dynamically-loaded WorldMap component mounts on the client.
import 'leaflet/dist/leaflet.css';
import '@/components/map/WorldMap.css';

const inter = Inter({ 
  subsets: ['latin'],
  variable: '--font-inter',
});

const jetbrainsMono = JetBrains_Mono({ 
  subsets: ['latin'],
  variable: '--font-jetbrains-mono',
});

export const metadata: Metadata = {
  title: 'WorldMonitor | OSINT Intelligence Platform',
  description: 'Real-time open source intelligence monitoring and analysis platform',
  keywords: ['OSINT', 'intelligence', 'threat monitoring', 'security', 'geopolitics'],
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" className="dark">
      <body className={`${inter.variable} ${jetbrainsMono.variable} font-sans`}>
        {children}
      </body>
    </html>
  );
}
