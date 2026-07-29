import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  // Menghasilkan .next/standalone berisi server + dependensi seperlunya,
  // supaya image produksi tidak perlu membawa node_modules lengkap.
  output: "standalone",
};

export default nextConfig;
