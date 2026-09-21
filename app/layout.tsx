import type { Metadata } from 'next';
import { Plus_Jakarta_Sans } from 'next/font/google';
import './globals.css';

const jakarta = Plus_Jakarta_Sans({
  subsets: ['latin'],
  weight: ['500', '600', '700', '800'],
  variable: '--font-sans',
  display: 'swap',
});

export const metadata: Metadata = {
  title: 'Lumia Photobooth — More Than Just Photos, It\'s A Memory',
  description: 'Bikin momen seru jadi tak terlupakan bersama Lumia!',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="id" className={jakarta.variable}>
      <body className={`${jakarta.className} min-h-full antialiased`} style={{ margin: 0, padding: 0 }}>
        {children}
      </body>
    </html>
  );
}
