import type { Metadata, Viewport } from "next";
import "./globals.css";
import { FamilyProvider } from "@/components/FamilyProvider";

export const metadata: Metadata = {
  title: "Sổ Sức Khỏe Gia Đình",
  description: "Theo dõi tăng trưởng, tiêm chủng và bệnh sử cho cả gia đình",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icon.svg", apple: "/icon.svg" },
  appleWebApp: { capable: true, title: "Sổ Sức Khỏe", statusBarStyle: "default" },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#2a78d6",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi">
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="" />
        <link
          href="https://fonts.googleapis.com/css2?family=Be+Vietnam+Pro:wght@400;500;600;700&display=swap"
          rel="stylesheet"
        />
      </head>
      <body>
        <FamilyProvider>{children}</FamilyProvider>
      </body>
    </html>
  );
}
