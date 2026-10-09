import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  distDir:
    process.env.NODE_ENV === "development" && process.env.CHESS_EMULATOR_DEV === "true"
      ? ".next-emulator"
      : ".next",
};

export default nextConfig;
