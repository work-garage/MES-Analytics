import type { Metadata } from "next"
import "./globals.css"
import Providers from "@/components/providers/QueryProvider"
import { Toaster } from "@/components/ui/sonner"

export const metadata: Metadata = {
  title: "MES System",
  description: "Manufacturing Execution System",
}

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode
}>) {
  return (
    <html lang="en">
      <body className="font-sans">
        <Providers>
          {children}
          <Toaster />
        </Providers>
      </body>
    </html>
  )
}
