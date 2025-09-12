import mysql from "mysql2/promise";

const pool = mysql.createPool({
  host: "192.168.0.100",   // XAMPP MySQL host
  user: "rupos",        // default XAMPP user
  password: "rupos",        // default is empty unless you set one in phpMyAdmin
  database: "hms_database", // your database name
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

export default pool;
