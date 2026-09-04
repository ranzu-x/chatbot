import pool from './db.js'; pool.query('SHOW COLUMNS FROM social_posts').then(([r])= r.forEach(c=, c.Type, c.Default)); process.exit(0); }).catch(e=;process.exit(1)});  
