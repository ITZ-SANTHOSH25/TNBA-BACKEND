/**
 * ============================================================================
 *  TN Blood Bank Management System — SINGLE-FILE BACKEND
 * ============================================================================
 *  Everything in one file: config, database schema, seed data, auth,
 *  middleware, business logic, and all API routes.
 *
 *  Stack : Node.js + Express + better-sqlite3 + JWT + bcryptjs
 *  Run   : npm install express better-sqlite3 jsonwebtoken bcryptjs cors
 *          node server.js
 *  Port  : 4000 (override with PORT env var)
 *
 *  Demo credentials (seeded automatically on first run):
 *    admin@tnbloodbank.gov.in / Admin@12345
 *    rajesh.kumar@email.com    / Donor@12345
 *    ghbloodbank@tn.gov.in     / Bank@12345
 *    apollo.chennai@hospital.in/ Hospital@12345
 * ============================================================================
 */

'use strict';

const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const express = require('express');
const Database = require('better-sqlite3');
const jwt = require('jsonwebtoken');
const bcrypt = require('bcryptjs');
const cors = require('cors');

/* ============================================================================
 * 1. CONFIG
 * ========================================================================== */

const CONFIG = {
  port: parseInt(process.env.PORT || '4000', 10),
  host: process.env.HOST || '0.0.0.0',
  dbFile: process.env.DB_FILE || path.join(__dirname, 'tn_blood_bank.sqlite'),
  jwtSecret: process.env.JWT_SECRET || 'tn-blood-bank-dev-secret-change-me',
  jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || 'tn-blood-bank-dev-refresh-secret-change-me',
  jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',
  corsOrigin: process.env.CORS_ORIGIN || '*',
  seedAdminEmail: process.env.SEED_ADMIN_EMAIL || 'admin@tnbloodbank.gov.in',
  seedAdminPassword: process.env.SEED_ADMIN_PASSWORD || 'Admin@12345',
};

const CONSTANTS = {
  BLOOD_GROUPS: ['A+', 'A-', 'B+', 'B-', 'AB+', 'AB-', 'O+', 'O-'],
  COMPONENTS: ['Whole Blood', 'Red Blood Cells', 'Platelets', 'Plasma'],
  DISTRICTS: [
    'Chennai', 'Coimbatore', 'Madurai', 'Tiruchirappalli', 'Salem',
    'Tirunelveli', 'Erode', 'Vellore', 'Thoothukudi', 'Kanyakumari',
  ],
  ROLES: ['donor', 'hospital', 'bloodbank', 'admin'],
  REQUEST_STATUSES: ['pending', 'approved', 'fulfilled', 'rejected', 'cancelled'],
  EMERGENCY_STATUSES: ['open', 'in_progress', 'resolved', 'cancelled'],
  CAMP_STATUSES: ['upcoming', 'ongoing', 'completed', 'cancelled'],
  URGENCY_LEVELS: ['low', 'medium', 'high', 'critical'],
  FEEDBACK_CATEGORIES: ['general', 'bug', 'feature', 'complaint', 'praise'],
  FEEDBACK_RATINGS: [1, 2, 3, 4, 5],
  FEEDBACK_STATUSES: ['new', 'in_review', 'resolved'],
  INVENTORY: { AVAILABLE_MIN: 10, LIMITED_MIN: 1 },
};

/* ============================================================================
 * 2. DATABASE — schema + connection
 * ========================================================================== */

const SCHEMA = `
PRAGMA journal_mode = WAL;
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS users (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  email         TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  full_name     TEXT NOT NULL,
  phone         TEXT,
  role          TEXT NOT NULL CHECK (role IN ('donor','hospital','bloodbank','admin')),
  is_active     INTEGER NOT NULL DEFAULT 1,
  created_at    TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS donors (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  donor_code      TEXT NOT NULL UNIQUE,
  blood_group     TEXT NOT NULL,
  date_of_birth   TEXT,
  gender          TEXT,
  weight_kg       REAL,
  district        TEXT,
  address         TEXT,
  last_donation   TEXT,
  total_donations INTEGER NOT NULL DEFAULT 0,
  lives_impacted  INTEGER NOT NULL DEFAULT 0,
  is_available    INTEGER NOT NULL DEFAULT 1,
  created_at      TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS hospitals (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id       INTEGER NOT NULL UNIQUE REFERENCES users(id) ON DELETE CASCADE,
  hospital_code TEXT NOT NULL UNIQUE,
  name          TEXT NOT NULL,
  district      TEXT,
  address       TEXT,
  contact_person TEXT,
  contact_number TEXT,
  is_verified   INTEGER NOT NULL DEFAULT 0,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS blood_banks (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id        INTEGER REFERENCES users(id) ON DELETE SET NULL,
  license_number TEXT NOT NULL UNIQUE,
  name           TEXT NOT NULL,
  district       TEXT,
  address        TEXT,
  contact_number TEXT,
  email          TEXT,
  is_verified    INTEGER NOT NULL DEFAULT 0,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS blood_inventory (
  id           INTEGER PRIMARY KEY AUTOINCREMENT,
  blood_bank_id INTEGER NOT NULL REFERENCES blood_banks(id) ON DELETE CASCADE,
  blood_group  TEXT NOT NULL,
  component    TEXT NOT NULL DEFAULT 'Whole Blood',
  units        INTEGER NOT NULL DEFAULT 0,
  updated_at   TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (blood_bank_id, blood_group, component)
);

CREATE TABLE IF NOT EXISTS blood_requests (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  request_code   TEXT NOT NULL UNIQUE,
  requester_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  patient_name   TEXT NOT NULL,
  blood_group    TEXT NOT NULL,
  component      TEXT NOT NULL DEFAULT 'Whole Blood',
  units          INTEGER NOT NULL DEFAULT 1,
  urgency        TEXT NOT NULL DEFAULT 'medium',
  hospital_name  TEXT,
  district       TEXT,
  contact_person TEXT,
  contact_number TEXT,
  required_by    TEXT,
  notes          TEXT,
  status         TEXT NOT NULL DEFAULT 'pending',
  blood_bank_id  INTEGER REFERENCES blood_banks(id) ON DELETE SET NULL,
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS emergency_requests (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  emergency_code TEXT NOT NULL UNIQUE,
  requester_id   INTEGER REFERENCES users(id) ON DELETE SET NULL,
  patient_name   TEXT NOT NULL,
  blood_group    TEXT NOT NULL,
  units          INTEGER NOT NULL DEFAULT 1,
  hospital_name  TEXT,
  district       TEXT,
  contact_number TEXT NOT NULL,
  location       TEXT,
  notes          TEXT,
  status         TEXT NOT NULL DEFAULT 'open',
  created_at     TEXT NOT NULL DEFAULT (datetime('now')),
  updated_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS camps (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  camp_code      TEXT NOT NULL UNIQUE,
  title          TEXT NOT NULL,
  organizer      TEXT,
  district       TEXT,
  venue          TEXT,
  address        TEXT,
  camp_date      TEXT NOT NULL,
  start_time     TEXT,
  end_time       TEXT,
  expected_donors INTEGER DEFAULT 0,
  registered_count INTEGER NOT NULL DEFAULT 0,
  contact_person TEXT,
  contact_number TEXT,
  status         TEXT NOT NULL DEFAULT 'upcoming',
  created_by     INTEGER REFERENCES users(id) ON DELETE SET NULL,
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS camp_registrations (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  camp_id    INTEGER NOT NULL REFERENCES camps(id) ON DELETE CASCADE,
  donor_id   INTEGER NOT NULL REFERENCES donors(id) ON DELETE CASCADE,
  status     TEXT NOT NULL DEFAULT 'registered',
  created_at TEXT NOT NULL DEFAULT (datetime('now')),
  UNIQUE (camp_id, donor_id)
);

CREATE TABLE IF NOT EXISTS camp_requests (
  id             INTEGER PRIMARY KEY AUTOINCREMENT,
  organization   TEXT NOT NULL,
  camp_date      TEXT NOT NULL,
  expected_donors INTEGER DEFAULT 0,
  venue_address  TEXT,
  district       TEXT,
  contact_person TEXT,
  contact_number TEXT,
  notes          TEXT,
  status         TEXT NOT NULL DEFAULT 'pending',
  created_at     TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS donations (
  id            INTEGER PRIMARY KEY AUTOINCREMENT,
  donor_id      INTEGER NOT NULL REFERENCES donors(id) ON DELETE CASCADE,
  blood_bank_id INTEGER REFERENCES blood_banks(id) ON DELETE SET NULL,
  camp_id       INTEGER REFERENCES camps(id) ON DELETE SET NULL,
  blood_group   TEXT,
  component     TEXT NOT NULL DEFAULT 'Whole Blood',
  units         INTEGER NOT NULL DEFAULT 1,
  donation_date TEXT NOT NULL,
  notes         TEXT,
  created_at    TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS feedback (
  id              INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id         INTEGER REFERENCES users(id) ON DELETE SET NULL,
  name            TEXT,
  email           TEXT,
  category        TEXT NOT NULL DEFAULT 'general',
  rating          INTEGER,
  subject         TEXT,
  message         TEXT NOT NULL,
  attachment_path TEXT,
  status          TEXT NOT NULL DEFAULT 'new',
  created_at      TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS notifications (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title      TEXT NOT NULL,
  message    TEXT NOT NULL,
  type       TEXT NOT NULL DEFAULT 'info',
  is_read    INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS eligibility_checks (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  donor_id   INTEGER REFERENCES donors(id) ON DELETE SET NULL,
  answers    TEXT NOT NULL,
  eligible   INTEGER NOT NULL,
  reason     TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS announcements (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  category   TEXT DEFAULT 'general',
  is_active  INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS health_tips (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  title      TEXT NOT NULL,
  body       TEXT NOT NULL,
  icon       TEXT DEFAULT 'heart',
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE TABLE IF NOT EXISTS faqs (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  question   TEXT NOT NULL,
  answer     TEXT NOT NULL,
  category   TEXT DEFAULT 'general',
  sort_order INTEGER NOT NULL DEFAULT 0
);

CREATE TABLE IF NOT EXISTS refresh_tokens (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id    INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  token      TEXT NOT NULL UNIQUE,
  expires_at TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now'))
);

CREATE INDEX IF NOT EXISTS idx_inventory_group ON blood_inventory(blood_group);
CREATE INDEX IF NOT EXISTS idx_requests_status ON blood_requests(status);
CREATE INDEX IF NOT EXISTS idx_emergency_status ON emergency_requests(status);
CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read);
`;

