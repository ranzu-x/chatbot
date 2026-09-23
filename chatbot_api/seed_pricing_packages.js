import pool from "./db.js";

async function run() {
  console.log("Seeding pricing packages...");

  // 1. Basic Free Package
  const [[existingFree]] = await pool.query("SELECT id FROM packages WHERE slug = 'basic-free' LIMIT 1");
  let freeId = existingFree?.id;
  if (!freeId) {
    const [res] = await pool.query(
      `INSERT INTO packages (name, slug, type, description, price, billing_cycle, is_active, is_default, max_bot_accounts, max_subscribers, max_team_members, max_monthly_messages)
       VALUES ('Basic Free', 'basic-free', 'END_USER', 'Free forever plan to build bots and explore core automation features.', 0.00, 'free', 1, 1, 1, 500, 1, 1000)`
    );
    freeId = res.insertId;
    console.log("Created Basic Free package with ID:", freeId);

    // Copy core modules from package 3
    await pool.query(
      `INSERT IGNORE INTO package_modules (package_id, module_key, is_enabled, limits_json)
       SELECT ?, module_key, 1, limits_json FROM package_modules WHERE package_id = 3 AND module_key IN ('channel_webchat', 'channel_facebook', 'feature_bot_manager', 'feature_live_chat', 'feature_subscribers')`,
      [freeId]
    );
  } else {
    console.log("Basic Free already exists with ID:", freeId);
  }

  // 2. Premium Pro (Monthly)
  const [[existingPro]] = await pool.query("SELECT id FROM packages WHERE slug = 'premium-pro' LIMIT 1");
  let proId = existingPro?.id;
  if (!proId) {
    const [res] = await pool.query(
      `INSERT INTO packages (name, slug, type, description, price, billing_cycle, is_active, is_default, max_bot_accounts, max_subscribers, max_team_members, max_monthly_messages)
       VALUES ('Premium Pro', 'premium-pro', 'END_USER', 'Advanced AI agent, priority throughput, and higher subscriber limits.', 59.00, 'monthly', 1, 0, 5, 10000, 5, 25000)`
    );
    proId = res.insertId;
    console.log("Created Premium Pro package with ID:", proId);
    await pool.query(
      `INSERT IGNORE INTO package_modules (package_id, module_key, is_enabled, limits_json)
       SELECT ?, module_key, is_enabled, limits_json FROM package_modules WHERE package_id = 3`,
      [proId]
    );
  } else {
    console.log("Premium Pro already exists with ID:", proId);
  }

  // 3. Quarterly Packages
  const quarterlyPlans = [
    { name: "Premium End-User", slug: "premium-end-user-quarterly", type: "END_USER", desc: "Full-featured automated messaging for teams.", price: 79.00, copyFrom: 3, bots: 2, subs: 3000, team: 2, msgs: 10000 },
    { name: "Premium Pro", slug: "premium-pro-quarterly", type: "END_USER", desc: "Advanced AI agent and higher subscriber limits.", price: 159.00, copyFrom: 3, bots: 5, subs: 10000, team: 5, msgs: 25000 },
    { name: "Agency Starter", slug: "agency-starter-quarterly", type: "AGENCY", desc: "Launch your agency with white-label client accounts.", price: 215.00, copyFrom: 2, bots: 5, subs: 5000, team: 5, msgs: 25000 },
    { name: "Agency Growth", slug: "agency-growth-quarterly", type: "AGENCY", desc: "Scale up client bots and custom branding.", price: 320.00, copyFrom: 9, bots: 15, subs: 25000, team: 15, msgs: 100000 },
    { name: "Agency Enterprise (Unlimited)", slug: "agency-enterprise-quarterly", type: "AGENCY", desc: "Unlimited power for high-volume enterprise agencies.", price: 535.00, copyFrom: 1, bots: null, subs: null, team: null, msgs: null },
  ];

  for (const qp of quarterlyPlans) {
    const [[found]] = await pool.query("SELECT id FROM packages WHERE slug = ? LIMIT 1", [qp.slug]);
    if (!found) {
      const [res] = await pool.query(
        `INSERT INTO packages (name, slug, type, description, price, billing_cycle, is_active, is_default, max_bot_accounts, max_subscribers, max_team_members, max_monthly_messages)
         VALUES (?, ?, ?, ?, ?, 'quarterly', 1, 0, ?, ?, ?, ?)`,
        [qp.name, qp.slug, qp.type, qp.desc, qp.price, qp.bots, qp.subs, qp.team, qp.msgs]
      );
      await pool.query(
        `INSERT IGNORE INTO package_modules (package_id, module_key, is_enabled, limits_json)
         SELECT ?, module_key, is_enabled, limits_json FROM package_modules WHERE package_id = ?`,
        [res.insertId, qp.copyFrom]
      );
      console.log(`Created quarterly package ${qp.name} with ID: ${res.insertId}`);
    }
  }

  // 4. Yearly Packages (Save 20% / 2 months free)
  const yearlyPlans = [
    { name: "Premium End-User", slug: "premium-end-user-yearly", type: "END_USER", desc: "Full-featured automated messaging for teams. 2 months free!", price: 290.00, copyFrom: 3, bots: 2, subs: 3000, team: 2, msgs: 10000 },
    { name: "Premium Pro", slug: "premium-pro-yearly", type: "END_USER", desc: "Advanced AI agent and higher subscriber limits. 2 months free!", price: 590.00, copyFrom: 3, bots: 5, subs: 10000, team: 5, msgs: 25000 },
    { name: "Agency Starter", slug: "agency-starter-yearly", type: "AGENCY", desc: "Launch your agency with white-label client accounts. 2 months free!", price: 790.00, copyFrom: 2, bots: 5, subs: 5000, team: 5, msgs: 25000 },
    { name: "Agency Growth", slug: "agency-growth-yearly", type: "AGENCY", desc: "Scale up client bots and custom branding. 2 months free!", price: 1190.00, copyFrom: 9, bots: 15, subs: 25000, team: 15, msgs: 100000 },
    { name: "Agency Enterprise (Unlimited)", slug: "agency-enterprise-yearly", type: "AGENCY", desc: "Unlimited power for high-volume enterprise agencies. 2 months free!", price: 1990.00, copyFrom: 1, bots: null, subs: null, team: null, msgs: null },
  ];

  for (const yp of yearlyPlans) {
    const [[found]] = await pool.query("SELECT id FROM packages WHERE slug = ? LIMIT 1", [yp.slug]);
    if (!found) {
      const [res] = await pool.query(
        `INSERT INTO packages (name, slug, type, description, price, billing_cycle, is_active, is_default, max_bot_accounts, max_subscribers, max_team_members, max_monthly_messages)
         VALUES (?, ?, ?, ?, ?, 'yearly', 1, 0, ?, ?, ?, ?)`,
        [yp.name, yp.slug, yp.type, yp.desc, yp.price, yp.bots, yp.subs, yp.team, yp.msgs]
      );
      await pool.query(
        `INSERT IGNORE INTO package_modules (package_id, module_key, is_enabled, limits_json)
         SELECT ?, module_key, is_enabled, limits_json FROM package_modules WHERE package_id = ?`,
        [res.insertId, yp.copyFrom]
      );
      console.log(`Created yearly package ${yp.name} with ID: ${res.insertId}`);
    }
  }

  console.log("Seeding complete!");
  process.exit(0);
}

run().catch((err) => {
  console.error("Seed error:", err);
  process.exit(1);
});
