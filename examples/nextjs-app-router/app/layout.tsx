import React from "react";

export const metadata = {
  title: "Velo SDK Next.js App Router Example",
  description: "Demonstration of Velo Checkout Session creation and Webhook Verification",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body style={{
        margin: 0,
        fontFamily: "system-ui, sans-serif",
        background: "#09090b",
        color: "#fafafa"
      }}>
        {children}
      </body>
    </html>
  );
}
