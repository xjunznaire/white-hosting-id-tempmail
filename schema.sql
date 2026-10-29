PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS mailboxes (
  address TEXT PRIMARY KEY,
  token TEXT NOT NULL,
  created_at INTEGER NOT NULL,
  expires_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS messages (
  id TEXT PRIMARY KEY,
  to_address TEXT NOT NULL,
  from_address TEXT,
  subject TEXT,
  text_body TEXT,
  html_body TEXT,
  received_at INTEGER NOT NULL,
  FOREIGN KEY (to_address) REFERENCES mailboxes(address) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_messages_to_received
ON messages(to_address, received_at DESC);

CREATE INDEX IF NOT EXISTS idx_mailboxes_expiry
ON mailboxes(expires_at);
