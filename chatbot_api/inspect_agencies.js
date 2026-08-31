import mysql from "mysql2/promise";
import dotenv from "dotenv";
dotenv.config();

async function inspectTables() {
  const conn = await mysql.createConnection({
    host: process.env.DB_HOST,
    user: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    database: process.env.DB_NAME,
    port: process.env.DB_PORT
  });

  const [agencyCols] = await conn.execute("DESCRIBE agencies");
  console.log("=== AGENCIES COLUMNS ===");
  console.log(agencyCols.map(c => `${c.Field} (${c.Type})`));

  const [agentCols] = await conn.execute("DESCRIBE agent_profiles");
  console.log("\n=== AGENT_PROFILES COLUMNS ===");
  console.log(agentCols.map(c => `${c.Field} (${c.Type})`));

  const [userCols] = await conn.execute("DESCRIBE users");
  console.log("\n=== USERS COLUMNS ===");
  console.log(userCols.map(c => `${c.Field} (${c.Type})`));

  const [agencyRows] = await conn.execute("SELECT * FROM agencies");
  console.log("\n=== AGENCIES DATA ===");
  console.log(agencyRows);

  await conn.end();
}

inspectTables().catch(console.error);