const db = new Database(CONFIG.dbFile);
db.exec(SCHEMA);

/* ============================================================================
 * 3. SEED DATA
 * ========================================================================== */

function seed() {
  const count = db.prepare('SELECT COUNT(*) AS c FROM users').get().c;
  if (count > 0) return;

  const hash = (p) => bcrypt.hashSync(p, 10);
  const now = new Date().toISOString();

  const insertUser = db.prepare(
    `INSERT INTO users (email, password_hash, full_name, phone, role) VALUES (?,?,?,?,?)`
  );

  const tx = db.transaction(() => {
    // Admin
    insertUser.run(CONFIG.seedAdminEmail, hash(CONFIG.seedAdminPassword), 'System Administrator', '+91 90000 00001', 'admin');

    // Donor
    const donorUserId = insertUser.run('rajesh.kumar@email.com', hash('Donor@12345'), 'Rajesh Kumar', '+91 98765 43210', 'donor').lastInsertRowid;
    db.prepare(
      `INSERT INTO donors (user_id, donor_code, blood_group, date_of_birth, gender, weight_kg, district, address, last_donation, total_donations, lives_impacted)
       VALUES (?,?,?,?,?,?,?,?,?,?,?)`
    ).run(donorUserId, 'TN-CH-05248', 'B+', '1994-06-15', 'Male', 72, 'Chennai', 'Anna Nagar, Chennai', '2024-11-20', 12, 36);

    // Blood bank
    const bbUserId = insertUser.run('ghbloodbank@tn.gov.in', hash('Bank@12345'), 'Government General Hospital Blood Bank', '+91 44 2530 5000', 'bloodbank').lastInsertRowid;
    const bbId = db.prepare(
      `INSERT INTO blood_banks (user_id, license_number, name, district, address, contact_number, email, is_verified)
       VALUES (?,?,?,?,?,?,?,1)`
    ).run(bbUserId, 'TN-BB-CH-0001', 'Government General Hospital Blood Bank', 'Chennai', 'Park Town, Chennai', '+91 44 2530 5000', 'ghbloodbank@tn.gov.in').lastInsertRowid;

    // Inventory for the blood bank
    const inv = db.prepare(
      `INSERT OR IGNORE INTO blood_inventory (blood_bank_id, blood_group, component, units) VALUES (?,?,?,?)`
    );
    const stock = { 'A+': 14, 'A-': 5, 'B+': 22, 'B-': 3, 'AB+': 9, 'AB-': 0, 'O+': 31, 'O-': 6 };
    for (const [bg, units] of Object.entries(stock)) inv.run(bbId, bg, 'Whole Blood', units);

    // A second blood bank
    const bb2Id = db.prepare(
      `INSERT INTO blood_banks (license_number, name, district, address, contact_number, email, is_verified)
       VALUES (?,?,?,?,?,?,1)`
    ).run('TN-BB-CO-0002', 'Coimbatore Medical College Blood Bank', 'Coimbatore', 'Civil Aerodrome Post, Coimbatore', '+91 422 230 1000', 'cmcbloodbank@tn.gov.in').lastInsertRowid;
    for (const [bg, units] of Object.entries({ 'A+': 8, 'A-': 2, 'B+': 11, 'B-': 1, 'AB+': 4, 'AB-': 1, 'O+': 17, 'O-': 4 })) inv.run(bb2Id, bg, 'Whole Blood', units);

    // Hospital
    const hospUserId = insertUser.run('apollo.chennai@hospital.in', hash('Hospital@12345'), 'Apollo Hospital Chennai', '+91 44 2829 3333', 'hospital').lastInsertRowid;
    db.prepare(
      `INSERT INTO hospitals (user_id, hospital_code, name, district, address, contact_person, contact_number, is_verified)
       VALUES (?,?,?,?,?,?,?,1)`
    ).run(hospUserId, 'HOSP-CH-0001', 'Apollo Hospital', 'Chennai', 'Greams Road, Chennai', 'Dr. Meena', '+91 44 2829 3333');

    // Camps
    const camp = db.prepare(
      `INSERT INTO camps (camp_code, title, organizer, district, venue, address, camp_date, start_time, end_time, expected_donors, contact_person, contact_number, status)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
    );
    camp.run('CAMP-2025-0001', 'Mega Blood Donation Camp', 'Red Cross Society', 'Chennai', 'Marina Beach Grounds', 'Marina Beach, Chennai', '2025-12-05', '09:00', '17:00', 200, 'Suresh', '+91 90000 11111', 'upcoming');
    camp.run('CAMP-2025-0002', 'College Blood Drive', 'Anna University NSS', 'Chennai', 'Anna University', 'Guindy, Chennai', '2025-12-12', '10:00', '16:00', 150, 'Priya', '+91 90000 22222', 'upcoming');
    camp.run('CAMP-2025-0003', 'Corporate Donation Camp', 'TCS Chennai', 'Chennai', 'TCS Siruseri', 'Siruseri IT Park', '2025-11-28', '09:30', '15:30', 120, 'Arun', '+91 90000 33333', 'completed');

    // Donations history for Rajesh
    const donorId = db.prepare('SELECT id FROM donors WHERE donor_code = ?').get('TN-CH-05248').id;
    const don = db.prepare(
      `INSERT INTO donations (donor_id, blood_bank_id, blood_group, component, units, donation_date) VALUES (?,?,?,?,?,?)`
    );
    don.run(donorId, bbId, 'B+', 'Whole Blood', 1, '2024-11-20');
    don.run(donorId, bbId, 'B+', 'Whole Blood', 1, '2024-07-14');
    don.run(donorId, bbId, 'B+', 'Platelets', 1, '2024-03-02');

    // Announcements / tips / faqs
    const ann = db.prepare(`INSERT INTO announcements (title, body, category) VALUES (?,?,?)`);
    ann.run('National Blood Donation Day', 'Join us on 1st October for a statewide blood donation drive across all districts.', 'event');
    ann.run('New Inventory System Live', 'Real-time blood availability is now available for all registered hospitals.', 'update');

    const tip = db.prepare(`INSERT INTO health_tips (title, body, icon) VALUES (?,?,?)`);
    tip.run('Stay Hydrated', 'Drink plenty of water before and after donating blood.', 'water');
    tip.run('Eat Iron-Rich Foods', 'Include spinach, dates and lentils in your diet to maintain healthy haemoglobin.', 'food');
    tip.run('Rest Well', 'Get at least 7-8 hours of sleep before your donation day.', 'sleep');

    const faq = db.prepare(`INSERT INTO faqs (question, answer, category, sort_order) VALUES (?,?,?,?)`);
    faq.run('Who can donate blood?', 'Anyone aged 18-65, weighing at least 50 kg, and in good health can donate blood.', 'eligibility', 1);
    faq.run('How often can I donate?', 'Whole blood every 3 months; platelets every 2 weeks (up to 24 times a year).', 'eligibility', 2);
    faq.run('Is blood donation safe?', 'Yes. Sterile, single-use equipment is used for every donor.', 'safety', 3);

    // Welcome notification for the donor
    db.prepare(`INSERT INTO notifications (user_id, title, message, type) VALUES (?,?,?,?)`)
      .run(donorUserId, 'Welcome to TN Blood Bank', 'Thank you for registering as a donor. Your donor code is TN-CH-05248.', 'success');
  });

  tx();
  console.log('[seed] Demo data inserted.');
}

seed();

/* ============================================================================
 * 4. HELPERS
 * ========================================================================== */

const ok = (res, data = null, message = 'Success', meta) =>
  res.json({ success: true, message, data, ...(meta ? { meta } : {}) });
const created = (res, data = null, message = 'Created') =>
  res.status(201).json({ success: true, message, data });
const fail = (res, status, message, errors) =>
  res.status(status).json({ success: false, message, ...(errors ? { errors } : {}) });

class ApiError extends Error {
  constructor(status, message, errors) {
    super(message);
    this.status = status;
    this.errors = errors;
  }
  static badRequest(m = 'Bad request', e) { return new ApiError(400, m, e); }
  static unauthorized(m = 'Unauthorized') { return new ApiError(401, m); }
  static forbidden(m = 'Forbidden') { return new ApiError(403, m); }
  static notFound(m = 'Not found') { return new ApiError(404, m); }
  static conflict(m = 'Conflict') { return new ApiError(409, m); }
}

const asyncHandler = (fn) => (req, res, next) => Promise.resolve(fn(req, res, next)).catch(next);

const pad = (n, len = 4) => String(n).padStart(len, '0');

function nextCode(table, column, prefix, width = 4) {
  const row = db.prepare(`SELECT ${column} AS code FROM ${table} WHERE ${column} LIKE ? ORDER BY id DESC LIMIT 1`).get(`${prefix}%`);
  let n = 1;
  if (row && row.code) {
    const m = String(row.code).match(/(\d+)$/);
    if (m) n = parseInt(m[1], 10) + 1;
  }
  return `${prefix}${pad(n, width)}`;
}

const genDonorCode = (district) => {
  const abbr = (district || 'CH').slice(0, 2).toUpperCase();
  return nextCode('donors', 'donor_code', `TN-${abbr}-`, 5);
};
const genRequestCode = () => nextCode('blood_requests', 'request_code', `REQ-${new Date().getFullYear()}-`, 4);
const genEmergencyCode = () => nextCode('emergency_requests', 'emergency_code', `EMG-${new Date().getFullYear()}-`, 4);
const genCampCode = () => nextCode('camps', 'camp_code', `CAMP-${new Date().getFullYear()}-`, 4);
const genHospitalCode = (district) => nextCode('hospitals', 'hospital_code', `HOSP-${(district || 'CH').slice(0, 2).toUpperCase()}-`, 4);

const inventoryStatus = (units) =>
  units >= CONSTANTS.INVENTORY.AVAILABLE_MIN ? 'available'
    : units >= CONSTANTS.INVENTORY.LIMITED_MIN ? 'limited'
      : 'unavailable';

/* ============================================================================
 * 5. AUTH
 * ========================================================================== */

const signAccessToken = (user) =>
  jwt.sign({ id: user.id, email: user.email, role: user.role }, CONFIG.jwtSecret, { expiresIn: CONFIG.jwtExpiresIn });

const signRefreshToken = (user) =>
  jwt.sign({ id: user.id, type: 'refresh' }, CONFIG.jwtRefreshSecret, { expiresIn: CONFIG.jwtRefreshExpiresIn });

function authenticate(req, _res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : null;
  if (token) {
    try {
      const payload = jwt.verify(token, CONFIG.jwtSecret);
      const user = db.prepare('SELECT id, email, full_name, phone, role, is_active FROM users WHERE id = ?').get(payload.id);
      if (user && user.is_active) req.user = user;
    } catch (_) { /* ignore invalid token */ }
  }
  next();
}

const requireAuth = (req, _res, next) => req.user ? next() : next(ApiError.unauthorized('Authentication required'));
const requireRole = (...roles) => (req, _res, next) =>
  req.user && roles.includes(req.user.role) ? next() : next(ApiError.forbidden('Insufficient permissions'));

const loadDonor = (req, _res, next) => {
  if (req.user) req.donor = db.prepare('SELECT * FROM donors WHERE user_id = ?').get(req.user.id) || null;
  next();
};

/* ============================================================================
 * 6. SERVICES
 * ========================================================================== */

const authService = {
  register({ email, password, fullName, phone, role, ...extra }) {
    if (!CONSTANTS.ROLES.includes(role)) throw ApiError.badRequest('Invalid role');
    if (db.prepare('SELECT id FROM users WHERE email = ?').get(email)) throw ApiError.conflict('Email already registered');

    const tx = db.transaction(() => {
      const userId = db.prepare(
        'INSERT INTO users (email, password_hash, full_name, phone, role) VALUES (?,?,?,?,?)'
      ).run(email, bcrypt.hashSync(password, 10), fullName, phone || null, role).lastInsertRowid;

      let profile = null;
      if (role === 'donor') {
        const code = genDonorCode(extra.district);
        db.prepare(
          `INSERT INTO donors (user_id, donor_code, blood_group, date_of_birth, gender, weight_kg, district, address)
           VALUES (?,?,?,?,?,?,?,?)`
        ).run(userId, code, extra.bloodGroup || 'O+', extra.dateOfBirth || null, extra.gender || null,
          extra.weightKg || null, extra.district || null, extra.address || null);
        profile = db.prepare('SELECT * FROM donors WHERE user_id = ?').get(userId);
      } else if (role === 'hospital') {
        const code = genHospitalCode(extra.district);
        db.prepare(
          `INSERT INTO hospitals (user_id, hospital_code, name, district, address, contact_person, contact_number)
           VALUES (?,?,?,?,?,?,?)`
        ).run(userId, code, extra.name || fullName, extra.district || null, extra.address || null,
          extra.contactPerson || fullName, phone || null);
        profile = db.prepare('SELECT * FROM hospitals WHERE user_id = ?').get(userId);
      } else if (role === 'bloodbank') {
        const license = extra.licenseNumber || nextCode('blood_banks', 'license_number', 'TN-BB-', 4);
        db.prepare(
          `INSERT INTO blood_banks (user_id, license_number, name, district, address, contact_number, email)
           VALUES (?,?,?,?,?,?,?)`
        ).run(userId, license, extra.name || fullName, extra.district || null, extra.address || null, phone || null, email);
        profile = db.prepare('SELECT * FROM blood_banks WHERE user_id = ?').get(userId);
      }
      return { userId, profile };
    });

    const { userId, profile } = tx();
    const user = db.prepare('SELECT id, email, full_name, phone, role FROM users WHERE id = ?').get(userId);
    return { user, profile, accessToken: signAccessToken(user), refreshToken: signRefreshToken(user) };
  },

  login({ email, password }) {
    const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email);
    if (!user || !bcrypt.compareSync(password, user.password_hash)) throw ApiError.unauthorized('Invalid email or password');
    if (!user.is_active) throw ApiError.forbidden('Account is disabled');
    const safe = { id: user.id, email: user.email, full_name: user.full_name, phone: user.phone, role: user.role };
    return { user: safe, accessToken: signAccessToken(safe), refreshToken: signRefreshToken(safe) };
  },

  me(userId) {
    const user = db.prepare('SELECT id, email, full_name, phone, role, created_at FROM users WHERE id = ?').get(userId);
    if (!user) throw ApiError.notFound('User not found');
    let profile = null;
    if (user.role === 'donor') profile = db.prepare('SELECT * FROM donors WHERE user_id = ?').get(userId);
    else if (user.role === 'hospital') profile = db.prepare('SELECT * FROM hospitals WHERE user_id = ?').get(userId);
    else if (user.role === 'bloodbank') profile = db.prepare('SELECT * FROM blood_banks WHERE user_id = ?').get(userId);
    return { user, profile };
  },

  refresh(token) {
    let payload;
    try { payload = jwt.verify(token, CONFIG.jwtRefreshSecret); }
    catch (_) { throw ApiError.unauthorized('Invalid refresh token'); }
    const user = db.prepare('SELECT id, email, full_name, phone, role FROM users WHERE id = ?').get(payload.id);
    if (!user) throw ApiError.unauthorized('User not found');
    return { accessToken: signAccessToken(user), refreshToken: signRefreshToken(user) };
  },
};

const inventoryService = {
  availability({ bloodGroup, district, component }) {
    const where = [];
    const params = [];
    if (bloodGroup) { where.push('i.blood_group = ?'); params.push(bloodGroup); }
    if (component) { where.push('i.component = ?'); params.push(component); }
    if (district) { where.push('b.district = ?'); params.push(district); }
    const sql = `
      SELECT i.blood_group, i.component, i.units, b.id AS blood_bank_id, b.name AS blood_bank_name,
             b.district, b.address, b.contact_number
      FROM blood_inventory i JOIN blood_banks b ON b.id = i.blood_bank_id
      ${where.length ? 'WHERE ' + where.join(' AND ') : ''}
      ORDER BY i.blood_group, i.units DESC`;
    const rows = db.prepare(sql).all(...params);
    return rows.map((r) => ({ ...r, status: inventoryStatus(r.units) }));
  },

  summary() {
    const rows = db.prepare(
      `SELECT blood_group, SUM(units) AS units FROM blood_inventory GROUP BY blood_group ORDER BY blood_group`
    ).all();
    const map = Object.fromEntries(CONSTANTS.BLOOD_GROUPS.map((g) => [g, 0]));
    rows.forEach((r) => { map[r.blood_group] = r.units; });
    return Object.entries(map).map(([blood_group, units]) => ({ blood_group, units, status: inventoryStatus(units) }));
  },

  listBanks({ district, search }) {
    const where = [];
    const params = [];
    if (district) { where.push('district = ?'); params.push(district); }
    if (search) { where.push('name LIKE ?'); params.push(`%${search}%`); }
    return db.prepare(`SELECT * FROM blood_banks ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY name`).all(...params);
  },

  updateStock(bloodBankId, { bloodGroup, component, units }) {
    db.prepare(
      `INSERT INTO blood_inventory (blood_bank_id, blood_group, component, units, updated_at)
       VALUES (?,?,?,?,datetime('now'))
       ON CONFLICT(blood_bank_id, blood_group, component)
       DO UPDATE SET units = excluded.units, updated_at = datetime('now')`
    ).run(bloodBankId, bloodGroup, component || 'Whole Blood', units);
    return db.prepare('SELECT * FROM blood_inventory WHERE blood_bank_id = ? AND blood_group = ? AND component = ?')
      .get(bloodBankId, bloodGroup, component || 'Whole Blood');
  },
};

const requestsService = {
  create(payload, userId) {
    const code = genRequestCode();
    const id = db.prepare(
      `INSERT INTO blood_requests (request_code, requester_id, patient_name, blood_group, component, units, urgency,
        hospital_name, district, contact_person, contact_number, required_by, notes)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(code, userId || null, payload.patientName, payload.bloodGroup, payload.component || 'Whole Blood',
      payload.units || 1, payload.urgency || 'medium', payload.hospitalName || null, payload.district || null,
      payload.contactPerson || null, payload.contactNumber || null, payload.requiredBy || null, payload.notes || null).lastInsertRowid;
    return db.prepare('SELECT * FROM blood_requests WHERE id = ?').get(id);
  },

  list({ status, bloodGroup, district, requesterId }) {
    const where = [];
    const params = [];
    if (status) { where.push('status = ?'); params.push(status); }
    if (bloodGroup) { where.push('blood_group = ?'); params.push(bloodGroup); }
    if (district) { where.push('district = ?'); params.push(district); }
    if (requesterId) { where.push('requester_id = ?'); params.push(requesterId); }
    return db.prepare(`SELECT * FROM blood_requests ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY created_at DESC`).all(...params);
  },

  get(id) {
    const row = db.prepare('SELECT * FROM blood_requests WHERE id = ?').get(id);
    if (!row) throw ApiError.notFound('Blood request not found');
    return row;
  },

  updateStatus(id, status, bloodBankId) {
    if (!CONSTANTS.REQUEST_STATUSES.includes(status)) throw ApiError.badRequest('Invalid status');
    const row = this.get(id);
    db.prepare(`UPDATE blood_requests SET status = ?, blood_bank_id = COALESCE(?, blood_bank_id), updated_at = datetime('now') WHERE id = ?`)
      .run(status, bloodBankId || null, id);
    return db.prepare('SELECT * FROM blood_requests WHERE id = ?').get(id);
  },
};

const emergencyService = {
  create(payload, userId) {
    const code = genEmergencyCode();
    const id = db.prepare(
      `INSERT INTO emergency_requests (emergency_code, requester_id, patient_name, blood_group, units, hospital_name, district, contact_number, location, notes)
       VALUES (?,?,?,?,?,?,?,?,?,?)`
    ).run(code, userId || null, payload.patientName, payload.bloodGroup, payload.units || 1,
      payload.hospitalName || null, payload.district || null, payload.contactNumber, payload.location || null, payload.notes || null).lastInsertRowid;
    return db.prepare('SELECT * FROM emergency_requests WHERE id = ?').get(id);
  },
  list({ status, bloodGroup, district }) {
    const where = [];
    const params = [];
    if (status) { where.push('status = ?'); params.push(status); }
    if (bloodGroup) { where.push('blood_group = ?'); params.push(bloodGroup); }
    if (district) { where.push('district = ?'); params.push(district); }
    return db.prepare(`SELECT * FROM emergency_requests ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY created_at DESC`).all(...params);
  },
  get(id) {
    const row = db.prepare('SELECT * FROM emergency_requests WHERE id = ?').get(id);
    if (!row) throw ApiError.notFound('Emergency request not found');
    return row;
  },
  updateStatus(id, status) {
    if (!CONSTANTS.EMERGENCY_STATUSES.includes(status)) throw ApiError.badRequest('Invalid status');
    this.get(id);
    db.prepare(`UPDATE emergency_requests SET status = ?, updated_at = datetime('now') WHERE id = ?`).run(status, id);
    return db.prepare('SELECT * FROM emergency_requests WHERE id = ?').get(id);
  },
};

const donorsService = {
  getByUserId(userId) {
    const row = db.prepare('SELECT * FROM donors WHERE user_id = ?').get(userId);
    if (!row) throw ApiError.notFound('Donor profile not found');
    return row;
  },
  get(id) {
    const row = db.prepare('SELECT * FROM donors WHERE id = ?').get(id);
    if (!row) throw ApiError.notFound('Donor not found');
    return row;
  },
  update(userId, payload) {
    const donor = this.getByUserId(userId);
    const fields = ['blood_group', 'date_of_birth', 'gender', 'weight_kg', 'district', 'address', 'is_available'];
    const map = { bloodGroup: 'blood_group', dateOfBirth: 'date_of_birth', weightKg: 'weight_kg' };
    const sets = [];
    const params = [];
    for (const [k, v] of Object.entries(payload)) {
      const col = map[k] || k;
      if (fields.includes(col) && v !== undefined) { sets.push(`${col} = ?`); params.push(v); }
    }
    if (sets.length) {
      params.push(donor.id);
      db.prepare(`UPDATE donors SET ${sets.join(', ')}, updated_at = datetime('now') WHERE id = ?`).run(...params);
    }
    return this.get(donor.id);
  },
  history(userId) {
    const donor = this.getByUserId(userId);
    return db.prepare('SELECT * FROM donations WHERE donor_id = ? ORDER BY donation_date DESC').all(donor.id);
  },
  list({ bloodGroup, district, available }) {
    const where = [];
    const params = [];
    if (bloodGroup) { where.push('blood_group = ?'); params.push(bloodGroup); }
    if (district) { where.push('district = ?'); params.push(district); }
    if (available !== undefined) { where.push('is_available = ?'); params.push(available ? 1 : 0); }
    return db.prepare(`SELECT id, donor_code, blood_group, district, total_donations, lives_impacted, is_available FROM donors ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY total_donations DESC`).all(...params);
  },
};

const campsService = {
  list({ status, district, search }) {
    const where = [];
    const params = [];
    if (status) { where.push('status = ?'); params.push(status); }
    if (district) { where.push('district = ?'); params.push(district); }
    if (search) { where.push('(title LIKE ? OR organizer LIKE ?)'); params.push(`%${search}%`, `%${search}%`); }
    return db.prepare(`SELECT * FROM camps ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY camp_date ASC`).all(...params);
  },
  get(id) {
    const row = db.prepare('SELECT * FROM camps WHERE id = ?').get(id);
    if (!row) throw ApiError.notFound('Camp not found');
    return row;
  },
  create(payload, createdBy) {
    const code = genCampCode();
    const id = db.prepare(
      `INSERT INTO camps (camp_code, title, organizer, district, venue, address, camp_date, start_time, end_time, expected_donors, contact_person, contact_number, created_by)
       VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?)`
    ).run(code, payload.title, payload.organizer || null, payload.district || null, payload.venue || null,
      payload.address || null, payload.campDate, payload.startTime || null, payload.endTime || null,
      payload.expectedDonors || 0, payload.contactPerson || null, payload.contactNumber || null, createdBy || null).lastInsertRowid;
    return this.get(id);
  },
  update(id, payload) {
    this.get(id);
    const map = { campDate: 'camp_date', startTime: 'start_time', endTime: 'end_time', expectedDonors: 'expected_donors', contactPerson: 'contact_person', contactNumber: 'contact_number' };
    const allowed = ['title', 'organizer', 'district', 'venue', 'address', 'status'];
    const sets = [];
    const params = [];
    for (const [k, v] of Object.entries(payload)) {
      const col = map[k] || k;
      if ((allowed.includes(col) || Object.values(map).includes(col)) && v !== undefined) { sets.push(`${col} = ?`); params.push(v); }
    }
    if (sets.length) { params.push(id); db.prepare(`UPDATE camps SET ${sets.join(', ')} WHERE id = ?`).run(...params); }
    return this.get(id);
  },
  register(campId, donorId) {
    const camp = this.get(campId);
    if (camp.status === 'cancelled' || camp.status === 'completed') throw ApiError.badRequest('Camp is not open for registration');
    const existing = db.prepare('SELECT id FROM camp_registrations WHERE camp_id = ? AND donor_id = ?').get(campId, donorId);
    if (existing) throw ApiError.conflict('Already registered for this camp');
    db.prepare('INSERT INTO camp_registrations (camp_id, donor_id) VALUES (?,?)').run(campId, donorId);
    db.prepare('UPDATE camps SET registered_count = registered_count + 1 WHERE id = ?').run(campId);
    return { camp: this.get(campId), registration: db.prepare('SELECT * FROM camp_registrations WHERE camp_id = ? AND donor_id = ?').get(campId, donorId) };
  },
  cancelRegistration(campId, donorId) {
    const reg = db.prepare('SELECT * FROM camp_registrations WHERE camp_id = ? AND donor_id = ?').get(campId, donorId);
    if (!reg) throw ApiError.notFound('Registration not found');
    db.prepare('DELETE FROM camp_registrations WHERE id = ?').run(reg.id);
    db.prepare('UPDATE camps SET registered_count = MAX(registered_count - 1, 0) WHERE id = ?').run(campId);
    return { cancelled: true };
  },
  listRegistrations(campId) {
    return db.prepare(
      `SELECT r.*, d.donor_code, d.blood_group, d.district FROM camp_registrations r
       JOIN donors d ON d.id = r.donor_id WHERE r.camp_id = ? ORDER BY r.created_at DESC`
    ).all(campId);
  },
  createRequest(payload) {
    const id = db.prepare(
      `INSERT INTO camp_requests (organization, camp_date, expected_donors, venue_address, district, contact_person, contact_number, notes)
       VALUES (?,?,?,?,?,?,?,?)`
    ).run(payload.organization, payload.campDate, payload.expectedDonors || 0, payload.venueAddress || null,
      payload.district || null, payload.contactPerson || null, payload.contactNumber || null, payload.notes || null).lastInsertRowid;
    return db.prepare('SELECT * FROM camp_requests WHERE id = ?').get(id);
  },
  listRequests({ status }) {
    const where = status ? 'WHERE status = ?' : '';
    return db.prepare(`SELECT * FROM camp_requests ${where} ORDER BY created_at DESC`).all(...(status ? [status] : []));
  },
  updateRequestStatus(id, status) {
    const row = db.prepare('SELECT * FROM camp_requests WHERE id = ?').get(id);
    if (!row) throw ApiError.notFound('Camp request not found');
    db.prepare('UPDATE camp_requests SET status = ? WHERE id = ?').run(status, id);
    return db.prepare('SELECT * FROM camp_requests WHERE id = ?').get(id);
  },
};

const donationsService = {
  record(payload) {
    const donor = db.prepare('SELECT * FROM donors WHERE id = ?').get(payload.donorId);
    if (!donor) throw ApiError.notFound('Donor not found');
    const id = db.prepare(
      `INSERT INTO donations (donor_id, blood_bank_id, camp_id, blood_group, component, units, donation_date, notes)
       VALUES (?,?,?,?,?,?,?,?)`
    ).run(payload.donorId, payload.bloodBankId || null, payload.campId || null,
      payload.bloodGroup || donor.blood_group, payload.component || 'Whole Blood', payload.units || 1,
      payload.donationDate, payload.notes || null).lastInsertRowid;
    db.prepare(
      `UPDATE donors SET total_donations = total_donations + 1, lives_impacted = lives_impacted + 3,
       last_donation = ?, updated_at = datetime('now') WHERE id = ?`
    ).run(payload.donationDate, payload.donorId);
    return db.prepare('SELECT * FROM donations WHERE id = ?').get(id);
  },
  list({ donorId, bloodBankId }) {
    const where = [];
    const params = [];
    if (donorId) { where.push('donor_id = ?'); params.push(donorId); }
    if (bloodBankId) { where.push('blood_bank_id = ?'); params.push(bloodBankId); }
    return db.prepare(`SELECT * FROM donations ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY donation_date DESC`).all(...params);
  },
  get(id) {
    const row = db.prepare('SELECT * FROM donations WHERE id = ?').get(id);
    if (!row) throw ApiError.notFound('Donation not found');
    return row;
  },
};

const ELIGIBILITY_QUESTIONS = [
  { id: 'age', question: 'Are you between 18 and 65 years old?', required: true },
  { id: 'weight', question: 'Do you weigh at least 50 kg?', required: true },
  { id: 'health', question: 'Are you in good general health today?', required: true },
  { id: 'lastDonation', question: 'Has it been at least 3 months since your last donation?', required: true },
  { id: 'medication', question: 'Are you currently free from antibiotics/medication?', required: true },
  { id: 'tattoo', question: 'Have you had no tattoo/piercing in the last 6 months?', required: true },
  { id: 'illness', question: 'Are you free from fever/cold/flu in the last 7 days?', required: true },
];

const eligibilityService = {
  getQuestions() { return ELIGIBILITY_QUESTIONS; },
  getCriteria() {
    return {
      age: '18 - 65 years',
      weight: 'At least 50 kg',
      haemoglobin: 'At least 12.5 g/dL',
      interval: '3 months between whole-blood donations',
      bloodPressure: 'Within normal range',
    };
  },
  evaluate(answers) {
    const failed = [];
    for (const q of ELIGIBILITY_QUESTIONS) {
      const val = answers[q.id];
      if (val === false || val === 'no' || val === 0) failed.push(q.id);
    }
    const eligible = failed.length === 0;
    return {
      eligible,
      failedCriteria: failed,
      reason: eligible ? 'You meet all the basic eligibility criteria.' : `You did not meet: ${failed.join(', ')}.`,
    };
  },
  check(answers, donorId) {
    const result = this.evaluate(answers);
    db.prepare('INSERT INTO eligibility_checks (donor_id, answers, eligible, reason) VALUES (?,?,?,?)')
      .run(donorId || null, JSON.stringify(answers), result.eligible ? 1 : 0, result.reason);
    return result;
  },
  history(donorId) {
    return db.prepare('SELECT * FROM eligibility_checks WHERE donor_id = ? ORDER BY created_at DESC').all(donorId);
  },
};

const feedbackService = {
  create(payload, attachmentPath) {
    const id = db.prepare(
      `INSERT INTO feedback (user_id, name, email, category, rating, subject, message, attachment_path)
       VALUES (?,?,?,?,?,?,?,?)`
    ).run(payload.userId || null, payload.name || null, payload.email || null, payload.category || 'general',
      payload.rating || null, payload.subject || null, payload.message, attachmentPath || null).lastInsertRowid;
    return db.prepare('SELECT * FROM feedback WHERE id = ?').get(id);
  },
  list({ status, category }) {
    const where = [];
    const params = [];
    if (status) { where.push('status = ?'); params.push(status); }
    if (category) { where.push('category = ?'); params.push(category); }
    return db.prepare(`SELECT * FROM feedback ${where.length ? 'WHERE ' + where.join(' AND ') : ''} ORDER BY created_at DESC`).all(...params);
  },
  get(id) {
    const row = db.prepare('SELECT * FROM feedback WHERE id = ?').get(id);
    if (!row) throw ApiError.notFound('Feedback not found');
    return row;
  },
  updateStatus(id, status) {
    if (!CONSTANTS.FEEDBACK_STATUSES.includes(status)) throw ApiError.badRequest('Invalid status');
    this.get(id);
    db.prepare('UPDATE feedback SET status = ? WHERE id = ?').run(status, id);
    return this.get(id);
  },
};

const notificationsService = {
  list(userId) { return db.prepare('SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC').all(userId); },
  unreadCount(userId) { return db.prepare('SELECT COUNT(*) AS c FROM notifications WHERE user_id = ? AND is_read = 0').get(userId).c; },
  markRead(id, userId) {
    const row = db.prepare('SELECT * FROM notifications WHERE id = ? AND user_id = ?').get(id, userId);
    if (!row) throw ApiError.notFound('Notification not found');
    db.prepare('UPDATE notifications SET is_read = 1 WHERE id = ?').run(id);
    return db.prepare('SELECT * FROM notifications WHERE id = ?').get(id);
  },
  markAllRead(userId) {
    db.prepare('UPDATE notifications SET is_read = 1 WHERE user_id = ?').run(userId);
    return { updated: true };
  },
  create(userId, { title, message, type }) {
    const id = db.prepare('INSERT INTO notifications (user_id, title, message, type) VALUES (?,?,?,?)')
      .run(userId, title, message, type || 'info').lastInsertRowid;
    return db.prepare('SELECT * FROM notifications WHERE id = ?').get(id);
  },
};

const contentService = {
  listAnnouncements() { return db.prepare('SELECT * FROM announcements WHERE is_active = 1 ORDER BY created_at DESC').all(); },
  listHealthTips() { return db.prepare('SELECT * FROM health_tips ORDER BY id').all(); },
  listFaqs() { return db.prepare('SELECT * FROM faqs ORDER BY sort_order, id').all(); },
  homeStats() {
    return {
      registeredDonors: db.prepare('SELECT COUNT(*) AS c FROM donors').get().c,
      bloodBanks: db.prepare('SELECT COUNT(*) AS c FROM blood_banks').get().c,
      bloodUnits: db.prepare('SELECT COALESCE(SUM(units),0) AS c FROM blood_inventory').get().c,
      donationCamps: db.prepare('SELECT COUNT(*) AS c FROM camps').get().c,
    };
  },
};

const adminService = {
  stats() {
    return {
      totalDonors: db.prepare('SELECT COUNT(*) AS c FROM donors').get().c,
      totalHospitals: db.prepare('SELECT COUNT(*) AS c FROM hospitals').get().c,
      totalBloodBanks: db.prepare('SELECT COUNT(*) AS c FROM blood_banks').get().c,
      totalRequests: db.prepare('SELECT COUNT(*) AS c FROM blood_requests').get().c,
      pendingRequests: db.prepare("SELECT COUNT(*) AS c FROM blood_requests WHERE status = 'pending'").get().c,
      openEmergencies: db.prepare("SELECT COUNT(*) AS c FROM emergency_requests WHERE status = 'open'").get().c,
      totalDonations: db.prepare('SELECT COUNT(*) AS c FROM donations').get().c,
      totalUnits: db.prepare('SELECT COALESCE(SUM(units),0) AS c FROM blood_inventory').get().c,
      totalCamps: db.prepare('SELECT COUNT(*) AS c FROM camps').get().c,
      newFeedback: db.prepare("SELECT COUNT(*) AS c FROM feedback WHERE status = 'new'").get().c,
    };
  },
  bloodGroupDistribution() {
    const rows = db.prepare('SELECT blood_group, SUM(units) AS units FROM blood_inventory GROUP BY blood_group').all();
    const map = Object.fromEntries(CONSTANTS.BLOOD_GROUPS.map((g) => [g, 0]));
    rows.forEach((r) => { map[r.blood_group] = r.units; });
    return Object.entries(map).map(([blood_group, units]) => ({ blood_group, units }));
  },
  monthlyDonations() {
    return db.prepare(
      `SELECT substr(donation_date,1,7) AS month, COUNT(*) AS donations, SUM(units) AS units
       FROM donations GROUP BY month ORDER BY month`
    ).all();
  },
  dashboard() {
    return {
      stats: this.stats(),
      bloodGroupDistribution: this.bloodGroupDistribution(),
      monthlyDonations: this.monthlyDonations(),
      recentRequests: db.prepare('SELECT * FROM blood_requests ORDER BY created_at DESC LIMIT 5').all(),
      recentEmergencies: db.prepare('SELECT * FROM emergency_requests ORDER BY created_at DESC LIMIT 5').all(),
    };
  },
  listHospitals() { return db.prepare('SELECT * FROM hospitals ORDER BY created_at DESC').all(); },
  listBloodBanks() { return db.prepare('SELECT * FROM blood_banks ORDER BY created_at DESC').all(); },
  verifyHospital(id, verified) {
    const row = db.prepare('SELECT * FROM hospitals WHERE id = ?').get(id);
    if (!row) throw ApiError.notFound('Hospital not found');
    db.prepare('UPDATE hospitals SET is_verified = ? WHERE id = ?').run(verified ? 1 : 0, id);
    return db.prepare('SELECT * FROM hospitals WHERE id = ?').get(id);
  },
  verifyBloodBank(id, verified) {
    const row = db.prepare('SELECT * FROM blood_banks WHERE id = ?').get(id);
    if (!row) throw ApiError.notFound('Blood bank not found');
    db.prepare('UPDATE blood_banks SET is_verified = ? WHERE id = ?').run(verified ? 1 : 0, id);
    return db.prepare('SELECT * FROM blood_banks WHERE id = ?').get(id);
  },
};

const assistantService = {
  RULES: [
    { match: /eligib|can i donate|who can donate/i, reply: 'You can donate if you are 18-65 years old, weigh at least 50 kg, and are in good health. Use the Eligibility Checker for a personalised result.' },
    { match: /how often|frequency|interval/i, reply: 'Whole blood can be donated every 3 months. Platelets can be donated every 2 weeks, up to 24 times a year.' },
    { match: /safe|risk|hurt|pain/i, reply: 'Blood donation is very safe. Sterile, single-use needles and equipment are used for every donor.' },
    { match: /find|near|where|bank|availability/i, reply: 'Use the Blood Availability search to find nearby blood banks by blood group and district.' },
    { match: /emergency|urgent|immediate/i, reply: 'For emergencies, submit an Emergency Request with your blood group, hospital and contact number. Nearby banks are alerted immediately.' },
    { match: /camp|drive/i, reply: 'Upcoming donation camps are listed on the Camps page. You can register for any camp directly.' },
    { match: /prepare|before|eat|eat before/i, reply: 'Eat a healthy meal and drink plenty of water before donating. Avoid alcohol and get good sleep.' },
    { match: /after|recover|rest/i, reply: 'After donating, rest for 10-15 minutes, drink fluids, and avoid heavy lifting for the rest of the day.' },
  ],
  chat(message) {
    const text = String(message || '');
    for (const rule of this.RULES) if (rule.match.test(text)) return { reply: rule.reply };
    return { reply: 'I can help with blood donation eligibility, finding blood banks, emergency requests, camps, and donation tips. What would you like to know?' };
  },
  suggestBanks(bloodGroup) {
    const rows = db.prepare(
      `SELECT b.id, b.name, b.district, b.contact_number, i.units, i.blood_group
       FROM blood_inventory i JOIN blood_banks b ON b.id = i.blood_bank_id
       WHERE i.blood_group = ? AND i.units > 0 ORDER BY i.units DESC LIMIT 5`
    ).all(bloodGroup);
    return rows.map((r) => ({ ...r, status: inventoryStatus(r.units) }));
  },
};

/* ============================================================================
 * 7. VALIDATION HELPERS
 * ========================================================================== */

function validateBody(rules) {
  return (req, _res, next) => {
    const errors = [];
    for (const [field, rule] of Object.entries(rules)) {
      const value = req.body[field];
      if (rule.required && (value === undefined || value === null || value === '')) {
        errors.push({ field, message: `${field} is required` });
        continue;
      }
      if (value === undefined || value === null || value === '') continue;
      if (rule.type === 'email' && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(value)) errors.push({ field, message: 'Invalid email' });
      if (rule.type === 'number' && isNaN(Number(value))) errors.push({ field, message: 'Must be a number' });
      if (rule.enum && !rule.enum.includes(value)) errors.push({ field, message: `Must be one of: ${rule.enum.join(', ')}` });
      if (rule.min !== undefined && Number(value) < rule.min) errors.push({ field, message: `Must be at least ${rule.min}` });
    }
    if (errors.length) return next(ApiError.badRequest('Validation failed', errors));
    next();
  };
}

/* ============================================================================
 * 8. ROUTES
 * ========================================================================== */

const app = express();
app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));
app.use(cors({ origin: CONFIG.corsOrigin }));
app.use(authenticate);

