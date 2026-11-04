import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  cacheComponents: true,
  // Рантайм сгенерированного Prisma-клиента и pg-драйвер нельзя бандлить —
  // под bun+turbopack внешний импорт без этого ломается на этапе require.
  serverExternalPackages: ["@prisma/client", "pg"],
};

export default nextConfig;
