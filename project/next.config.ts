import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  serverExternalPackages: ["better-sqlite3"],
  sassOptions: {
    silenceDeprecations: ["import"],
  },
};

export default nextConfig;