const api = express.Router();

// ---- Health / meta ----
app.get('/health', (_req, res) => ok(res, { status: 'healthy', uptime: process.uptime(), timestamp: new Date().toISOString() }));
app.get('/api/meta', (_req, res) => ok(res, {
  bloodGroups: CONSTANTS.BLOOD_GROUPS, components: CONSTANTS.COMPONENTS, districts: CONSTANTS.DISTRICTS,
  roles: CONSTANTS.ROLES, requestStatuses: CONSTANTS.REQUEST_STATUSES, emergencyStatuses: CONSTANTS.EMERGENCY_STATUSES,
  campStatuses: CONSTANTS.CAMP_STATUSES, urgencyLevels: CONSTANTS.URGENCY_LEVELS, feedbackCategories: CONSTANTS.FEEDBACK_CATEGORIES,
}));

// ---- Auth ----
api.post('/auth/register', validateBody({
  email: { required: true, type: 'email' }, password: { required: true }, fullName: { required: true },
  role: { required: true, enum: CONSTANTS.ROLES },
}), asyncHandler((req, res) => created(res, authService.register(req.body), 'Registration successful')));

api.post('/auth/login', validateBody({ email: { required: true, type: 'email' }, password: { required: true } }),
  asyncHandler((req, res) => ok(res, authService.login(req.body), 'Login successful')));

