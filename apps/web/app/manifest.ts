import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "Velo",
    short_name: "Velo",
    description: "Verified developer infrastructure for Stellar apps",
    start_url: "/dashboard",
    display: "standalone",
    background_color: "#09090b", // zinc-950
    theme_color: "#7c3aed", // violet-600
    orientation: "portrait",
    icons: [
      {
        src: "/icon.png",
        sizes: "192x192",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/iconv2.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "any",
      },
      {
        src: "/logo.png",
        sizes: "512x512",
        type: "image/png",
        purpose: "maskable",
      },
    ],
  };
}
