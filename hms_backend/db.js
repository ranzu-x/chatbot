import mysql from "mysql2/promise";

const pool = mysql.createPool({
  host: "localhost",   // XAMPP MySQL host
  user: "root",        // default XAMPP user
  password: "",        // default is empty unless you set one in phpMyAdmin
  database: "hms_databse", // your database name
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0,
});

export default pool;