api.post('/auth/refresh', validateBody({ refreshToken: { required: true } }),
  asyncHandler((req, res) => ok(res, authService.refresh(req.body.refreshToken), 'Token refreshed')));

api.get('/auth/me', requireAuth, asyncHandler((req, res) => ok(res, authService.me(req.user.id))));
api.post('/auth/logout', requireAuth, asyncHandler((_req, res) => ok(res, { loggedOut: true }, 'Logged out')));

// ---- Inventory ----
api.get('/inventory/availability', asyncHandler((req, res) => ok(res, inventoryService.availability(req.query))));
api.get('/inventory/summary', asyncHandler((_req, res) => ok(res, inventoryService.summary())));
api.get('/inventory/blood-banks', asyncHandler((req, res) => ok(res, inventoryService.listBanks(req.query))));
api.put('/inventory/stock', requireAuth, requireRole('bloodbank', 'admin'), validateBody({
  bloodGroup: { required: true, enum: CONSTANTS.BLOOD_GROUPS }, units: { required: true, type: 'number', min: 0 },
}), asyncHandler((req, res) => {
  const bank = db.prepare('SELECT * FROM blood_banks WHERE user_id = ?').get(req.user.id);
  const bankId = req.user.role === 'admin' ? (req.body.bloodBankId || bank?.id) : bank?.id;
  if (!bankId) throw ApiError.badRequest('No blood bank associated with this account');
  ok(res, inventoryService.updateStock(bankId, req.body), 'Stock updated');
}));

