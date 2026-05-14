import pool from '../db.js';

/**
 * Logs an action to the audit_logs table
 * @param {Object} params
 * @param {number} params.userId - ID of the user performing the action
 * @param {string} params.action - Description of action (e.g., 'CREATE_PRESCRIPTION')
 * @param {string} params.tableName - Affected table
 * @param {number} params.recordId - ID of the affected record
 * @param {Object} params.oldValues - Previous state (optional)
 * @param {Object} params.newValues - New state (optional)
 * @param {number} params.hospitalId - Hospital context
 */
export const logAudit = async ({ userId, action, tableName, recordId, oldValues = null, newValues = null, hospitalId }) => {
  try {
    await pool.query(
      `INSERT INTO audit_logs (user_id, action, table_name, record_id, old_values, new_values, hospital_id) 
       VALUES (?, ?, ?, ?, ?, ?, ?)`,
      [
        userId, 
        action, 
        tableName, 
        recordId, 
        oldValues ? JSON.stringify(oldValues) : null, 
        newValues ? JSON.stringify(newValues) : null,
        hospitalId
      ]
    );
  } catch (error) {
    console.error("Failed to write audit log:", error);
    // We don't throw here to avoid breaking the main request if logging fails
  }
};
