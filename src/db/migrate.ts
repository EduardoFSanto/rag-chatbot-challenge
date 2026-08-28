import { drizzle } from "drizzle-orm/postgres-js";
import { migrate } from "drizzle-orm/postgres-js/migrator";
import postgres from "postgres";
import "dotenv/config";

const migrationClient = postgres(process.env.DATABASE_URL as string, { max: 1 });

const main = async () => {
  console.log("Iniciando migrações...");
  const db = drizzle(migrationClient);
  
  await migrate(db, { migrationsFolder: "./drizzle" });
  
  console.log("Migrações concluídas com sucesso!");
  await migrationClient.end();
  process.exit(0);
};

main().catch((err) => {
  console.error("Falha na migração:", err);
  process.exit(1);
});