// ---- Blood requests ----
api.post('/requests', validateBody({
  patientName: { required: true }, bloodGroup: { required: true, enum: CONSTANTS.BLOOD_GROUPS },
  units: { type: 'number', min: 1 }, urgency: { enum: CONSTANTS.URGENCY_LEVELS },
}), asyncHandler((req, res) => created(res, requestsService.create(req.body, req.user?.id), 'Blood request submitted')));

api.get('/requests', asyncHandler((req, res) => ok(res, requestsService.list(req.query))));
api.get('/requests/:id', asyncHandler((req, res) => ok(res, requestsService.get(Number(req.params.id)))));
api.patch('/requests/:id/status', requireAuth, requireRole('bloodbank', 'hospital', 'admin'), validateBody({
  status: { required: true, enum: CONSTANTS.REQUEST_STATUSES },
}), asyncHandler((req, res) => {
  const bank = db.prepare('SELECT * FROM blood_banks WHERE user_id = ?').get(req.user.id);
  ok(res, requestsService.updateStatus(Number(req.params.id), req.body.status, bank?.id), 'Status updated');
}));

// ---- Emergency ----
api.post('/emergency', validateBody({
  patientName: { required: true }, bloodGroup: { required: true, enum: CONSTANTS.BLOOD_GROUPS }, contactNumber: { required: true },
}), asyncHandler((req, res) => created(res, emergencyService.create(req.body, req.user?.id), 'Emergency request created')));

