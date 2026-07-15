import type { MetadataRoute } from "next";
import { basePath } from "@/lib/base-path";

export const dynamic = "force-static";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "SubTrack",
    short_name: "SubTrack",
    description: "A calm place to track recurring subscriptions.",
    start_url: `${basePath}/`,
    scope: `${basePath}/`,
    display: "standalone",
    background_color: "#f7f7f4",
    theme_color: "#1f6f5f",
    icons: [
      { src: `${basePath}/icon.svg`, sizes: "any", type: "image/svg+xml", purpose: "any" },
      { src: `${basePath}/icon.svg`, sizes: "any", type: "image/svg+xml", purpose: "maskable" },
    ],
  };
}