api.get('/emergency', asyncHandler((req, res) => ok(res, emergencyService.list(req.query))));
api.get('/emergency/:id', asyncHandler((req, res) => ok(res, emergencyService.get(Number(req.params.id)))));
api.patch('/emergency/:id/status', requireAuth, requireRole('bloodbank', 'hospital', 'admin'), validateBody({
  status: { required: true, enum: CONSTANTS.EMERGENCY_STATUSES },
}), asyncHandler((req, res) => ok(res, emergencyService.updateStatus(Number(req.params.id), req.body.status), 'Status updated')));

// ---- Donors ----
api.get('/donors', asyncHandler((req, res) => ok(res, donorsService.list(req.query))));
api.get('/donors/me', requireAuth, requireRole('donor'), asyncHandler((req, res) => ok(res, donorsService.getByUserId(req.user.id))));
api.put('/donors/me', requireAuth, requireRole('donor'), asyncHandler((req, res) => ok(res, donorsService.update(req.user.id, req.body), 'Profile updated')));
api.get('/donors/me/history', requireAuth, requireRole('donor'), asyncHandler((req, res) => ok(res, donorsService.history(req.user.id))));
api.get('/donors/:id', asyncHandler((req, res) => ok(res, donorsService.get(Number(req.params.id)))));

// ---- Camps ----
api.get('/camps', asyncHandler((req, res) => ok(res, campsService.list(req.query))));
api.get('/camps/:id', asyncHandler((req, res) => ok(res, campsService.get(Number(req.params.id)))));
api.post('/camps', requireAuth, requireRole('bloodbank', 'admin'), validateBody({
  title: { required: true }, campDate: { required: true },
}), asyncHandler((req, res) => created(res, campsService.create(req.body, req.user.id), 'Camp created')));
api.put('/camps/:id', requireAuth, requireRole('bloodbank', 'admin'), asyncHandler((req, res) => ok(res, campsService.update(Number(req.params.id), req.body), 'Camp updated')));
api.post('/camps/:id/register', requireAuth, requireRole('donor'), asyncHandler((req, res) => {
  const donor = donorsService.getByUserId(req.user.id);
  created(res, campsService.register(Number(req.params.id), donor.id), 'Registered for camp');
}));
api.delete('/camps/:id/register', requireAuth, requireRole('donor'), asyncHandler((req, res) => {
  const donor = donorsService.getByUserId(req.user.id);
  ok(res, campsService.cancelRegistration(Number(req.params.id), donor.id), 'Registration cancelled');
}));
api.get('/camps/:id/registrations', requireAuth, requireRole('bloodbank', 'admin'), asyncHandler((req, res) => ok(res, campsService.listRegistrations(Number(req.params.id)))));

api.post('/camp-requests', validateBody({
  organization: { required: true }, campDate: { required: true },
}), asyncHandler((req, res) => created(res, campsService.createRequest(req.body), 'Camp request submitted')));
api.get('/camp-requests', requireAuth, requireRole('admin', 'bloodbank'), asyncHandler((req, res) => ok(res, campsService.listRequests(req.query))));
api.patch('/camp-requests/:id/status', requireAuth, requireRole('admin'), asyncHandler((req, res) => ok(res, campsService.updateRequestStatus(Number(req.params.id), req.body.status), 'Status updated')));

// ---- Donations ----
api.post('/donations', requireAuth, requireRole('bloodbank', 'admin'), validateBody({
  donorId: { required: true, type: 'number' }, donationDate: { required: true },
}), asyncHandler((req, res) => created(res, donationsService.record(req.body), 'Donation recorded')));
api.get('/donations', requireAuth, asyncHandler((req, res) => ok(res, donationsService.list(req.query))));
api.get('/donations/:id', requireAuth, asyncHandler((req, res) => ok(res, donationsService.get(Number(req.params.id)))));

// ---- Eligibility ----
api.get('/eligibility/questions', asyncHandler((_req, res) => ok(res, eligibilityService.getQuestions())));
api.get('/eligibility/criteria', asyncHandler((_req, res) => ok(res, eligibilityService.getCriteria())));
api.post('/eligibility/evaluate', validateBody({ answers: { required: true } }), asyncHandler((req, res) => ok(res, eligibilityService.evaluate(req.body.answers))));
api.post('/eligibility/check', validateBody({ answers: { required: true } }), asyncHandler((req, res) => {
  let donorId = null;
  if (req.user?.role === 'donor') donorId = db.prepare('SELECT id FROM donors WHERE user_id = ?').get(req.user.id)?.id || null;
  ok(res, eligibilityService.check(req.body.answers, donorId));
}));
api.get('/eligibility/history', requireAuth, requireRole('donor'), asyncHandler((req, res) => {
  const donor = donorsService.getByUserId(req.user.id);
  ok(res, eligibilityService.history(donor.id));
}));

// ---- Feedback ----
api.post('/feedback', validateBody({
  message: { required: true }, category: { enum: CONSTANTS.FEEDBACK_CATEGORIES }, rating: { type: 'number', min: 1 },
}), asyncHandler((req, res) => created(res, feedbackService.create({ ...req.body, userId: req.user?.id }), 'Feedback submitted')));
api.get('/feedback', requireAuth, requireRole('admin'), asyncHandler((req, res) => ok(res, feedbackService.list(req.query))));
api.get('/feedback/:id', requireAuth, requireRole('admin'), asyncHandler((req, res) => ok(res, feedbackService.get(Number(req.params.id)))));
api.patch('/feedback/:id/status', requireAuth, requireRole('admin'), validateBody({
  status: { required: true, enum: CONSTANTS.FEEDBACK_STATUSES },
}), asyncHandler((req, res) => ok(res, feedbackService.updateStatus(Number(req.params.id), req.body.status), 'Status updated')));

// ---- Notifications ----
api.get('/notifications', requireAuth, asyncHandler((req, res) => ok(res, notificationsService.list(req.user.id))));
api.get('/notifications/unread-count', requireAuth, asyncHandler((req, res) => ok(res, { count: notificationsService.unreadCount(req.user.id) })));
api.patch('/notifications/:id/read', requireAuth, asyncHandler((req, res) => ok(res, notificationsService.markRead(Number(req.params.id), req.user.id), 'Marked read')));
api.patch('/notifications/read-all', requireAuth, asyncHandler((req, res) => ok(res, notificationsService.markAllRead(req.user.id), 'All marked read')));

// ---- Assistant ----
api.post('/assistant/chat', validateBody({ message: { required: true } }), asyncHandler((req, res) => ok(res, assistantService.chat(req.body.message))));
api.get('/assistant/suggest-banks', asyncHandler((req, res) => ok(res, assistantService.suggestBanks(req.query.bloodGroup))));

// ---- Content ----
api.get('/content/announcements', asyncHandler((_req, res) => ok(res, contentService.listAnnouncements())));
api.get('/content/health-tips', asyncHandler((_req, res) => ok(res, contentService.listHealthTips())));
api.get('/content/faqs', asyncHandler((_req, res) => ok(res, contentService.listFaqs())));
api.get('/content/home-stats', asyncHandler((_req, res) => ok(res, contentService.homeStats())));

// ---- Admin ----
api.get('/admin/stats', requireAuth, requireRole('admin'), asyncHandler((_req, res) => ok(res, adminService.stats())));
api.get('/admin/dashboard', requireAuth, requireRole('admin'), asyncHandler((_req, res) => ok(res, adminService.dashboard())));
api.get('/admin/blood-group-distribution', requireAuth, requireRole('admin'), asyncHandler((_req, res) => ok(res, adminService.bloodGroupDistribution())));
api.get('/admin/monthly-donations', requireAuth, requireRole('admin'), asyncHandler((_req, res) => ok(res, adminService.monthlyDonations())));
api.get('/admin/hospitals', requireAuth, requireRole('admin'), asyncHandler((_req, res) => ok(res, adminService.listHospitals())));
api.get('/admin/blood-banks', requireAuth, requireRole('admin'), asyncHandler((_req, res) => ok(res, adminService.listBloodBanks())));
api.patch('/admin/hospitals/:id/verify', requireAuth, requireRole('admin'), asyncHandler((req, res) => ok(res, adminService.verifyHospital(Number(req.params.id), req.body.verified !== false), 'Updated')));
api.patch('/admin/blood-banks/:id/verify', requireAuth, requireRole('admin'), asyncHandler((req, res) => ok(res, adminService.verifyBloodBank(Number(req.params.id), req.body.verified !== false), 'Updated')));

app.use('/api', api);

// ---- 404 + error handler ----
app.use((req, _res, next) => next(ApiError.notFound(`Route not found: ${req.method} ${req.originalUrl}`)));
app.use((err, _req, res, _next) => {
  const status = err.status || 500;
  if (status >= 500) console.error(err);
  fail(res, status, err.message || 'Internal server error', err.errors);
});

/* ============================================================================
 * 9. START
 * ========================================================================== */

if (require.main === module) {
  app.listen(CONFIG.port, CONFIG.host, () => {
    console.log(`\n🩸 TN Blood Bank API (single-file) running at http://${CONFIG.host}:${CONFIG.port}`);
    console.log(`   Health : http://localhost:${CONFIG.port}/health`);
    console.log(`   Meta   : http://localhost:${CONFIG.port}/api/meta`);
    console.log(`   DB     : ${CONFIG.dbFile}\n`);
  });
}

module.exports = app;
